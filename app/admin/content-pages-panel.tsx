"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Dialog, type Requester } from "./workspace-shared";
import type { ContentPage } from "../../server/content-pages";

type Draft = Omit<ContentPage, "version" | "updatedAt"> & { version?: string };
const blank = (): Draft => ({ slug: "", title: "", description: "", intro: "", sections: [{ heading: "", text: "" }], status: "draft" });
export function ContentPagesPanel({ request }: { request: Requester }) {
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const data = await request<{ pages: ContentPage[] }>("/api/admin/content-pages"); setPages(data.pages); }
    catch (e) { setError(e instanceof Error ? e.message : "Stranice nisu učitane."); }
  }, [request]);
  useEffect(() => {
    let active = true;
    request<{ pages: ContentPage[] }>("/api/admin/content-pages").then(data => { if (active) setPages(data.pages); }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Stranice nisu učitane."); });
    return () => { active = false; };
  }, [request]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const data = await request<{ page: ContentPage }>("/api/admin/content-pages", { method: "POST", body: JSON.stringify({ ...draft, expectedVersion: draft.version }) });
      setDraft(null); setMessage(data.page.status === "published" ? "Stranica je objavljena i dodata u sitemap." : "Nacrt je sačuvan. Nije javno dostupan."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Stranica nije sačuvana."); }
    finally { setBusy(false); }
  }
  return <section className="admin-panel"><div className="panel-heading"><div><h2>Informativne i SEO stranice</h2><p>Napišite novu stranicu, proverite prikaz i objavite je bez izmene koda.</p></div><button type="button" className="button small" onClick={() => { setError(""); setDraft(blank()); }}>Nova stranica</button></div>
    {message ? <p role="status">{message}</p> : null}{error && !draft ? <p role="alert">{error}</p> : null}
    {pages.length ? <ul className="list-clean">{pages.map(page => <li className="summary-row" key={page.slug}><span><strong>{page.title}</strong><small> · {page.status === "published" ? "Objavljeno" : "Nacrt"}</small><br /><small>/informacije/{page.slug}</small></span><div className="button-row">{page.status === "published" ? <a className="text-button" href={`/informacije/${page.slug}`} target="_blank" rel="noreferrer">Otvori</a> : null}<button className="button secondary small" type="button" onClick={() => { setError(""); setDraft(page); }}>Izmeni</button></div></li>)}</ul> : <p>Još nema dodatnih stranica.</p>}
    {draft ? <Dialog title={draft.version ? "Izmeni stranicu" : "Nova stranica"} onClose={() => { setDraft(null); setPreview(false); }} busy={busy}><form onSubmit={save} className="admin-form">
      {error ? <p role="alert">{error}</p> : null}
      <label className="field"><span>URL: /informacije/</span><input value={draft.slug} disabled={Boolean(draft.version)} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={90} placeholder="sveze-mleko-dostava" onChange={e => setDraft({ ...draft, slug: e.target.value })} /><small>Posle prvog čuvanja URL ostaje isti da postojeći linkovi rade.</small></label>
      <label className="field"><span>Naslov stranice i SEO naslov</span><input required maxLength={70} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label className="field"><span>SEO opis</span><textarea required maxLength={170} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /><small>{draft.description.length}/170 znakova</small></label>
      <label className="field"><span>Uvod</span><textarea required maxLength={2000} value={draft.intro} onChange={e => setDraft({ ...draft, intro: e.target.value })} /></label>
      {draft.sections.map((section, index) => <fieldset key={index} className="form-section-fields"><legend>Odeljak {index + 1}</legend><label className="field"><span>Podnaslov</span><input required maxLength={180} value={section.heading} onChange={e => setDraft({ ...draft, sections: draft.sections.map((v, i) => i === index ? { ...v, heading: e.target.value } : v) })} /></label><label className="field"><span>Tekst</span><textarea required maxLength={6000} rows={5} value={section.text} onChange={e => setDraft({ ...draft, sections: draft.sections.map((v, i) => i === index ? { ...v, text: e.target.value } : v) })} /></label><button type="button" className="text-button" onClick={() => setDraft({ ...draft, sections: draft.sections.filter((_, i) => i !== index) })}>Ukloni odeljak</button></fieldset>)}
      <button type="button" className="button secondary small" disabled={draft.sections.length >= 20} onClick={() => setDraft({ ...draft, sections: [...draft.sections, { heading: "", text: "" }] })}>Dodaj odeljak</button>
      <label className="field"><span>Vidljivost</span><select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Draft["status"] })}><option value="draft">Nacrt · nije javno dostupan</option><option value="published">Objavljeno · dostupno svima</option></select></label>
      <div className="button-row"><button type="submit" className="button" disabled={busy}>{busy ? "Čuvamo…" : draft.status === "published" ? "Sačuvaj i objavi" : "Sačuvaj nacrt"}</button><button type="button" className="button secondary" onClick={() => setPreview(!preview)}>{preview ? "Sakrij pregled" : "Pregled pre objave"}</button></div>
      {preview ? <article aria-label="Pregled stranice" className="admin-panel"><h2>{draft.title || "Naslov stranice"}</h2><p>{draft.intro}</p>{draft.sections.map((s, i) => <section key={i}><h3>{s.heading}</h3><p style={{ whiteSpace: "pre-line" }}>{s.text}</p></section>)}</article> : null}
    </form></Dialog> : null}
  </section>;
}
