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
  const name = String(data.fullName ?? "").trim();
  const greeting = name ? `Zdravo, ${name}.` : "Zdravo.";
  const orderNumber = String(data.orderNumber ?? data.order_number ?? data.orderId ?? "").trim();
  const deliveryDate = String(data.deliveryDate ?? data.delivery_date ?? "").trim();
  const total = money(data.totalMinor ?? data.total_minor);
  const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
  const itemSummary = items.length ? items.map((item) => `${item.quantity} × ${item.product_name ?? item.name}`).join(", ") : "";

  if (topic === "auth.magic_link.requested") {
    return shell("Prijava na vaš nalog", [greeting, "Kliknite na dugme ispod da se prijavite. Link važi 15 minuta i može se iskoristiti samo jednom."], { label: "Prijavi se", url: String(data.url ?? "") });
  }
  if (topic === "email.delivery_reminder.requested") {
    return shell("Podsetnik za sutrašnju dostavu", [greeting, `Vaša dostava je planirana za ${deliveryDate}.`, itemSummary ? `Stavke: ${itemSummary}.` : "", data.note ? `Napomena: ${data.note}` : ""].filter(Boolean));
  }
  if (topic === "email.receipt.requested") {
    return shell("Uplata je evidentirana", [greeting, `Uplata za porudžbinu ${orderNumber} je evidentirana. Fiskalni račun se obrađuje i biće poslat na ovu email adresu.`]);
  }
  if (topic === "email.invoice.requested") {
    return shell("Mesečni obračun pretplate", [greeting, `Obračun ${orderNumber} iznosi ${total}.`, deliveryDate ? `Prva planirana dostava u ovom obračunu je ${deliveryDate}.` : "", itemSummary ? `Stavke: ${itemSummary}.` : ""].filter(Boolean));
  }
  if (topic === "payment.method_required") {
    return shell("Potrebna je provera načina plaćanja", [greeting, `Automatska naplata za ${orderNumber} nije uspela. Porudžbina je sačuvana, ali je potrebno ažurirati način plaćanja.`]);
  }
  if (topic.startsWith("subscription.")) {
    const labels: Record<string, string> = { paused: "Pretplata je pauzirana", resumed: "Pretplata je nastavljena", cancelled: "Pretplata je otkazana", skip_next: "Sledeća dostava je preskočena", change_quantity: "Količina je promenjena", change_cadence: "Dinamika dostave je promenjena", add_next_only: "Dodatak za sledeću dostavu je evidentiran", activated: "Pretplata je aktivirana" };
    const action = topic.split(".").slice(1).join("_");
    const cutoffAt = String(data.cutoffAt ?? data.cutoff_at ?? "").trim();
    const accountUrl = String(data.accountUrl ?? "").trim();
    return shell(
      labels[action] ?? "Pretplata je ažurirana",
      [greeting, deliveryDate ? `Sledeća dostava: ${deliveryDate}.` : "", cutoffAt ? `Rok za izmene: ${cutoffAt}.` : "", Number(data.adjustmentMinor ?? 0) > 0 ? `Kredit za sledeći obračun: ${money(data.adjustmentMinor)}.` : Number(data.adjustmentMinor ?? 0) < 0 ? `Doplatа za sledeći obračun: ${money(-Number(data.adjustmentMinor))}.` : ""].filter(Boolean),
      accountUrl ? { label: "Uredi pretplatu", url: accountUrl } : undefined,
    );
  }
  return shell("Potvrda porudžbine", [greeting, `Porudžbina ${orderNumber} je primljena. Ukupno: ${total}.`, deliveryDate ? `Planirana dostava: ${deliveryDate}.` : "", itemSummary ? `Stavke: ${itemSummary}.` : ""].filter(Boolean));
}
