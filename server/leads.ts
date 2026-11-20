import { env } from "@/server/runtime";
import { assertDomain } from "./domain";
import { emailConfigured, sendEmailMessage } from "./messaging";
import { enforceRateLimit } from "./rate-limit";
import { all, run } from "./sql";

/**
 * Leads from the public site (spec 19 Nov 2026): the two mlekomat B2B forms and the
 * goat-milk waiting list. Every lead is stored first, so nothing is lost when email is
 * not configured, and then forwarded to the business inbox (CONTACT_EMAIL_TO) when it is.
 */
export const leadKinds = ["mlekomat_space", "mlekomat_rent", "goat_waitlist"] as const;
export type LeadKind = typeof leadKinds[number];

const kindLabels: Record<LeadKind, string> = {
  mlekomat_space: "Imam prostor za mlekomat",
  mlekomat_rent: "Želim svoj mlekomat (iznajmljivanje u pripremi)",
  goat_waitlist: "Obavesti me kad kozje mleko bude dostupno",
};

function text(value: unknown, label: string, max: number, required: boolean, min = 1): string {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    assertDomain(!required, "VALIDATION_ERROR", `Popuni polje: ${label}.`, 422);
    return "";
  }
  assertDomain(typeof value === "string", "VALIDATION_ERROR", `Popuni polje: ${label}.`, 422);
  const result = value.trim();
  assertDomain(result.length >= min && result.length <= max, "VALIDATION_ERROR", `${label} treba da sadrži od ${min} do ${max} znakova.`, 422);
  return result;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function submitLead(request: Request, input: Record<string, unknown>) {
  const origin = request.headers.get("origin");
  assertDomain(!origin || origin === new URL(request.url).origin, "INVALID_ORIGIN", "Osveži stranicu i pokušaj ponovo.", 403);
  assertDomain(!input.website, "INVALID_SUBMISSION", "Prijava nije poslata. Pozovi nas ako se problem ponovi.", 422);
  const kind = input.kind as LeadKind;
  assertDomain(leadKinds.includes(kind), "VALIDATION_ERROR", "Nepoznata vrsta prijave.", 422);
  const goat = kind === "goat_waitlist";
  const name = text(input.name, "Ime", 100, !goat);
  const email = text(input.email, "Email", 254, goat).toLowerCase();
  if (email) assertDomain(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email), "VALIDATION_ERROR", "Unesi ispravnu email adresu.", 422);
  const phone = text(input.phone, "Telefon", 40, !goat, 6);
  if (phone) assertDomain(/^[+\d][\d\s()/-]{5,39}$/.test(phone), "VALIDATION_ERROR", "Unesi ispravan broj telefona.", 422);
  const city = text(input.city, "Grad", 80, !goat);
  const address = text(input.address, "Adresa", 200, kind === "mlekomat_space");
  const details = text(input.details, kind === "mlekomat_space" ? "Opis prostora" : "Napomena", 3000, kind === "mlekomat_space", kind === "mlekomat_space" ? 10 : 1);
  const locale = typeof input.locale === "string" ? input.locale.slice(0, 10) : "";
  await enforceRateLimit(request, `lead:${kind}`, goat ? 10 : 5, 3600);
  if (goat) {
    // One waiting-list entry per address: a second sign-up is quietly accepted.
    const existing = await all("SELECT id FROM site_leads WHERE kind = 'goat_waitlist' AND email = ? LIMIT 1", email);
    if (existing.length) return { saved: true };
  }
  const id = `lead_${crypto.randomUUID()}`;
  await run(
    "INSERT INTO site_leads (id, kind, name, email, phone, city, address, details, locale) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, kind, name || null, email || null, phone || null, city || null, address || null, details || null, locale || null,
  );
  const recipient = (env as Record<string, string | undefined>).CONTACT_EMAIL_TO?.trim();
  if (recipient && emailConfigured()) {
    const lines = [
      `Vrsta: ${kindLabels[kind]}`,
      ...(name ? [`Ime: ${name}`] : []),
      ...(email ? [`Email: ${email}`] : []),
      ...(phone ? [`Telefon: ${phone}`] : []),
      ...(city ? [`Grad: ${city}`] : []),
      ...(address ? [`Adresa: ${address}`] : []),
      ...(details ? ["", details] : []),
    ].join("\n");
    try {
      await sendEmailMessage(recipient, {
        subject: `Sajt — ${kindLabels[kind]}`,
        text: lines,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h1>${escapeHtml(kindLabels[kind])}</h1><pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(lines)}</pre></div>`,
      }, `lead-${id}`);
    } catch {
      // Stored above; the admin list shows it even if the email could not go out.
    }
  }
  return { saved: true };
}

export async function listLeads(limit = 200) {
  return all("SELECT id, kind, name, email, phone, city, address, details, locale, status, created_at FROM site_leads ORDER BY created_at DESC LIMIT ?", Math.min(Math.max(limit, 1), 500));
}
