import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { instagramCommentInstructions, instagramCommentSchema, instagramPostSchema } from "./instagram-posts";

const firmInput = z.object({ firmId: z.string().uuid() });

export const fetchLeadInstagramPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: firm, error } = await context.supabase.from("firms").select("id,instagram").eq("id", data.firmId).maybeSingle();
    if (error || !firm) throw new Error("Lead not found or access denied");
    if (!firm.instagram) throw new Error("Add an Instagram profile first");
    // Connect the owner's existing Meta app before installing credentialed API calls.
    return { posts: [] as z.infer<typeof instagramPostSchema>[], error: "Meta post fetching is awaiting your business app access token and connected Instagram professional account ID. Only business and creator profiles are supported." };
  });

export const draftInstagramComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmInput.extend({ post: instagramPostSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: firm, error } = await context.supabase.from("firms").select("id,instagram").eq("id", data.firmId).maybeSingle();
    if (error || !firm?.instagram) throw new Error("Lead not found or access denied");
    const postHandle = new URL(data.post.permalink).pathname.split("/")[1];
    if (postHandle && !["p", "reel", "tv", firm.instagram].includes(postHandle)) throw new Error("Post does not belong to this profile");
    if (!data.post.caption.trim()) throw new Error("This post has no caption to base an appreciative comment on");
    const { callMessageAI } = await import("./message-ai.server");
    const result = await callMessageAI({ type: "object", additionalProperties: false, required: ["comment"], properties: { comment: { type: "string" } } }, instagramCommentInstructions, JSON.stringify({ profile: firm.instagram, caption: data.post.caption }));
    return instagramCommentSchema.parse(result);
  });