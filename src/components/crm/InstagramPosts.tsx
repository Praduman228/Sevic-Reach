import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchLeadInstagramPosts, draftInstagramComment } from "@/lib/instagram-posts.functions";
import { openInstagramUrl } from "@/lib/instagram";

import type { InstagramPost } from "@/lib/instagram-posts";

export function InstagramPosts({ firmId, handle }: { firmId: string; handle: string | null }) {
  const fetchPosts = useServerFn(fetchLeadInstagramPosts);
  const generate = useServerFn(draftInstagramComment);
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  async function refresh() {
    setFetching(true); setNotice("");
    try {
      const result = await fetchPosts({ data: { firmId } });
      setPosts(result.posts); setNotice(result.error || (result.posts.length ? "" : "No recent posts found."));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not fetch Instagram posts"); }
    finally { setFetching(false); }
  }
  async function draft(post: InstagramPost) {
    setGenerating(post.id);
    try { const result = await generate({ data: { firmId, post } }); setComments((current) => ({ ...current, [post.id]: result.comment })); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not generate comment"); }
    finally { setGenerating(null); }
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Instagram posts</h2>
      <Button variant="outline" size="sm" disabled={!handle || fetching} onClick={refresh}><RefreshCw className={fetching ? "animate-spin" : ""} />{fetching ? "Fetching…" : "Fetch latest 5 posts"}</Button>
    </div>
    {handle ? <a href={`https://www.instagram.com/${handle}/`} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); openInstagramUrl(`https://www.instagram.com/${handle}/`); }} className="inline-flex items-center gap-1 text-sm text-primary">@{handle}<ExternalLink className="h-3 w-3" /></a> : <p className="text-sm text-muted-foreground">Add an Instagram profile in Overview.</p>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    <div className="space-y-4">{posts.map((post) => <article key={post.id} className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{new Date(post.timestamp).toLocaleDateString()} · {post.media_type}</span><a href={post.permalink} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); openInstagramUrl(post.permalink); }} className="inline-flex items-center gap-1 text-primary">Open post<ExternalLink className="h-3 w-3" /></a></div>
      <p className="whitespace-pre-wrap break-words text-sm">{post.caption || "No caption"}</p>
      <Button variant="outline" size="sm" disabled={!!generating || !post.caption.trim()} onClick={() => draft(post)}><Sparkles />{generating === post.id ? "Drafting…" : comments[post.id] ? "Redraft comment" : "Generate comment draft"}</Button>
      {comments[post.id] && <div className="space-y-2"><Textarea aria-label="Comment draft" value={comments[post.id]} onChange={(event) => setComments((current) => ({ ...current, [post.id]: event.target.value }))} /><Button size="sm" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(comments[post.id] ?? ""); toast.success("Comment copied"); } catch { toast.error("Could not copy comment"); } }}><Copy />Copy comment</Button></div>}
    </article>)}</div>
  </section>;
}