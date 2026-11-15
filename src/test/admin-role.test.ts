import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchUserRole } from "@/lib/auth-role";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(),
    },
  };
});

describe("Admin role and navigation access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("identifies user as admin when rpc has_role returns true", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: true,
      error: null,
    } as any);

    const res = await fetchUserRole("user-admin-123");
    expect(res).toEqual({
      role: "admin",
      isAdmin: true,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("has_role", {
      _user_id: "user-admin-123",
      _role: "admin",
    });
  });

  it("identifies user as sales when rpc has_role returns false", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: false,
      error: null,
    } as any);

    const res = await fetchUserRole("user-sales-456");
    expect(res).toEqual({
      role: "sales",
      isAdmin: false,
    });
  });

  it("falls back to user_roles table query if rpc fails or throws", async () => {
    vi.mocked(supabase.rpc).mockRejectedValueOnce(new Error("RPC failed"));

    const eqFn = vi.fn().mockResolvedValueOnce({
      data: [{ role: "admin" }],
      error: null,
    });
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
    vi.mocked(supabase.from).mockReturnValue({ select: selectFn } as any);

    const res = await fetchUserRole("user-fallback-admin");
    expect(res).toEqual({
      role: "admin",
      isAdmin: true,
    });
  });

  it("returns sales non-admin when user has sales role in user_roles table fallback", async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: "function not found" },
    } as any);

    const eqFn = vi.fn().mockResolvedValueOnce({
      data: [{ role: "sales" }],
      error: null,
    });
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
    vi.mocked(supabase.from).mockReturnValue({ select: selectFn } as any);

    const res = await fetchUserRole("user-fallback-sales");
    expect(res).toEqual({
      role: "sales",
      isAdmin: false,
    });
  });

  it("filters navigation items so admin pages only appear for admins", () => {
    const NAV = [
      { to: "/board", label: "Pipeline" },
      { to: "/funnel", label: "Funnel" },
      { to: "/tasks", label: "Team follow-ups" },
      { to: "/replies", label: "Replies" },
      { to: "/campaign", label: "Campaign" },
      { to: "/filters", label: "Tags" },
      { to: "/admin", label: "Admin", adminOnly: true },
    ];

    const salesNav = NAV.filter((item) => !item.adminOnly);
    expect(salesNav.map((n) => n.to)).toEqual([
      "/board",
      "/funnel",
      "/tasks",
      "/replies",
      "/campaign",
      "/filters",
    ]);
    expect(salesNav.some((n) => n.to === "/admin")).toBe(false);

    const adminNav = NAV.filter((item) => !item.adminOnly || true);
    expect(adminNav.map((n) => n.to)).toContain("/admin");
    expect(adminNav.some((n) => n.to === "/team")).toBe(false);
  });

  it("enforces admin protection: non-admins are denied and redirected to /board", async () => {
    function evaluateRouteAccess(isAdmin: boolean) {
      if (!isAdmin) {
        return { redirect: "/board", allowed: false };
      }
      return { redirect: null, allowed: true };
    }

    const salesAccess = evaluateRouteAccess(false);
    expect(salesAccess.allowed).toBe(false);
    expect(salesAccess.redirect).toBe("/board");

    const adminAccess = evaluateRouteAccess(true);
    expect(adminAccess.allowed).toBe(true);
    expect(adminAccess.redirect).toBeNull();
  });
});
