import companyKnowledge from "./product/company-knowledge.md?raw";
import offer from "./product/prompts/offer-prompt.md?raw";
import messages from "./product/prompts/product-message-prompt.md?raw";
import {extractPrompt} from "./offer-chain";
// The transport contract stays separate from the short, editable offer guidance.
const offerContract = `\nReturn Part A: one sentence describing the selected offer. Then Part B: one fenced json block with this shape, filled from available facts:
{"schema_version":"1.1","stage":"input stage","status":"ok","prospect":{"firm":{"name":""},"contact":{"name":"","title":"","type":"unknown"}},"fit":{},"stage_offers":[{"stage":"input stage","lead":{"id":"intro_chat","terms_text":""},"supporting":null,"ask_seed":""}],"offer":null,"projects":[],"value_props":[],"facts":{},"needs_input":[],"warnings":[],"claims_used":[]}
Carry useful brief facts into projects, facts and value_props. Use known contact designation. Keep missing fields empty, needs_input and warnings empty. No fit-based drafting block. Product claims must use the C IDs from the feature reference.`;
export const offerSystemPrompt = () => extractPrompt(offer,companyKnowledge) + offerContract;
export const messagesSystemPrompt = () => extractPrompt(messages,companyKnowledge);