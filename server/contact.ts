import { env } from "@/server/runtime";
import { assertDomain } from "./domain";
import { emailConfigured, sendEmailMessage } from "./messaging";
import { enforceRateLimit } from "./rate-limit";

function field(value: unknown, label: string, max: number, min = 1): string {
  assertDomain(typeof value === "string", "VALIDATION_ERROR", `Popuni polje: ${label}.`, 422);
  const result = value.trim();
  assertDomain(result.length >= min && result.length <= max, "VALIDATION_ERROR", `${label} treba da sadrži od ${min} do ${max} znakova.`, 422);
  return result;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function submitContact(request: Request, input: Record<string, unknown>) {
  const origin = request.headers.get("origin");
  assertDomain(!origin || origin === new URL(request.url).origin, "INVALID_ORIGIN", "Osveži stranicu i pokušaj ponovo.", 403);
  assertDomain(!input.website, "INVALID_SUBMISSION", "Poruka nije poslata. Pozovi nas ako se problem ponovi.", 422);
  const name = field(input.name, "Ime", 100);
  const email = field(input.email, "Email", 254).toLowerCase();
  assertDomain(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email), "VALIDATION_ERROR", "Unesi ispravnu email adresu.", 422);
  const topic = field(input.topic, "Tema", 50);
  assertDomain(["Proizvodi", "Dostava", "Moja porudžbina", "Saradnja", "Nešto drugo"].includes(topic), "VALIDATION_ERROR", "Izaberi temu poruke.", 422);
  const message = field(input.message, "Poruka", 5000, 10);
  const orderNumber = input.orderNumber ? field(input.orderNumber, "Broj porudžbine", 80) : "";
  const recipient = (env as Record<string, string | undefined>).CONTACT_EMAIL_TO?.trim();
  assertDomain(recipient && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient) && emailConfigured(),
    "CONTACT_UNAVAILABLE", "Slanje preko forme trenutno nije dostupno. Tvoja poruka nije poslata.", 503);
  await enforceRateLimit(request, "contact", 5, 3600);
  const text = [`Ime: ${name}`, `Email za odgovor: ${email}`, `Tema: ${topic}`, ...(orderNumber ? [`Broj porudžbine: ${orderNumber}`] : []), "", message].join("\n");
  await sendEmailMessage(recipient, {
    subject: `Kontakt sa sajta — ${topic}`,
    text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h1>Nova kontakt poruka</h1><p><a href="mailto:${escapeHtml(email)}">Odgovori pošiljaocu</a></p><pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre></div>`,
  }, `contact-${crypto.randomUUID()}`);
  return { sent: true };
}
