import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RoleInfo = {
  role: "admin" | "sales";
  isAdmin: boolean;
};

export async function fetchUserRole(userId: string): Promise<RoleInfo> {
  if (!userId) return { role: "sales", isAdmin: false };

  try {
    const { data: rpcIsAdmin, error: rpcErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!rpcErr && typeof rpcIsAdmin === "boolean") {
      return {
        role: rpcIsAdmin ? "admin" : "sales",
        isAdmin: rpcIsAdmin,
      };
    }
  } catch {
    // fall back to direct select
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error || !data) {
    return { role: "sales", isAdmin: false };
  }

  const isAdmin = data.some((r) => r.role === "admin");
  return {
    role: isAdmin ? "admin" : "sales",
    isAdmin,
  };
}

export function useCurrentUserRole(userId?: string) {
  return useQuery({
    queryKey: ["currentUserRole", userId],
    queryFn: () => fetchUserRole(userId!),
    enabled: Boolean(userId),
    staleTime: 60000,
  });
}
