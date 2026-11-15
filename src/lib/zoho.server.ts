// Server-only helpers for Zoho Mail (bulk email). Never import from client code.

let cachedToken: { token: string; expiresAt: number } | null = null;

const REGIONS = ["com", "in", "eu", "com.au", "jp", "ca", "sa", "com.cn"];

export function zohoRegion(): string {
  const raw = (process.env['ZOHO_REGION'] ?? "").trim().toLowerCase().replace(/^zoho\./, "");
  return REGIONS.includes(raw) ? raw : "in";
}

export async function zohoAccessToken(): Promise<string> {
  const clientId = process.env['ZOHO_CLIENT_ID'];
  const clientSecret = process.env['ZOHO_CLIENT_SECRET'];
  const refreshToken = process.env['ZOHO_REFRESH_TOKEN'];
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Email sending is not configured yet — add the Zoho details first");
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(`https://accounts.zoho.${zohoRegion()}/oauth/v2/token`, {
    method: "POST",
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; expires_in?: number };
  if (!json.access_token) throw new Error(`Zoho token error: ${json.error ?? `HTTP ${res.status}`}`);
  cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

export async function zohoAccountId(token: string): Promise<string> {
  const res = await fetch(`https://mail.zoho.${zohoRegion()}/api/v1/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { accountId?: string }[]; message?: string };
  const accountId = json.data?.[0]?.accountId;
  if (!accountId) throw new Error(`Zoho account error: ${json.message ?? `HTTP ${res.status}`}`);
  return accountId;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHtml(text: string): string {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export async function zohoSend(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; id: string | null; error: string | null }> {
  const token = await zohoAccessToken();
  const accountId = await zohoAccountId(token);
  const sender = process.env['ZOHO_SENDER_EMAIL'];
  if (!sender) throw new Error("Email sending is not configured yet — add the Zoho details first");
  const res = await fetch(`https://mail.zoho.${zohoRegion()}/api/v1/accounts/${accountId}/messages`, {
    method: "POST",
    headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fromAddress: sender,
      toAddress: opts.to,
      subject: opts.subject,
      content: renderHtml(opts.body),
      mailFormat: "html",
      askReceipt: "no",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: { code?: number; description?: string };
    data?: { messageId?: string | string[] };
    message?: string;
  };
  const rawId = json.data?.messageId;
  const id = Array.isArray(rawId) ? (rawId[0] ?? null) : (rawId ?? null);
  const ok = res.ok && (json.status?.code === 200 || res.status === 200) && id !== null;
  if (!ok) {
    const err = json.status?.description ?? json.message ?? `Zoho error HTTP ${res.status}`;
    return { ok: false, id, error: err };
  }
  return { ok: true, id, error: null };
}

export type ZohoInboxMessage = { messageId: string; folderId: string; subject: string; summary: string; fromAddress: string; receivedTime: number };

function scopeError(json: { data?: { errorCode?: string }; status?: { description?: string } }, status: number): string {
  const code = json.data?.errorCode ?? "";
  if (status === 401 || /scope|INVALID_OAUTHSCOPE|URL_RULE/i.test(code + (json.status?.description ?? ""))) {
    return "Zoho needs read access to check replies — create a new code with ZohoMail.messages.ALL,ZohoMail.accounts.READ,ZohoMail.folders.READ";
  }
  return json.status?.description ?? `Zoho error HTTP ${status}`;
}

export async function zohoSearchFrom(email: string): Promise<ZohoInboxMessage[]> {
  const token = await zohoAccessToken();
  const accountId = await zohoAccountId(token);
  const url = `https://mail.zoho.${zohoRegion()}/api/accounts/${accountId}/messages/search?searchKey=${encodeURIComponent(`sender:${email}`)}&limit=25`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const json = (await res.json().catch(() => ({}))) as { data?: unknown; status?: { code?: number; description?: string } };
  if (!res.ok || !Array.isArray(json.data)) throw new Error(scopeError(json as never, res.status));
  return (json.data as Record<string, unknown>[]).map((m) => ({
    messageId: String(m["messageId"] ?? ""),
    folderId: String(m["folderId"] ?? ""),
    subject: String(m["subject"] ?? ""),
    summary: String(m["summary"] ?? ""),
    fromAddress: String(m["fromAddress"] ?? email),
    receivedTime: Number(m["receivedTime"] ?? 0),
  })).filter((m) => m["messageId"]);
}

export async function zohoMessageText(folderId: string, messageId: string): Promise<string | null> {
  const token = await zohoAccessToken();
  const accountId = await zohoAccountId(token);
  const res = await fetch(`https://mail.zoho.${zohoRegion()}/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { content?: string } };
  const html = json.data?.content;
  if (!html) return null;
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
}
