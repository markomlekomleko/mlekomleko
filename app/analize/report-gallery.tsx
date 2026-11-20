"use client";

/* eslint-disable @next/next/no-img-element -- Original report photos, shown untouched. */
import { useLocalize } from "@/app/lib/i18n/client";
import { useRef, useState } from "react";
import type { LabReport } from "../lib/analyses";

/** Report thumbnails that open full size in a dialog, so every line can be read. */
export function ReportGallery({ reports }: { reports: readonly LabReport[] }) {
  const localize = useLocalize();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<LabReport | null>(null);
  return localize((
    <>
      <ul className="report-grid">
        {reports.map((report) => (
          <li key={report.src}>
            <button type="button" className="report-thumb" onClick={() => { setOpen(report); dialog.current?.showModal(); }} aria-label={`Uvećaj izveštaj: ${report.label}`}>
              <img src={report.src} alt="" width={report.width} height={report.height} loading="lazy" />
            </button>
            <p>{report.label}</p>
          </li>
        ))}
      </ul>
      <dialog ref={dialog} className="report-dialog" aria-label={open ? `Izveštaj: ${open.label}` : "Izveštaj"} onClose={() => setOpen(null)}>
        {open ? <img src={open.src} alt={`Laboratorijski izveštaj: ${open.label}`} width={open.width} height={open.height} /> : null}
        <form method="dialog"><button className="button secondary small" type="submit">Zatvori</button></form>
      </dialog>
    </>
  ));
}
