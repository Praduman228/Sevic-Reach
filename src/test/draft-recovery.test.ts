import {it,expect,describe} from "vitest";
import {conservativePlan,conservativeMessage} from "../lib/draft-recovery";
import {parseOffer,reviewBlock,type DraftRun} from "../lib/offer-chain";
import {whatsappResearchContext} from "../lib/whatsapp-drafting";

it("accepts the uploaded 1.1 offer handoff and its offer field",()=>{
  const plan=conservativePlan("demo","Studio","Mira","caution");plan.offer={pilot_terms:"free to try on one live project"};
  const parsed=parseOffer(`Card\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``);
  expect(parsed.offer_plan.schema_version).toBe("1.1");expect(parsed.offer_plan.offer?.["pilot_terms"]).toBe("free to try on one live project");
});
it("retains an ineligible WhatsApp draft but prevents sending",()=>{
  const message=conservativeMessage("OUT-1","Studio","Mira","Team Shegruh",["email","whatsapp"],false);
  const run:DraftRun={id:"run",firm_id:"firm",stage:"outreach",contact_id:null,offer_card:"",offer_plan:conservativePlan("outreach","Studio","Mira",""),output:{request:{},messages:[message],skipped:[]},warnings:[],needs_input:[],acknowledged_at:"2026-10-31"};
  expect(message.whatsapp?.body).toBeTruthy();expect(message.whatsapp?.eligible).toBe(false);expect(reviewBlock(run,"whatsapp")).toContain("draft only");expect(reviewBlock(run,"email")).toBe("");
});
import {conservativeMessage as cm} from "../lib/draft-recovery";
describe("Fallback follow-ups",()=>{
  it("uses saved research and a concrete AI action in every WhatsApp fallback without changing email",()=>{
    const research=whatsappResearchContext({notable_projects:["Courtyard House"],design_style:"sustainable design"});
    for(let i=0;i<3;i++){
      const base=cm(`OUT-${i+1}`,"Studio","Mira","Team",["email","whatsapp"],false,i,3);
      const personalised=cm(`OUT-${i+1}`,"Studio","Mira","Team",["email","whatsapp"],false,i,3,research);
      expect(personalised.whatsapp?.body).toContain("Courtyard House");
      expect(personalised.whatsapp?.body).toContain("SheAI");
      expect(personalised.whatsapp?.body).toContain(["editable quotations","starting timeline","create tasks through chat"][i]);
      expect(personalised.whatsapp?.eligible).toBe(false);
      expect(personalised.email).toEqual(base.email);
    }
  });
  it("does not mention a project excluded from outreach",()=>{
    expect(whatsappResearchContext({projects:[{name:"Private House",use_in_outreach:false}]}).project).toBeUndefined();
  });
  it("never repeats the same wording across a cadence",()=>{
    const bodies=[0,1,2,3].map(i=>cm(`DIS-${i+1}`,"Studio","Mira","Team",["email","whatsapp"],false,i,4));
    expect(new Set(bodies.map(b=>b.email?.body)).size).toBe(4);
    expect(new Set(bodies.map(b=>b.whatsapp?.body)).size).toBe(4);
  });
});
