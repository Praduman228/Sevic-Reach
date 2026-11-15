import type {OfferPlan,MessageOutput} from "./offer-chain";
import {fallbackWhatsApp,type WhatsAppResearchContext} from "./whatsapp-drafting";

/** Local recovery never calls another provider or retries a refused request. */
export function conservativePlan(stage:string,firmName:string,contactName:string,warning:string):OfferPlan {
  return {schema_version:"1.1",stage,status:"ok",prospect:{firm:{name:firmName},contact:{name:contactName,type:"unknown"}},fit:{class:"unclear"},stage_offers:[],offer:null,needs_input:[],warnings:[warning],claims_used:["C1","C7","C14"],projects:[],facts:{appreciation_points:[],hooks:[],triggers:[],channels:{whatsapp_allowed:false}},who_we_are:{descriptor:"interior design and architecture firms"},proof:{assets:[]}};
}

/** Fallback wording differs by position so a cadence never repeats the same text. */
export function conservativeMessage(touch:string,firmName:string,contactName:string,senderName:string,channels:Array<"email"|"whatsapp">,eligible:boolean,position=0,total=1,research:WhatsAppResearchContext={}):MessageOutput["messages"][number] {
  const greeting=contactName.trim()?`Hi ${contactName.trim()},`:"Hello,";
  const sign=senderName.trim()||"Team Shegruh";
  const ask=touch.startsWith("NUR")?"Would a short conversation be useful this week or next?":touch.startsWith("CUS")||touch.startsWith("PIL")?"Would a short walkthrough of your project workflow be helpful this week or next?":"Could we talk for 20 minutes this week or next to see whether this is relevant to your team?";
  const variants=[
    {subject:`A conversation with ${firmName}`,email:`I’m reaching out to ${firmName}. Coordinating project tasks and keeping updates clear typically takes care and attention, alongside the work itself.\n\nShegruh is built for interior design and architecture firms, bringing leads, quotations, project plans, site reports and accounts into one place. Its planner and tracker keep tasks connected to the people responsible, so the team has a shared view of the work.\n\n${ask}`,wa:`Shegruh brings project plans, tasks and site reports into one place for interior design and architecture firms. ${ask}`},
    {subject:"One quick question",email:`Following up on my earlier note with one question: when an enquiry comes in, how does ${firmName} keep track of follow-ups, quotations and site visits today?\n\nMany design studios spread this across WhatsApp, spreadsheets and memory. Shegruh keeps it in one place, so nothing slips between the first call and handover.\n\nHappy to show you how it works if that sounds useful.`,wa:`Quick follow-up with one question: how does ${firmName} keep track of enquiries, quotations and site visits today? Shegruh keeps these in one place for design studios. Happy to show you if useful.`},
    {subject:`An AI starting point for ${firmName}`,email:`For ${firmName}, a practical way to explore Shegruh is with one quotation: SheAI, our AI assistant, drafts editable lines from reference images and a brief. Your team reviews and adjusts the result.\n\nWould trying that on a room or project be useful?`,wa:`Would an AI-drafted quotation be a useful starting point for ${firmName}? SheAI drafts editable lines from reference images and a brief, and your team reviews the result.`},
    {subject:`Checking in with ${firmName}`,email:`Checking in to see whether coordinating projects and client updates is still something ${firmName} is thinking about.\n\nIf it helps, I can share a short example of how studios use Shegruh to keep tasks, site reports and approvals in one place.\n\n${ask}`,wa:`Checking in: would a short example of how studios use Shegruh for tasks, site reports and approvals be useful for ${firmName}?`},
  ];
  const nonFinal=[variants[0],variants[1],variants[3]];
  const v=(total>1&&position===total-1?variants[2]:nonFinal[position%nonFinal.length])??variants[0];
  if(!v)throw new Error("No conservative draft variant available");
  const body=`${greeting}\n\n${v.email}\n\nWarm regards,\n${sign}`;
  const wa=fallbackWhatsApp(firmName,contactName,senderName,position,research);
  return {touch_id:touch,send_after:"",email:channels.includes("email")?{subject:v.subject,subject_alt:"A shared view of project work",body,words:body.split(/\s+/).length}:null,whatsapp:channels.includes("whatsapp")?{eligible,reason_if_not:eligible?null:"WhatsApp consent or eligibility is not recorded; draft only",body:wa,words:wa.split(/\s+/).length}:null,needs_input:[],warnings:["Conservative draft: prompt output for this touch was incomplete; review wording before sending."],claims_used:["C1","C7"],personalization:{level:"L1"}};
}
