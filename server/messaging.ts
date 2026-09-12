import { env } from "@/server/runtime";
import { assertDomain, DomainError } from "./domain";
import type { TransactionalMessage } from "./notifications";

const config = () => env as Record<string, string | undefined>;

export function infobipBaseUrl(): string {
  const raw = config().INFOBIP_BASE_URL ?? "";
  let url: URL;
  try { url = new URL(raw); } catch { throw new DomainError("INFOBIP_NOT_CONFIGURED", "Infobip pristup još nije podešen.", 503); }
  assertDomain(url.protocol === "https:" && /^[a-z0-9-]+\.api\.infobip\.com$/i.test(url.hostname)
    && !url.username && !url.password && !url.port && url.pathname === "/" && !url.search && !url.hash,
  "INFOBIP_NOT_CONFIGURED", "Infobip API adresa nije ispravna.", 503);
  return url.origin;
}

export function emailConfigured(): boolean {
  const c = config();
  return c.EMAIL_MODE === "provider" && ["resend", "infobip"].includes(c.EMAIL_PROVIDER ?? "")
    && Boolean(c.EMAIL_API_KEY && c.EMAIL_FROM && (c.EMAIL_PROVIDER !== "infobip" || c.INFOBIP_BASE_URL));
}

export function whatsappConfigured(): boolean {
  const c = config();
  return c.WHATSAPP_MODE === "provider" && c.WHATSAPP_PROVIDER === "infobip"
    && Boolean(c.WHATSAPP_API_KEY && c.WHATSAPP_SENDER_ID && c.INFOBIP_BASE_URL && c.WHATSAPP_AUTH_TEMPLATE && c.WHATSAPP_TEMPLATE_LANGUAGE);
}

async function providerRequest(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) }); }
  catch { throw new DomainError("MESSAGE_SEND_FAILED", "Slanje trenutno nije dostupno. Pokušajte ponovo za minut.", 503); }
  // Do not surface provider bodies: they may contain recipients or authentication codes.
  assertDomain(response.ok, "MESSAGE_SEND_FAILED", "Servis nije prihvatio poruku. Pokušajte ponovo kasnije.", 503);
  const body = await response.json().catch(() => null);
  assertDomain(body && typeof body === "object", "MESSAGE_SEND_FAILED", "Servis nije potvrdio prijem poruke.", 503);
  return body;
}

function infobipReceipt(body: Record<string, unknown>): string {
  const item = (Array.isArray(body.messages) ? body.messages[0] : body) as Record<string, unknown> | undefined;
  const status = item?.status as { groupId?: number } | undefined;
  assertDomain(item && typeof item.messageId === "string" && [1, 3].includes(Number(status?.groupId)),
    "MESSAGE_SEND_FAILED", "Infobip nije prihvatio poruku. Pokušajte ponovo kasnije.", 503);
  return item.messageId;
}

export async function sendEmailMessage(to: string, message: TransactionalMessage, id: string): Promise<string> {
  assertDomain(emailConfigured(), "EMAIL_NOT_CONFIGURED", "Slanje emaila još nije aktivirano.", 503);
  const c = config();
  if (c.EMAIL_PROVIDER === "infobip") {
    const form = new FormData();
    for (const [key, value] of Object.entries({ from: c.EMAIL_FROM!, to, subject: message.subject, text: message.text, html: message.html, bulkId: id, track: "false" })) form.set(key, value);
    return infobipReceipt(await providerRequest(`${infobipBaseUrl()}/email/3/send`, {
      method: "POST", headers: { authorization: `App ${c.EMAIL_API_KEY}` }, body: form,
    }));
  }
  const body = await providerRequest("https://api.resend.com/emails", {
    method: "POST", headers: { authorization: `Bearer ${c.EMAIL_API_KEY}`, "content-type": "application/json", "idempotency-key": id },
    body: JSON.stringify({ from: c.EMAIL_FROM, to: [to], ...message }),
  });
  assertDomain(typeof body.id === "string", "MESSAGE_SEND_FAILED", "Servis nije potvrdio prijem emaila.", 503);
  return body.id;
}

export async function sendWhatsAppTemplate(to: string, templateName: string, placeholders: string[], id: string, buttonParameter?: string): Promise<string> {
  const c = config();
  assertDomain(whatsappConfigured() && templateName, "WHATSAPP_NOT_CONFIGURED", "WhatsApp slanje još nije aktivirano. Koristite email.", 503);
  const body = await providerRequest(`${infobipBaseUrl()}/whatsapp/1/message/template`, {
    method: "POST", headers: { authorization: `App ${c.WHATSAPP_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{
      from: c.WHATSAPP_SENDER_ID!.replace(/^\+/, ""), to: to.replace(/^\+/, ""), messageId: id,
      content: { templateName, language: c.WHATSAPP_TEMPLATE_LANGUAGE, templateData: {
        body: { placeholders }, ...(buttonParameter === undefined ? {} : { buttons: [{ type: "URL", parameter: buttonParameter }] }),
      } },
    }] }),
  });
  return infobipReceipt(body);
}

export async function sendWhatsAppCode(to: string, code: string, id: string): Promise<string> {
  return sendWhatsAppTemplate(to, config().WHATSAPP_AUTH_TEMPLATE ?? "", [code], id, code);
}
