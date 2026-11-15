import {describe,it,expect,vi,beforeEach} from "vitest";

vi.mock("../lib/message-ai.server",()=>({callMessageAI:vi.fn()}));
vi.mock("../lib/offer-prompts.server",()=>({offerSystemPrompt:()=>"offer",messagesSystemPrompt:()=>"messages"}));
vi.mock("@/integrations/supabase/client.server",()=>({supabaseAdmin:{from:vi.fn()}}));

import {runDraftChain} from "../lib/offer-drafting.server";
import {callMessageAI} from "../lib/message-ai.server";
import {supabaseAdmin} from "@/integrations/supabase/client.server";

describe("Prompt-only drafting inputs",()=>{
  beforeEach(()=>vi.mocked(callMessageAI).mockReset());
  const context=()=>({from:(table:string)=>{
    const data=table==="user_roles"?[{role:"sales"}]:table==="firms"?{stage:"outreach",name:"Studio",contact_name:"Mira",whatsapp_opt_in:false}:table==="profiles"?{full_name:"Team Shegruh"}:table==="firm_research"?null:[];
    const query:any={then:(resolve:any)=>Promise.resolve({data,error:null}).then(resolve)};
    for(const method of ["select","eq","limit","order","single","maybeSingle","or"])query[method]=()=>query;
    return query;
  }});
  const capture=()=>vi.mocked(supabaseAdmin.from).mockImplementation((()=>({insert:(row:any)=>({select:()=>({single:async()=>({data:{...row,id:"run"},error:null})})})})) as any);
  it("continues after malformed offer output and omitted touches",async()=>{
    capture();vi.mocked(callMessageAI).mockResolvedValueOnce("invalid JSON").mockResolvedValueOnce({request:{},messages:[],skipped:[]});
    const run=await runDraftChain(context(),"user","firm");
    expect(run.output.messages.map(m=>m.touch_id)).toEqual(["OUT-1","OUT-2","OUT-3"]);
    expect(run.output.messages.every(m=>Boolean(m.email?.body)&&Boolean(m.whatsapp?.body))).toBe(true);
    expect(run.output.messages.every(m=>m.whatsapp?.eligible===false)).toBe(true);
    expect(run.warnings.length).toBeGreaterThan(0);
  });
  it("creates Outreach drafts for a Backlog lead without modifying its stage", async()=>{
    capture();
    const base=context();
    const firm={stage:"backlog",name:"Studio",contact_name:"Mira",whatsapp_opt_in:false};
    const sb={from:(table:string)=>table==="firms"?(()=>{const q:any={then:(resolve:any)=>Promise.resolve({data:firm,error:null}).then(resolve)};for(const method of ["select","eq","single"])q[method]=()=>q;return q;})():base.from(table)};
    vi.mocked(callMessageAI).mockImplementation(async(schema:any)=>schema?{request:{},messages:[],skipped:[]}:"invalid JSON");
    const run=await runDraftChain(sb,"user","firm");
    expect(run.stage).toBe("outreach");
    expect(run.output.messages.map(m=>m.touch_id)).toEqual(["OUT-1","OUT-2","OUT-3"]);
    expect(firm.stage).toBe("backlog");
  });
  it("drafts with a do-not-pitch recommendation without changing that send safeguard",async()=>{
    capture();const plan={schema_version:"1.1",stage:"outreach",status:"do_not_pitch",prospect:{},fit:{honest_fit_line:"Poor fit"},stage_offers:[],offer:null,needs_input:[],warnings:[],claims_used:[]};
    vi.mocked(callMessageAI).mockResolvedValueOnce(`Offer\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``).mockResolvedValueOnce({request:{},messages:[],skipped:[]});
    const run=await runDraftChain(context(),"user","firm",{kind:"single"});
    expect(run.output.messages[0]?.email?.body).toBeTruthy();expect(run.offer_plan.status).toBe("do_not_pitch");expect(callMessageAI).toHaveBeenCalledTimes(2);
  });
  it("does not bypass a provider denial or make another request",async()=>{
    capture();vi.mocked(callMessageAI).mockRejectedValueOnce(new Error("Provider access denied"));
    await expect(runDraftChain(context(),"user","firm")).rejects.toThrow("Provider access denied");expect(callMessageAI).toHaveBeenCalledTimes(1);
  });
  it("does not read saved offer settings when loading drafting context",async()=>{
    const tables:string[]=[];
    const sb={from:(table:string)=>{
      tables.push(table);
      const result={data:table==="user_roles"?[{role:"sales"}]:table==="firms"?{stage:"lost"}:null,error:null};
      const query:any={then:(resolve:any)=>Promise.resolve(result).then(resolve)};
      for(const method of ["select","eq","limit","order","single","maybeSingle"])query[method]=()=>query;
      return query;
    }};
    await expect(runDraftChain(sb,"user","firm")).rejects.toThrow("Lost leads have no message drafts");
    expect(tables).toEqual(["user_roles","firms","firm_research","firm_personas","profiles"]);
    expect(tables).not.toContain("offer_catalog_settings");
  });
  it("generates a Discovery contact draft without research, persona or designation",async()=>{
    const plan={schema_version:"1.0",stage:"discovery",status:"needs_input",prospect:{},fit:{},stage_offers:[],offer_for_messages:null,needs_input:["team_size"],warnings:[],claims_used:[]};
    const output={request:{},messages:[{touch_id:"DIS-1",send_after:"Day 0",email:{subject:"Your workflow",subject_alt:"Shegruh",body:"Hi Mira, would a short Shegruh walkthrough be useful?",words:11},whatsapp:null,needs_input:["project"],warnings:[]}],skipped:[]};
    vi.mocked(callMessageAI).mockResolvedValueOnce(`Offer\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``).mockResolvedValueOnce(output);
    let saved:any;
    vi.mocked(supabaseAdmin.from).mockImplementation((()=>({insert:(row:any)=>{saved={...row,id:"run"};return {select:()=>({single:async()=>({data:saved,error:null})})};}})) as any);
    const sb={from:(table:string)=>{
      const data=table==="user_roles"?[{role:"sales"}]:table==="firms"?{stage:"discovery",name:"Studio",contact_name:"Mira",whatsapp_opt_in:false}:table==="firm_contacts"?{name:"Mira",designation:null,email:"mira@example.com"}:table==="profiles"?{full_name:"Team Shegruh"}:table==="firm_research"?null:[];
      const query:any={then:(resolve:any)=>Promise.resolve({data,error:null}).then(resolve)};
      for(const method of ["select","eq","limit","order","single","maybeSingle","or"])query[method]=()=>query;
      return query;
    }};
    const result=await runDraftChain(sb,"user","firm",{contactId:"contact",kind:"single",channels:["email"]});
    expect(result.output.messages[0]?.email?.body).toBe(output.messages[0]?.email?.body);
    expect(result.offer_plan.status).toBe("ok");
    expect(result.needs_input).toEqual([]);
    expect(result.output.messages[0]?.needs_input).toEqual([]);
  });
  it("requests every follow-up by its own touch ID so drafts differ",async()=>{
    capture();
    vi.mocked(callMessageAI).mockImplementation(async(schema:any,_sys:string,user:string)=>{
      if(!schema)return "invalid JSON";
      const touch=JSON.parse(user).touch;
      return {request:{},messages:[{touch_id:touch==="OUT-2"?"OUT":touch,send_after:"",email:{subject:`S ${touch}`,subject_alt:"",body:`Body ${touch}`,words:2},whatsapp:null,needs_input:[],warnings:[]}],skipped:[]};
    });
    const run=await runDraftChain(context(),"user","firm",{channels:["email"]});
    const touches=vi.mocked(callMessageAI).mock.calls.filter(c=>c[0]).map(c=>JSON.parse(c[2] as string).touch);
    expect(touches).toEqual(["OUT-1","OUT-2","OUT-3"]);
    expect(run.output.messages.map(m=>m.email?.body)).toEqual(["Body OUT-1","Body OUT-2","Body OUT-3"]);
  });
  it("passes the saved research brief directly to every message request even if offer parsing fails",async()=>{
    capture();
    const research={notable_projects:["Courtyard House"],pain_points:["Manual BOQ preparation"]};
    const base=context();
    const sb={from:(table:string)=>table==="firm_research"?(()=>{const q:any={then:(resolve:any)=>Promise.resolve({data:{brief:research,sources:["studio website"]},error:null}).then(resolve)};for(const method of ["select","eq","order","limit","maybeSingle"])q[method]=()=>q;return q;})():base.from(table)};
    vi.mocked(callMessageAI).mockImplementation(async(schema:any)=>schema?{request:{},messages:[],skipped:[]}:"invalid JSON");
    await runDraftChain(sb,"user","firm");
    const requests=vi.mocked(callMessageAI).mock.calls.filter(c=>c[0]).map(c=>JSON.parse(c[2] as string));
    expect(requests).toHaveLength(3);
    for(const request of requests)expect(request.research_brief.enrichment).toEqual(research);
    for(const request of requests){
      expect(request.whatsapp_writing.draft_required).toBe(true);
      expect(request.whatsapp_writing.eligibility_applies_to).toBe("sending_only");
    }
  });
});
