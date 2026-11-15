// Collect every phone / email known for a firm: the main field plus any found in notes.
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  if (d.length === 11 && d.startsWith("0") && /^0[6-9]/.test(d)) return `+91${d.slice(1)}`;
  if (raw.trim().startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

export function firmPhones(f: { phone?: string | null; notes?: string | null }): string[] {
  const out = new Set<string>();
  if (f.phone) { const p = normalizePhone(f.phone); if (p) out.add(p); }
  for (const m of (f.notes ?? "").match(/\+?\d[\d\s-]{8,16}\d/g) ?? []) {
    const p = normalizePhone(m);
    if (p) out.add(p);
  }
  return [...out];
}

export function firmEmails(f: { email?: string | null; notes?: string | null }): string[] {
  const out = new Set<string>();
  if (f.email?.trim()) out.add(f.email.trim().toLowerCase());
  for (const m of (f.notes ?? "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) out.add(m.toLowerCase());
  return [...out];
}
