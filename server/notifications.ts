export interface TransactionalMessage {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function money(minor: unknown): string {
  return new Intl.NumberFormat("sr-Latn-RS", { style: "currency", currency: "RSD", minimumFractionDigits: 0 }).format(Number(minor ?? 0) / 100);
}

function shell(subject: string, paragraphs: string[], action?: { label: string; url: string }): TransactionalMessage {
  const text = [subject, "", ...paragraphs, ...(action ? ["", `${action.label}: ${action.url}`] : []), "", "Mleko i Mleko"].join("\n");
  const html = `<!doctype html><html lang="sr"><body style="margin:0;background:#f5f1e8;font-family:Arial,sans-serif;color:#203529"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border-radius:18px;padding:32px"><p style="margin:0 0 20px;color:#8b5e3c;font-weight:700">MLEKO I MLEKO</p><h1 style="font-size:26px;margin:0 0 20px">${escapeHtml(subject)}</h1>${paragraphs.map((paragraph) => `<p style="line-height:1.6">${escapeHtml(paragraph)}</p>`).join("")}${action ? `<p style="margin:28px 0"><a href="${escapeHtml(action.url)}" style="background:#244a34;color:#fff;text-decoration:none;padding:13px 20px;border-radius:999px;display:inline-block">${escapeHtml(action.label)}</a></p>` : ""}<p style="margin-top:28px;color:#68756e;font-size:13px">Mleko i Mleko · automatska servisna poruka</p></div></div></body></html>`;
  return { subject, text, html };
}

export function renderTransactionalMessage(topic: string, data: Record<string, unknown>): TransactionalMessage {
  if (topic === "auth.code.requested") {
    return shell(data.purpose === "register" ? "Potvrdite email adresu" : "Vaš kod za prijavu", [
      `Vaš kod je ${String(data.code)}.`, `Kod važi ${Number(data.minutes)} minuta i može se iskoristiti samo jednom.`,
      "Ne delite ovaj kod. Ako niste tražili kod, zanemarite ovu poruku.",
    ]);
  }
  const greeting = "Poštovani,";
  const accountAction = data.accountUrl ? { label: topic.startsWith("subscription.") ? "Uredi pretplatu" : "Upravljajte dostavama", url: String(data.accountUrl) } : undefined;
  const orderNumber = String(data.orderNumber ?? data.order_number ?? data.orderId ?? "").trim();
  const deliveryDate = String(data.deliveryDate ?? data.nextDeliveryDate ?? data.delivery_date ?? "").trim();
  const total = money(data.totalMinor ?? data.total_minor);
  const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
  const itemSummary = items.length ? items.map((item) => `${item.quantity} × ${item.product_name ?? item.name}`).join(", ") : "";

  if (topic === "auth.magic_link.requested") {
    return shell("Prijava na vaš nalog", [greeting, "Kliknite na dugme ispod da se prijavite. Link važi 15 minuta i može se iskoristiti samo jednom."], { label: "Prijavi se", url: String(data.url ?? "") });
  }
  if (topic === "email.delivery_reminder.requested") {
    return shell("Podsetnik za sutrašnju dostavu", [greeting, `Vaša sledeća isporuka je sutra, ${deliveryDay(deliveryDate)} (${formatDeliveryDate(deliveryDate)}).`, itemSummary ? `Stavke: ${itemSummary}.` : "", data.note ? `Napomena: ${data.note}` : ""].filter(Boolean), accountAction);
  }
  if (topic === "email.receipt.requested") {
    return shell("Uplata je evidentirana", [greeting, `Uplata za porudžbinu ${orderNumber} je evidentirana. Fiskalni račun se obrađuje i biće poslat na ovu email adresu.`], accountAction);
  }
  if (topic === "email.invoice.requested") {
    return shell("Mesečni obračun pretplate", [greeting, `Obračun ${orderNumber} iznosi ${total}.`, deliveryDate ? `Prva planirana dostava u ovom obračunu je ${deliveryDate}.` : "", itemSummary ? `Stavke: ${itemSummary}.` : ""].filter(Boolean), accountAction);
  }
  if (topic === "payment.method_required") {
    return shell("Potrebna je provera načina plaćanja", [greeting, `Automatska naplata za ${orderNumber} nije uspela. Porudžbina je sačuvana, ali je potrebno ažurirati način plaćanja.`], accountAction);
  }
  if (topic.startsWith("subscription.")) {
    const action = topic.slice("subscription.".length);
    const labels: Record<string, string> = {
      pause: "Pretplata je pauzirana", paused: "Pretplata je pauzirana", resume: "Pretplata je nastavljena", resumed: "Pretplata je nastavljena",
      cancel: "Pretplata je otkazana", cancelled: "Pretplata je otkazana", skip_next: "Vaša sledeća isporuka je preskočena",
      add_item: "Proizvod je dodat u pretplatu", update_item: "Proizvod u pretplati je izmenjen", remove_item: "Proizvod je uklonjen iz pretplate",
      slow_down: "Dostava je promenjena na svake dve nedelje", add_next_only: "Dodatak za sledeću dostavu je evidentiran", activated: "Pretplata je aktivirana",
    };
    const title = labels[action] ?? "Pretplata je ažurirana";
    const cancelled = ["cancel", "cancelled"].includes(action);
    return shell(title, [greeting, `${title}.`,
      action === "skip_next" && data.previousDeliveryDate ? `Preskočena isporuka: ${formatDeliveryDate(String(data.previousDeliveryDate))}.` : "",
      action === "pause" && data.pauseUntil ? `Pauza traje do ${formatDeliveryDate(String(data.pauseUntil))}.` : "",
      !cancelled && deliveryDate ? `Sledeća dostava: ${formatDeliveryDate(deliveryDate)}.` : "",
      data.quantity ? `Nova količina: ${data.quantity}.` : "",
      data.cadence ? `Ritam: ${data.cadence === "biweekly" ? "svake dve nedelje" : "svake nedelje"}.` : "",
      !cancelled && data.cutoffAt ? `Rok za izmene: ${new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Belgrade" }).format(new Date(String(data.cutoffAt)))}.` : "",
      Number(data.adjustmentMinor ?? 0) > 0 ? `Kredit za sledeći obračun: ${money(data.adjustmentMinor)}.` : Number(data.adjustmentMinor ?? 0) < 0 ? `Doplata za sledeći obračun: ${money(-Number(data.adjustmentMinor))}.` : "",
    ].filter(Boolean), accountAction);
  }
  if (topic === "email.order_updated.requested") {
    const statuses: Record<string, string> = { planned: "planirano", locked: "u pripremi", delivered: "isporučeno", cancelled: "otkazano", pending: "na čekanju", paid: "plaćeno", failed: "neuspešno", refunded: "refundirano" };
    return shell("Porudžbina je ažurirana", [greeting, `Porudžbina ${orderNumber}: ${statuses[String(data.fulfillmentStatus)] ?? "ažurirano"}.`, `Plaćanje: ${statuses[String(data.paymentStatus)] ?? "na čekanju"}.`, data.detailsChanged ? "Stavke ili adresa dostave su ažurirane." : "", itemSummary, `Ukupno: ${total}.`].filter(Boolean), accountAction);
  }

  return shell("Potvrda porudžbine", [greeting, `Porudžbina ${orderNumber} je primljena. Ukupno: ${total}.`, deliveryDate ? `Planirana dostava: ${deliveryDate}.` : "", itemSummary ? `Stavke: ${itemSummary}.` : ""].filter(Boolean), accountAction);
}

function formatDeliveryDate(date: string) {
  return new Intl.DateTimeFormat("sr-Latn-RS", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Belgrade" }).format(new Date(`${date}T12:00:00Z`));
}
function deliveryDay(date: string) {
  return ["u nedelju", "u ponedeljak", "u utorak", "u sredu", "u četvrtak", "u petak", "u subotu"][new Date(`${date}T12:00:00Z`).getUTCDay()];
}

export function renderWhatsAppUpdate(topic: string, data: Record<string, unknown>) {
  // The approved utility template wraps one body placeholder and a static /nalog button.
  // Share event wording with email, without duplicating its heading, signature or URL.
  return renderTransactionalMessage(topic, data).text.split("\n").filter(Boolean).slice(2).filter((line) => line !== "Mleko i Mleko" && !line.startsWith("Upravljajte dostavama:") && !line.startsWith("Uredi pretplatu:")).join(" ").slice(0, 900);
}
