import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendDueSequenceMessages } from "./sequences.server";

/** Send this firm's approved messages that are due right now (e.g. an approved Day 0 message). */
export const sendDueForFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ firmId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) =>
    sendDueSequenceMessages(context.supabase as never, { firmId: data.firmId, userId: context.userId }));
