import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function assertAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Only an admin can configure integrations");
}

function maskSecret(val?: string | null): string | null {
  if (!val) return null;
  const str = val.trim();
  if (str.length <= 8) return "••••••••";
  return `${str.slice(0, 3)}••••${str.slice(-4)}`;
}

export type IntegrationStatus = {
  gupshup: {
    isConfigured: boolean;
    missingFields: string[];
    apiKeyMasked: string | null;
    appName: string | null;
    sourceNumber: string | null;
  };
  firecrawl: {
    isConfigured: boolean;
    missingFields: string[];
    apiKeyMasked: string | null;
  };
  zoho: {
    isConfigured: boolean;
    missingFields: string[];
    senderEmail: string | null;
    region: string | null;
  };
  ai: {
    isConfigured: boolean;
    missingFields: string[];
    apiKeyMasked: string | null;
  };
};

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IntegrationStatus> => {
    await assertAdmin(context);

    // Gupshup WhatsApp check
    const gupshupKey = process.env["GUPSHUP_API_KEY"];
    const gupshupApp = process.env["GUPSHUP_APP_NAME"];
    const gupshupSource = process.env["GUPSHUP_SOURCE_NUMBER"];

    const gupshupMissing: string[] = [];
    if (!gupshupKey) gupshupMissing.push("GUPSHUP_API_KEY");
    if (!gupshupApp) gupshupMissing.push("GUPSHUP_APP_NAME");
    if (!gupshupSource) gupshupMissing.push("GUPSHUP_SOURCE_NUMBER");

    // Firecrawl check
    const firecrawlKey = process.env["FIRECRAWL_API_KEY"];
    const firecrawlMissing: string[] = [];
    if (!firecrawlKey) firecrawlMissing.push("FIRECRAWL_API_KEY");

    // Zoho Mail check
    const zohoClientId = process.env["ZOHO_CLIENT_ID"];
    const zohoSecret = process.env["ZOHO_CLIENT_SECRET"];
    const zohoRefresh = process.env["ZOHO_REFRESH_TOKEN"];
    const zohoEmail = process.env["ZOHO_SENDER_EMAIL"];
    const zohoRegion = process.env["ZOHO_REGION"] ?? "in";

    const zohoMissing: string[] = [];
    if (!zohoClientId) zohoMissing.push("ZOHO_CLIENT_ID");
    if (!zohoSecret) zohoMissing.push("ZOHO_CLIENT_SECRET");
    if (!zohoRefresh) zohoMissing.push("ZOHO_REFRESH_TOKEN");
    if (!zohoEmail) zohoMissing.push("ZOHO_SENDER_EMAIL");

    // AI Gateway check
    const aiKey = process.env["AI_API_KEY"];
    const aiMissing: string[] = [];
    if (!aiKey) aiMissing.push("AI_API_KEY");

    return {
      gupshup: {
        isConfigured: gupshupMissing.length === 0,
        missingFields: gupshupMissing,
        apiKeyMasked: maskSecret(gupshupKey),
        appName: gupshupApp ?? null,
        sourceNumber: gupshupSource ?? null,
      },
      firecrawl: {
        isConfigured: firecrawlMissing.length === 0,
        missingFields: firecrawlMissing,
        apiKeyMasked: maskSecret(firecrawlKey),
      },
      zoho: {
        isConfigured: zohoMissing.length === 0,
        missingFields: zohoMissing,
        senderEmail: zohoEmail ?? null,
        region: zohoRegion,
      },
      ai: {
        isConfigured: aiMissing.length === 0,
        missingFields: aiMissing,
        apiKeyMasked: maskSecret(aiKey),
      },
    };
  });

export const saveGupshupConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        apiKey: z.string().trim().min(1, "Gupshup API Key is required"),
        appName: z.string().trim().min(1, "App Name is required"),
        sourceNumber: z.string().trim().min(1, "Source Number is required"),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    // Clean source number (digits only, e.g. 919876543210)
    const cleanedSource = data.sourceNumber.replace(/\D/g, "");
    if (!cleanedSource) {
      throw new Error("Source number must contain digits");
    }

    const { writeEnvUpdates } = await import("@/lib/env.server");
    await writeEnvUpdates({
      GUPSHUP_API_KEY: data.apiKey,
      GUPSHUP_APP_NAME: data.appName,
      GUPSHUP_SOURCE_NUMBER: cleanedSource,
    });

    return { ok: true };
  });

export const saveFirecrawlConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        apiKey: z.string().trim().min(1, "Firecrawl API Key is required"),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { writeEnvUpdates } = await import("@/lib/env.server");
    await writeEnvUpdates({
      FIRECRAWL_API_KEY: data.apiKey,
    });

    return { ok: true };
  });

export const saveZohoConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        clientId: z.string().trim().min(1, "Client ID is required"),
        clientSecret: z.string().trim().min(1, "Client Secret is required"),
        refreshToken: z.string().trim().min(1, "Refresh Token is required"),
        senderEmail: z.string().trim().email("Sender Email must be a valid email"),
        region: z.string().trim().default("in"),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { writeEnvUpdates } = await import("@/lib/env.server");
    await writeEnvUpdates({
      ZOHO_CLIENT_ID: data.clientId,
      ZOHO_CLIENT_SECRET: data.clientSecret,
      ZOHO_REFRESH_TOKEN: data.refreshToken,
      ZOHO_SENDER_EMAIL: data.senderEmail,
      ZOHO_REGION: data.region,
    });

    return { ok: true };
  });

export const saveAiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        apiKey: z.string().trim().min(1, "AI API Key is required"),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { writeEnvUpdates } = await import("@/lib/env.server");
    await writeEnvUpdates({
      AI_API_KEY: data.apiKey,
    });

    return { ok: true };
  });
