import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  FileCode,
  FileText,
  Globe,
  KeyRound,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  Save,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserRole, useCurrentUserRole } from "@/lib/auth-role";
import {
  getIntegrationStatus,
  saveAiConfig,
  saveFirecrawlConfig,
  saveGupshupConfig,
  saveZohoConfig,
} from "@/lib/integrations.functions";
import {
  getCompanyConfig,
  saveCompanyConfig,
} from "@/lib/company.functions";
import {
  addTeamMember,
  removeTeamMember,
  resetMemberPassword,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    let isAdmin = context.isAdmin;
    if (typeof isAdmin !== "boolean") {
      let userId: string | undefined = context.user?.id;
      if (!userId) {
        const { data } = await supabase.auth.getUser();
        userId = data.user?.id;
      }
      if (!userId) {
        throw redirect({ to: "/auth" });
      }
      const roleInfo = await fetchUserRole(userId);
      isAdmin = roleInfo.isAdmin;
    }
    if (!isAdmin) {
      throw redirect({ to: "/board" });
    }
  },
  head: () => ({
    meta: [
      { title: "Admin Center — Sevic Reach" },
      { name: "description", content: "Configure company prompts, messaging integrations, and team accounts." },
      { property: "og:title", content: "Admin Center — Sevic Reach" },
      { property: "og:description", content: "Configure company prompts, messaging integrations, and team accounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const context = Route.useRouteContext();
  const user = context.user;
  const qc = useQueryClient();

  const { data: roleInfo, isLoading: roleLoading } = useCurrentUserRole(user?.id);
  const isAdmin = roleInfo?.isAdmin ?? context.isAdmin;

  // Server functions
  const fetchStatus = useServerFn(getIntegrationStatus);
  const saveGupshup = useServerFn(saveGupshupConfig);
  const saveFirecrawl = useServerFn(saveFirecrawlConfig);
  const saveZoho = useServerFn(saveZohoConfig);
  const saveAi = useServerFn(saveAiConfig);

  const fetchPrompts = useServerFn(getCompanyConfig);
  const savePrompts = useServerFn(saveCompanyConfig);

  const addMemberFn = useServerFn(addTeamMember);
  const removeMemberFn = useServerFn(removeTeamMember);
  const resetPasswordFn = useServerFn(resetMemberPassword);

  // Queries
  const { data: status, refetch: refetchStatus, isFetching: statusFetching } = useQuery({
    queryKey: ["integration_status"],
    queryFn: async () => fetchStatus(),
    enabled: Boolean(isAdmin),
  });

  const { data: companyPrompts, refetch: refetchPrompts, isFetching: promptsFetching } = useQuery({
    queryKey: ["company_prompts"],
    queryFn: async () => fetchPrompts(),
    enabled: Boolean(isAdmin),
  });

  const { data: teamData, refetch: refetchTeam, isFetching: teamFetching } = useQuery({
    queryKey: ["admin_team_roster"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, created_at").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roles = r.data ?? [];
      return (p.data ?? []).map((m) => ({
        ...m,
        role: roles.find((x) => x.user_id === m.id)?.role ?? "sales",
      }));
    },
    enabled: Boolean(isAdmin),
  });

  // State: Company Configuration prompts
  const [knowledgeText, setKnowledgeText] = useState("");
  const [researchText, setResearchText] = useState("");
  const [messageText, setMessageText] = useState("");
  const [savingPromptKey, setSavingPromptKey] = useState<string | null>(null);

  useEffect(() => {
    if (companyPrompts) {
      setKnowledgeText(companyPrompts.companyKnowledge);
      setResearchText(companyPrompts.researchPrompt);
      setMessageText(companyPrompts.messagePrompt);
    }
  }, [companyPrompts]);

  // State: Integrations forms
  const [gupshupForm, setGupshupForm] = useState({ apiKey: "", appName: "", sourceNumber: "" });
  const [gupshupSaving, setGupshupSaving] = useState(false);
  const [showGupshupKey, setShowGupshupKey] = useState(false);

  const [firecrawlForm, setFirecrawlForm] = useState({ apiKey: "" });
  const [firecrawlSaving, setFirecrawlSaving] = useState(false);
  const [showFirecrawlKey, setShowFirecrawlKey] = useState(false);

  const [zohoForm, setZohoForm] = useState({ clientId: "", clientSecret: "", refreshToken: "", senderEmail: "", region: "in" });
  const [zohoSaving, setZohoSaving] = useState(false);
  const [showZohoSecret, setShowZohoSecret] = useState(false);
  const [showZohoRefresh, setShowZohoRefresh] = useState(false);

  const [aiForm, setAiForm] = useState({ apiKey: "" });
  const [aiSaving, setAiSaving] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);

  // State: Team form
  const [teamForm, setTeamForm] = useState({ fullName: "", email: "", password: "", role: "sales" as "admin" | "sales" });
  const [addingMember, setAddingMember] = useState(false);

  // Actions: Prompts
  async function handleSaveKnowledge() {
    setSavingPromptKey("knowledge");
    try {
      await savePrompts({ data: { companyKnowledge: knowledgeText } });
      toast.success("Company Product Knowledge saved successfully");
      qc.invalidateQueries({ queryKey: ["company_prompts"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPromptKey(null);
    }
  }

  async function handleSaveResearch() {
    setSavingPromptKey("research");
    try {
      await savePrompts({ data: { researchPrompt: researchText } });
      toast.success("Research Brief System Prompt saved successfully");
      qc.invalidateQueries({ queryKey: ["company_prompts"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPromptKey(null);
    }
  }

  async function handleSaveMessage() {
    setSavingPromptKey("message");
    try {
      await savePrompts({ data: { messagePrompt: messageText } });
      toast.success("Outreach Message System Prompt saved successfully");
      qc.invalidateQueries({ queryKey: ["company_prompts"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPromptKey(null);
    }
  }

  // Actions: Integrations
  async function handleSaveGupshup(e: React.FormEvent) {
    e.preventDefault();
    setGupshupSaving(true);
    try {
      await saveGupshup({
        data: {
          apiKey: gupshupForm.apiKey,
          appName: gupshupForm.appName || status?.gupshup.appName || "",
          sourceNumber: gupshupForm.sourceNumber || status?.gupshup.sourceNumber || "",
        },
      });
      toast.success("WhatsApp (Gupshup) credentials saved securely to .env");
      setGupshupForm({ apiKey: "", appName: "", sourceNumber: "" });
      qc.invalidateQueries({ queryKey: ["integration_status"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGupshupSaving(false);
    }
  }

  async function handleSaveFirecrawl(e: React.FormEvent) {
    e.preventDefault();
    setFirecrawlSaving(true);
    try {
      await saveFirecrawl({ data: { apiKey: firecrawlForm.apiKey } });
      toast.success("Firecrawl API key saved securely to .env");
      setFirecrawlForm({ apiKey: "" });
      qc.invalidateQueries({ queryKey: ["integration_status"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setFirecrawlSaving(false);
    }
  }

  async function handleSaveZoho(e: React.FormEvent) {
    e.preventDefault();
    setZohoSaving(true);
    try {
      await saveZoho({
        data: {
          clientId: zohoForm.clientId,
          clientSecret: zohoForm.clientSecret,
          refreshToken: zohoForm.refreshToken,
          senderEmail: zohoForm.senderEmail || status?.zoho.senderEmail || "",
          region: zohoForm.region || "in",
        },
      });
      toast.success("Zoho Mail credentials saved securely to .env");
      setZohoForm({ clientId: "", clientSecret: "", refreshToken: "", senderEmail: "", region: "in" });
      qc.invalidateQueries({ queryKey: ["integration_status"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setZohoSaving(false);
    }
  }

  async function handleSaveAi(e: React.FormEvent) {
    e.preventDefault();
    setAiSaving(true);
    try {
      await saveAi({ data: { apiKey: aiForm.apiKey } });
      toast.success("AI Gateway key saved securely to .env");
      setAiForm({ apiKey: "" });
      qc.invalidateQueries({ queryKey: ["integration_status"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAiSaving(false);
    }
  }

  // Actions: Team
  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddingMember(true);
    try {
      await addMemberFn({ data: teamForm });
      toast.success(`${teamForm.email} added with role: ${teamForm.role}`);
      setTeamForm({ fullName: "", email: "", password: "", role: "sales" });
      qc.invalidateQueries({ queryKey: ["admin_team_roster"] });
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAddingMember(false);
    }
  }

  async function handleResetPassword(memberEmail: string, memberId: string) {
    const pw = prompt(`New password for ${memberEmail} (min 8 characters):`);
    if (!pw) return;
    try {
      await resetPasswordFn({ data: { userId: memberId, password: pw } });
      toast.success(`Password updated for ${memberEmail}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleRemoveMember(memberEmail: string, memberId: string) {
    if (!confirm(`Are you sure you want to remove ${memberEmail}? They will immediately lose access.`)) return;
    try {
      await removeMemberFn({ data: { userId: memberId } });
      toast.success(`Removed ${memberEmail}`);
      qc.invalidateQueries({ queryKey: ["admin_team_roster"] });
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (!roleLoading && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-destructive/10 p-4 text-destructive mb-4">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Access Restricted</h1>
        <p className="text-muted-foreground mt-2 max-w-md">
          Only administrators can visit the Admin Center. Your account does not have administrator privileges.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/board">Return to Pipeline</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">Admin Center</h1>
            <Badge variant="default" className="gap-1 bg-primary text-primary-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage company configuration prompts, service integrations, environment keys, and workspace team accounts.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetchStatus();
            refetchPrompts();
            refetchTeam();
          }}
          disabled={statusFetching || promptsFetching || teamFetching}
          className="gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${statusFetching || promptsFetching || teamFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="company" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            <span>Company Configuration</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5">
            <Server className="h-4 w-4" />
            <span>Integrations</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5">
            <Users className="h-4 w-4" />
            <span>Team Members</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Company Configuration */}
        <TabsContent value="company" className="space-y-6">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Customizable Company & AI Prompts</p>
              <p className="mt-0.5 text-xs">
                These prompts configure how the AI understands your company&apos;s product offerings, assesses prospect fit from web research, and drafts cold outreach and follow-up copy. Adapt them for any company or business model.
              </p>
            </div>
          </div>

          {/* 1. Company Product Profile & Features (company-knowledge.md) */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Company Product Profile & Capabilities
                      <Badge variant="outline" className="text-xs font-mono">
                        company-knowledge.md
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Approved facts, modules, and feature claims (C1–C22) for your company. The AI references these as ground-truth facts and will not invent unsupported capabilities.
                    </CardDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveKnowledge}
                  disabled={savingPromptKey === "knowledge"}
                  className="gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingPromptKey === "knowledge" ? "Saving…" : "Save Product Profile"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={16}
                value={knowledgeText}
                onChange={(e) => setKnowledgeText(e.target.value)}
                placeholder="# Company Features&#10;&#10;Describe your company's product facts, practice capabilities, and value propositions..."
                className="font-mono text-xs leading-relaxed"
              />
            </CardContent>
            <CardFooter className="flex justify-between text-xs text-muted-foreground border-t pt-3">
              <span>Generic product knowledge file — replaces company-specific hardcoded facts.</span>
              <span>{knowledgeText.length} characters · {knowledgeText.split(/\r\n|\r|\n/).length} lines</span>
            </CardFooter>
          </Card>

          {/* 2. Research Brief System Prompt */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Research Brief System Prompt
                      <Badge variant="outline" className="text-xs font-mono">
                        research-brief-prompt.md
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Instructions for evaluating prospect web data, scoring fit (100-point rubric), and assembling research dossiers before drafting.
                    </CardDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveResearch}
                  disabled={savingPromptKey === "research"}
                  className="gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingPromptKey === "research" ? "Saving…" : "Save Research Prompt"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={16}
                value={researchText}
                onChange={(e) => setResearchText(e.target.value)}
                placeholder="=== PROMPT START ===&#10;Role: You are a B2B sales researcher..."
                className="font-mono text-xs leading-relaxed"
              />
            </CardContent>
            <CardFooter className="flex justify-between text-xs text-muted-foreground border-t pt-3">
              <span>Contains prompt markers, fit scoring anchors, and data extraction instructions.</span>
              <span>{researchText.length} characters · {researchText.split(/\r\n|\r|\n/).length} lines</span>
            </CardFooter>
          </Card>

          {/* 3. Outreach Message System Prompt */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Outreach Message System Prompt
                      <Badge variant="outline" className="text-xs font-mono">
                        product-message-prompt.md
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Rules and tone guidelines for drafting initial cold emails, follow-up cadences, and WhatsApp outreach messages.
                    </CardDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveMessage}
                  disabled={savingPromptKey === "message"}
                  className="gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savingPromptKey === "message" ? "Saving…" : "Save Message Prompt"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={16}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="=== PROMPT START ===&#10;Write a short, warm, appreciation-first message..."
                className="font-mono text-xs leading-relaxed"
              />
            </CardContent>
            <CardFooter className="flex justify-between text-xs text-muted-foreground border-t pt-3">
              <span>Enforces message length, conversational style, and channel constraints.</span>
              <span>{messageText.length} characters · {messageText.split(/\r\n|\r|\n/).length} lines</span>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* TAB 2: Integrations */}
        <TabsContent value="integrations" className="space-y-6">
          {/* Status summary pills */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">WhatsApp (Gupshup)</CardTitle>
                <MessageSquare className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                {status?.gupshup.isConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3" />
                    Ready to Send
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    {status?.gupshup.missingFields.length} Missing Field{status?.gupshup.missingFields.length === 1 ? "" : "s"}
                  </Badge>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {status?.gupshup.isConfigured
                    ? `Sender: ${status.gupshup.sourceNumber || "Configured"}`
                    : "Missing credentials needed to send messages"}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Lead Enrichment (Firecrawl)</CardTitle>
                <Globe className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                {status?.firecrawl.isConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3" />
                    Ready to Research
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    Missing API Key
                  </Badge>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {status?.firecrawl.isConfigured ? `Key: ${status.firecrawl.apiKeyMasked}` : "Cannot run automated web search"}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Email Dispatch (Zoho)</CardTitle>
                <Mail className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                {status?.zoho.isConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    {status?.zoho.missingFields.length} Missing Field{status?.zoho.missingFields.length === 1 ? "" : "s"}
                  </Badge>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {status?.zoho.isConfigured ? status.zoho.senderEmail : "Bulk & sequence email delivery"}
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">AI Drafting Gateway</CardTitle>
                <Bot className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                {status?.ai.isConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 gap-1 text-xs">
                    <CheckCircle2 className="h-3 w-3" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 gap-1 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    Missing AI_API_KEY
                  </Badge>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {status?.ai.isConfigured ? "Draft generation enabled" : "AI message and brief generation"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Gupshup WhatsApp Card */}
          <Card className={!status?.gupshup.isConfigured ? "border-amber-500/40" : ""}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">WhatsApp via Gupshup</CardTitle>
                    <CardDescription>
                      Required to send WhatsApp intro messages, sequence follow-ups, and receive inbound replies.
                    </CardDescription>
                  </div>
                </div>
                {status?.gupshup.isConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Ready to Send
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Missing Credentials
                  </Badge>
                )}
              </div>

              {!status?.gupshup.isConfigured && status?.gupshup.missingFields && (
                <div className="mt-3 rounded-md bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-semibold mb-1">Missing environment variables needed to send messages:</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {status.gupshup.missingFields.map((f) => (
                      <code key={f} className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                        {f}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveGupshup} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="gupshupApiKey" className="flex items-center justify-between">
                      <span>Gupshup API Key</span>
                      {status?.gupshup.apiKeyMasked && (
                        <span className="text-[11px] text-muted-foreground">
                          Current: {status.gupshup.apiKeyMasked}
                        </span>
                      )}
                    </Label>
                    <div className="relative">
                      <Input
                        id="gupshupApiKey"
                        type={showGupshupKey ? "text" : "password"}
                        required={!status?.gupshup.apiKeyMasked}
                        placeholder={status?.gupshup.apiKeyMasked ? "Leave blank to keep current key" : "Enter GUPSHUP_API_KEY"}
                        value={gupshupForm.apiKey}
                        onChange={(e) => setGupshupForm({ ...gupshupForm, apiKey: e.target.value })}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGupshupKey(!showGupshupKey)}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        {showGupshupKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="gupshupAppName">App Name (<code className="text-[10px]">GUPSHUP_APP_NAME</code>)</Label>
                    <Input
                      id="gupshupAppName"
                      type="text"
                      required
                      placeholder="e.g. shegruh"
                      defaultValue={status?.gupshup.appName || ""}
                      value={gupshupForm.appName || status?.gupshup.appName || ""}
                      onChange={(e) => setGupshupForm({ ...gupshupForm, appName: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="gupshupSource">Sender Number (<code className="text-[10px]">GUPSHUP_SOURCE_NUMBER</code>)</Label>
                    <Input
                      id="gupshupSource"
                      type="text"
                      required
                      placeholder="e.g. 919876543210 (digits only)"
                      defaultValue={status?.gupshup.sourceNumber || ""}
                      value={gupshupForm.sourceNumber || status?.gupshup.sourceNumber || ""}
                      onChange={(e) => setGupshupForm({ ...gupshupForm, sourceNumber: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={gupshupSaving} className="gap-1.5">
                    <Save className="h-4 w-4" />
                    {gupshupSaving ? "Saving to .env…" : "Save WhatsApp Credentials"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Firecrawl Lead Enrichment Card */}
          <Card className={!status?.firecrawl.isConfigured ? "border-amber-500/40" : ""}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Lead Enrichment via Firecrawl</CardTitle>
                    <CardDescription>
                      Automatically researches architecture firms from their websites to extract team size, focus areas, and portfolios for personalized research briefs.
                    </CardDescription>
                  </div>
                </div>
                {status?.firecrawl.isConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Ready to Research
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Missing FIRECRAWL_API_KEY
                  </Badge>
                )}
              </div>

              {!status?.firecrawl.isConfigured && (
                <div className="mt-3 rounded-md bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-semibold mb-1">
                    Lead enrichment is disabled because <code className="rounded bg-background/80 px-1 py-0.5 font-mono">FIRECRAWL_API_KEY</code> is not present in your environment.
                  </p>
                  <p>Enter your API key from api.firecrawl.dev to enable AI-powered firm research briefs.</p>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveFirecrawl} className="space-y-4">
                <div className="space-y-1.5 max-w-xl">
                  <Label htmlFor="firecrawlKey" className="flex items-center justify-between">
                    <span>Firecrawl API Key (<code className="text-[10px]">FIRECRAWL_API_KEY</code>)</span>
                    {status?.firecrawl.apiKeyMasked && (
                      <span className="text-[11px] text-muted-foreground">
                        Current: {status.firecrawl.apiKeyMasked}
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="firecrawlKey"
                      type={showFirecrawlKey ? "text" : "password"}
                      required
                      placeholder="e.g. fc-xxxxxxxxxxxxxxxxxxxx"
                      value={firecrawlForm.apiKey}
                      onChange={(e) => setFirecrawlForm({ ...firecrawlForm, apiKey: e.target.value })}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFirecrawlKey(!showFirecrawlKey)}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {showFirecrawlKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Obtain your key from <a href="https://www.firecrawl.dev" target="_blank" rel="noreferrer" className="text-primary underline">firecrawl.dev</a>.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={firecrawlSaving} className="gap-1.5">
                    <Save className="h-4 w-4" />
                    {firecrawlSaving ? "Saving to .env…" : "Save Firecrawl Key"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Zoho Mail Card */}
          <Card className={!status?.zoho.isConfigured ? "border-amber-500/20" : ""}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Bulk Email via Zoho Mail</CardTitle>
                    <CardDescription>
                      Handles sequence emails, outreach batches, and auto-sync of incoming client replies.
                    </CardDescription>
                  </div>
                </div>
                {status?.zoho.isConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Incomplete Setup
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveZoho} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="zohoClientId">Client ID (<code className="text-[10px]">ZOHO_CLIENT_ID</code>)</Label>
                    <Input
                      id="zohoClientId"
                      placeholder="Enter Client ID"
                      value={zohoForm.clientId}
                      onChange={(e) => setZohoForm({ ...zohoForm, clientId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="zohoSecret">Client Secret (<code className="text-[10px]">ZOHO_CLIENT_SECRET</code>)</Label>
                    <div className="relative">
                      <Input
                        id="zohoSecret"
                        type={showZohoSecret ? "text" : "password"}
                        placeholder="Enter Client Secret"
                        value={zohoForm.clientSecret}
                        onChange={(e) => setZohoForm({ ...zohoForm, clientSecret: e.target.value })}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowZohoSecret(!showZohoSecret)}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        {showZohoSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="zohoRefresh">Refresh Token (<code className="text-[10px]">ZOHO_REFRESH_TOKEN</code>)</Label>
                    <div className="relative">
                      <Input
                        id="zohoRefresh"
                        type={showZohoRefresh ? "text" : "password"}
                        placeholder="Enter Refresh Token"
                        value={zohoForm.refreshToken}
                        onChange={(e) => setZohoForm({ ...zohoForm, refreshToken: e.target.value })}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowZohoRefresh(!showZohoRefresh)}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        {showZohoRefresh ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="zohoEmail">Sender Email (<code className="text-[10px]">ZOHO_SENDER_EMAIL</code>)</Label>
                    <Input
                      id="zohoEmail"
                      type="email"
                      placeholder="sales@yourstudio.com"
                      defaultValue={status?.zoho.senderEmail || ""}
                      value={zohoForm.senderEmail || status?.zoho.senderEmail || ""}
                      onChange={(e) => setZohoForm({ ...zohoForm, senderEmail: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={zohoSaving} className="gap-1.5">
                    <Save className="h-4 w-4" />
                    {zohoSaving ? "Saving to .env…" : "Save Zoho Credentials"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* AI Gateway Card */}
          <Card className={!status?.ai.isConfigured ? "border-amber-500/20" : ""}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">AI Drafting Gateway</CardTitle>
                    <CardDescription>
                      Powers real-time Anthropic Claude streaming for sales message generation and outreach redrafts.
                    </CardDescription>
                  </div>
                </div>
                {status?.ai.isConfigured ? (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Missing Key
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveAi} className="space-y-4">
                <div className="space-y-1.5 max-w-xl">
                  <Label htmlFor="aiKey" className="flex items-center justify-between">
                    <span>AI API Key (<code className="text-[10px]">AI_API_KEY</code>)</span>
                    {status?.ai.apiKeyMasked && (
                      <span className="text-[11px] text-muted-foreground">
                        Current: {status.ai.apiKeyMasked}
                      </span>
                    )}
                  </Label>
                  <div className="relative">
                    <Input
                      id="aiKey"
                      type={showAiKey ? "text" : "password"}
                      required
                      placeholder="Enter your AI_API_KEY"
                      value={aiForm.apiKey}
                      onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAiKey(!showAiKey)}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {showAiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={aiSaving} className="gap-1.5">
                    <Save className="h-4 w-4" />
                    {aiSaving ? "Saving to .env…" : "Save AI Key"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Team Management */}
        <TabsContent value="team" className="space-y-6">
          {/* Add member form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                Add Workspace Member
              </CardTitle>
              <CardDescription>
                Create a new authenticated account. Only administrators can add members; public registration is disabled.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddMember} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="e.g. Mira Sharma"
                    value={teamForm.fullName}
                    onChange={(e) => setTeamForm({ ...teamForm, fullName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    placeholder="user@example.com"
                    value={teamForm.email}
                    onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Temporary Password</Label>
                  <Input
                    id="password"
                    type="text"
                    required
                    minLength={8}
                    placeholder="Min 8 characters"
                    value={teamForm.password}
                    onChange={(e) => setTeamForm({ ...teamForm, password: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={teamForm.role}
                    onValueChange={(val) => setTeamForm({ ...teamForm, role: val as "admin" | "sales" })}
                  >
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">Sales (Pipeline & Outreach)</SelectItem>
                      <SelectItem value="admin">Admin (Full System Access)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={addingMember} className="w-full">
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    {addingMember ? "Adding…" : "Add Member"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Members list */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Team Roster & Members
                </CardTitle>
                <CardDescription>
                  List of authorized team members who can sign in to Sevic Reach.
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {teamData?.length ?? 0} members
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Added On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamData?.map((m) => {
                    const isSelf = m.id === user?.id;
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium flex items-center gap-1.5">
                              {m.full_name || m.email}
                              {isSelf && (
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                                  You
                                </Badge>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">{m.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.role === "admin" ? "default" : "secondary"} className="text-xs">
                            {m.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleResetPassword(m.email ?? "", m.id)}
                              className="h-8 text-xs"
                            >
                              <KeyRound className="mr-1 h-3.5 w-3.5" />
                              Password
                            </Button>
                            {!isSelf && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveMember(m.email ?? "this member", m.id)}
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" />
                                Remove
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
