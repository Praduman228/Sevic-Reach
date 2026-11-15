import {callMessageAI} from "./message-ai.server";
import {offerSystemPrompt,messagesSystemPrompt} from "./offer-prompts.server";
import {availableFactsPolicy,applyAvailableFacts,defaultCatalog,mappedStage,TOUCHES,parseOffer,messagesOutputSchema,collectReview,validateOfferCatalog,reviewBlock,type DraftRun,type MessageOutput} from "./offer-chain";
import {supabaseAdmin} from "@/integrations/supabase/client.server";
import {messagingStage,type Stage} from "./crm";
import {zodToJsonSchema} from "zod-to-json-schema";
import {conservativePlan,conservativeMessage} from "./draft-recovery";
import {whatsappDraftInstructions,whatsappResearchContext} from "./whatsapp-drafting";

type Sb={from:(table:string)=>any};
export async function runDraftChain(sb:Sb,userId:string,firmId:string,options:{contactId?:string|undefined;channels?:Array<"email"|"whatsapp">;touchId?:string;kind?:string;hint?:string|undefined;siblings?:unknown;stage?:Stage;language?:"en"|"hinglish"|undefined;motto?:string|undefined}={}):Promise<DraftRun>{
  // Authorization precedes any privileged write; ordinary reads use the caller's client.
  const membership=await sb.from("user_roles").select("role").eq("user_id",userId).limit(1);
  if(membership.error||!membership.data?.length) throw new Error("Team access required");
  const [f,r,p,c,s]=await Promise.all([
    sb.from("firms").select("*").eq("id",firmId).single(),
    sb.from("firm_research").select("brief,sources").eq("firm_id",firmId).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    sb.from("firm_personas").select("stage,persona").eq("firm_id",firmId),
    options.contactId?sb.from("firm_contacts").select("*").eq("firm_id",firmId).eq("id",options.contactId).single():Promise.resolve({data:null}),
    sb.from("profiles").select("full_name").eq("id",userId).single(),
  ]);
  for(const result of [f,r,p,c,s]) if(result.error) throw new Error(result.error.message);
  const firm=f.data;
  const stage=messagingStage(options.stage??firm.stage as Stage);
  if(stage==="lost") throw new Error("Lost leads have no message drafts");
  const notes=p.data?.find((v:any)=>v.stage===stage)?.persona??"";
  const contact=c.data??{name:firm.contact_name,title:null,email:firm.email,phone:firm.phone};
  const history=async(table:string,addressField:string,address:string|null)=>{
    let q=sb.from(table).select("*").eq("firm_id",firmId).order("created_at",{ascending:false}).limit(16);
    if(options.contactId){if(!address)return [];q=table==="email_messages"?q.or(`to_email.eq.${address},from_email.eq.${address}`):q.eq(addressField,address);}
    const result=await q;if(result.error)throw new Error(result.error.message);return result.data??[];
  };
  const [email,whatsapp]=await Promise.all([history("email_messages","to_email",contact.email),history("whatsapp_messages","phone",contact.phone)]);
  const replied=[...email,...whatsapp].some(m=>m.direction==="in");
  const catalog=defaultCatalog();
  const source=firm.source==="referral"?"referral":firm.source==="event"?"event":"cold";
  const pipelineStage=mappedStage(stage);
  let recordedContext:Record<string,any>={};
  if(notes.trim().startsWith("{")){try{recordedContext=JSON.parse(notes);}catch{ /* Plain persona notes remain usable without invented structured facts. */ }}
  const stage_context={...recordedContext,source,whatsapp_consent:firm.whatsapp_opt_in===true,previous_messages:[...email.map((m:any)=>({channel:"email",sent_on:m.created_at,summary:m.body,replied:m.direction==="in"})),...whatsapp.map((m:any)=>({channel:"whatsapp",sent_on:m.created_at,summary:m.body,replied:m.direction==="in"}))],salesperson_notes:notes,personas_by_stage:p.data??[],crm_stage:stage,customer:recordedContext["customer"]??(stage==="paid"||stage==="customer"?{notes}:undefined)};
  const briefRaw=r.data?.brief??{};
  const company=briefRaw.company??{name:firm.name,type:null,city:firm.city,team_size:firm.team_size};
  const brief=briefRaw.company?briefRaw:{company,projects:(briefRaw.notable_projects??[]).map((name:string,i:number)=>({id:`P${i+1}`,name,use_in_outreach:true,complexity_notes:[]})),appreciation_points:[],hooks:[],do_not_mention:[],pain_hypotheses:briefRaw.pain_points??[],recommended:{whatsapp_allowed:firm.whatsapp_opt_in===true},legacy_enrichment:briefRaw,sources:r.data?.sources??[]};
  const sender={name:s.data?.full_name??"",title:""};
  const today=new Date().toISOString().slice(0,10);
  const currentNotes={...(recordedContext[pipelineStage]??recordedContext[`${pipelineStage}_notes`]??recordedContext),...(notes?{salesperson:notes}:{})};
  const campaignMotto=options.motto?.trim()||"";
  const offerInput={today,stage:pipelineStage,contact:{name:contact.name??"",title:contact.designation??contact.title??"",type:null},brief:briefRaw.company?brief:null,brief_text:briefRaw.company?null:JSON.stringify({firm:company,enrichment:briefRaw,sources:r.data?.sources??[]}),notes:{...currentNotes,...(campaignMotto?{campaign_motto:campaignMotto}:{})}};
  const raw=await callMessageAI(null,offerSystemPrompt(),JSON.stringify(offerInput));
  let offer_plan;let offer_card="";
  try {const parsed=parseOffer(String(raw));offer_plan=parsed.offer_plan;offer_card=parsed.offer_card;
    if(offer_plan.stage!==pipelineStage)throw new Error("Stage mismatch");
    validateOfferCatalog(offer_plan,catalog);
  } catch {offer_plan=conservativePlan(pipelineStage,firm.name,contact.name??"","Offer planning output could not be validated; drafting continued with confirmed product capabilities and default offers.");}
  applyAvailableFacts(offer_plan);
  let output:MessageOutput={request:{pipeline_stage:pipelineStage},messages:[],skipped:[]};
  const channels=options.channels??["email","whatsapp"];
  const touches=options.touchId?[options.touchId]:(options.kind==="single"||pipelineStage==="pilot"||pipelineStage==="customer"?[(TOUCHES[stage]?.[0]?.id??"")]:TOUCHES[stage]?.map(t=>t.id)??[]);
  {
    // Each touch is requested by its own ID: stage-code (full cadence) requests were sometimes rejected,
    // which left every follow-up on the same fallback text. Per-touch calls keep each follow-up distinct.
    const generateTouch=async(touch:string):Promise<MessageOutput>=>{
      const input={touch,sender,research_brief:{firm:company,enrichment:briefRaw,sources:r.data?.sources??[]},contact:{type:(offer_plan.prospect["contact"] as any)?.type??"unknown",first_name:contact.name??"",title:contact.designation??"",tone:"warm_professional",notes},plan:offer_plan,notes:{...currentNotes,...(campaignMotto?{campaign_motto:campaignMotto}:{}),...(options.hint?{draft_direction:options.hint}:{}),...(options.siblings?{other_drafts:options.siblings}:{}),...(touches.length>1?{cadence:{touch_ids:touches,this_touch:touch,instruction:"Write only this touch. Each touch in the cadence must have a different angle, opening, subject and wording; never repeat another touch."}}:{})},history:stage_context.previous_messages,settings:{today,channels,language:options.language??"en",source,whatsapp_consent:firm.whatsapp_opt_in===true,slots:[]}};
      if(channels.includes("whatsapp"))Object.assign(input,{whatsapp_writing:whatsappDraftInstructions});
      try {
        const result=await callMessageAI(zodToJsonSchema(messagesOutputSchema,{$refStrategy:"none"}),messagesSystemPrompt(),JSON.stringify(input));
        const parsed=messagesOutputSchema.safeParse(result);
        if(!parsed.success){offer_plan.warnings.push(`${touch}: message output had a format issue; conservative draft supplied for review.`);return {request:{},messages:[],skipped:[]};}
        const data=parsed.data;
        // A single-touch request answered under a stage code or variant ID still belongs to the requested touch.
        if(data.messages.length===1&&data.messages[0]&&data.messages[0].touch_id!==touch&&!touches.includes(data.messages[0].touch_id))data.messages[0].touch_id=touch;
        return data;
      } catch(error) {
        // Only structured-output decoding is recoverable locally. Never hide provider/auth/network denials or replay them.
        if(!(error instanceof Error)||error.name!=="AI_NoObjectGeneratedError")throw error;
        offer_plan.warnings.push(`${touch}: message output could not be decoded; conservative draft supplied for review.`);
        return {request:{},messages:[],skipped:[]};
      }
    };
    const results=await Promise.all(touches.map(generateTouch));
    output={request:{...(results[0]?.request??{}),pipeline_stage:pipelineStage},messages:results.flatMap(r=>r.messages),skipped:results.flatMap(r=>r.skipped),warnings:results.flatMap(r=>r.warnings??[])};
    const seen=new Set<string>();
    const deterministicEligible=firm.whatsapp_opt_in===true;
    for(const m of output.messages){
      if(seen.has(m.touch_id)){offer_plan.warnings.push(`Duplicate ${m.touch_id} omitted`);continue;}seen.add(m.touch_id);
      // DIS-0 is event-driven; never persist it as a stage-entry follow-up.
      if(!touches.includes(m.touch_id)) {output.skipped.push({touch_id:m.touch_id,reason:"Not requested; event context required"});continue;}
      if(m.whatsapp){m.whatsapp.eligible=firm.whatsapp_opt_in===true;if(m.whatsapp.eligible)m.whatsapp.reason_if_not=null;else m.whatsapp.reason_if_not="No WhatsApp opt-in recorded; draft only";}
      if(!channels.includes("whatsapp"))m.whatsapp=null;
      if(!channels.includes("email"))m.email=null;
    }
    output.messages=touches.map((touch,index)=>{
      const fallback=conservativeMessage(touch,firm.name,contact.name??"",sender.name,channels,deterministicEligible,index,touches.length,whatsappResearchContext(briefRaw));
      const message=output.messages.find(m=>m.touch_id===touch);
      if(!message)return fallback;
      if(channels.includes("email")&&!message.email?.body){message.email=fallback.email;message.warnings.push(...fallback.warnings);}
      if(channels.includes("whatsapp")&&!message.whatsapp?.body){message.whatsapp={...fallback.whatsapp,eligible:firm.whatsapp_opt_in===true,reason_if_not:firm.whatsapp_opt_in===true?null:"No WhatsApp opt-in recorded; draft only"} as typeof message.whatsapp;message.warnings.push(...fallback.warnings);}
      return message;
    });
    if(replied)offer_plan.warnings.push("A reply is recorded. Drafts remain available; automatic follow-ups still stop on replies.");
  }
  applyAvailableFacts(offer_plan,output);
  const review=collectReview(offer_plan,output);
  const {data:saved,error}=await supabaseAdmin.from("ai_draft_runs").insert({firm_id:firmId,contact_id:options.contactId??null,stage,kind:options.kind??"sequence",offer_card,offer_plan:offer_plan as never,output:output as never,...review,created_by:userId}).select("*").single();
  if(error)throw new Error(error.message);
  return saved as unknown as DraftRun;
}

export async function persistSequenceRun(sb:Sb,userId:string,firmId:string,contactId?:string,touchId?:string,motto?:string){
  const run=await runDraftChain(sb,userId,firmId,{contactId,...(touchId?{touchId}: {}),...(motto?.trim()?{motto}:{})});
  const stage=run.stage as Stage;
  const table=contactId?"contact_sequence_messages":"sequence_messages";
  let q=sb.from(table).select("*").eq("firm_id",firmId).eq("stage",stage);if(contactId)q=q.eq("contact_id",contactId);
  const existing=await q;if(existing.error)throw new Error(existing.error.message);
  const touches=TOUCHES[stage]??[];let count=0;
  for(const message of run.output.messages){
    const step=touches.findIndex(t=>t.id===message.touch_id);if(step<0)throw new Error("Unknown touch ID");
    const old=existing.data?.find((m:any)=>m.ai_touch_id===message.touch_id||(!m.ai_touch_id&&m.step===step));
    const emailEditable=!old||["draft","failed","skipped"].includes(old.email_status)&&!old.email_sent_at;
    const waEditable=!old||["draft","failed","skipped"].includes(old.whatsapp_status)&&!old.whatsapp_sent_at;
    if(!emailEditable&&!waEditable)continue;
    const patch={ai_touch_id:message.touch_id,...(emailEditable?{email_subject:message.email?.subject??"",email_body:message.email?.body??"",email_status:message.email?.body?"draft":"skipped",email_ai_run_id:run.id}:{}),...(waEditable?{whatsapp_body:message.whatsapp?.body??"",whatsapp_status:message.whatsapp?.body?"draft":"skipped",whatsapp_ai_run_id:run.id}:{}),updated_at:new Date().toISOString()};
    if(old){const {error}=await supabaseAdmin.from(table).update(patch).eq("id",old.id).eq("updated_at",old.updated_at);if(error)throw new Error(error.message);}
    else{const {error}=await (supabaseAdmin as unknown as Sb).from(table).insert({...patch,firm_id:firmId,stage,step,label:message.touch_id,offset_minutes:step===0?(touches[step]?.minutes??0):(touches[step]?.minutes??0)-(touches[0]?.minutes??0),...(contactId?{contact_id:contactId,email_contact_ids:[contactId],whatsapp_contact_ids:[contactId]}:{}),whatsapp_template:step===0?"shegruhmessage":"outreach1",status:"draft"});if(error)throw new Error(error.message);}
    count++;
  }
  return {count,run};
}

export async function assertDraftSend(sb:Sb,firmId:string,channel:"email"|"whatsapp",body:string,runId?:string){
  let query=sb.from("ai_draft_runs").select("*").eq("firm_id",firmId).order("created_at",{ascending:false});
  if(runId)query=query.eq("id",runId);
  const {data:runs,error}=await query;if(error)throw new Error(error.message);
  if(runId&&!runs?.length)throw new Error("AI review not found for this lead");
  const run=runId?runs?.[0]:runs?.find((r:any)=>(r.output?.messages??[]).some((m:any)=>m[channel]?.body?.trim()===body.trim()));
  if(!run)return;
  const message=run.output?.messages?.find((m:any)=>m[channel]?.body?.trim()===body.trim())??run.output?.messages?.[0];
  let consent=false;
  if(channel==="whatsapp"){
    const {data:firm,error:firmError}=await sb.from("firms").select("whatsapp_opt_in").eq("id",firmId).single();
    if(firmError)throw new Error(firmError.message);
    consent=firm.whatsapp_opt_in===true;
  }
  const block=reviewBlock(run as DraftRun,channel,message?.touch_id,consent);if(block)throw new Error(block);
}