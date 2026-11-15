import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function assertAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Only an admin can configure company settings");
}

export const getCompanyConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { readCompanyPrompts } = await import("@/lib/company-config.server");
    return readCompanyPrompts();
  });

export const saveCompanyConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z
      .object({
        companyKnowledge: z.string().optional(),
        researchPrompt: z.string().optional(),
        messagePrompt: z.string().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { writeCompanyPrompts } = await import("@/lib/company-config.server");
    await writeCompanyPrompts(data);
    return { ok: true };
  });
