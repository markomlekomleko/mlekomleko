"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { translate } from "../lib/i18n/translate";
import { intlLocales } from "@/app/lib/i18n/routing";
import { useState } from "react";
import { formatDate, type DeliverySchedule } from "../lib/frontend";

const dayNames = ["Nedelja", "Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak", "Subota"];
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

export function DeliveryCalendar({ schedule, value, onChange, recurring }: {
  schedule: DeliverySchedule;
  value: string;
  onChange: (date: string) => void;
  recurring: boolean;
}) {
  const localize = useLocalize();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value || schedule.dates[0] || "").slice(0, 7));
  const selectedDay = value ? weekday(value) : undefined;
  const dates = schedule.dates.filter(date => selectedDay === undefined || weekday(date) === selectedDay);
  const available = new Set(dates);
  const firstMonth = dates[0]?.slice(0, 7) ?? "";
  const lastMonth = dates.at(-1)?.slice(0, 7) ?? "";
  const displayedMonth = month < firstMonth || month > lastMonth ? firstMonth : month;
  const [year, monthNumber] = displayedMonth.split("-").map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const offset = (new Date(`${displayedMonth}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const changeMonth = (delta: number) => setMonth(new Date(Date.UTC(year, monthNumber - 1 + delta, 1)).toISOString().slice(0, 7));

  return localize((
    <section className="card form-stack delivery-schedule" aria-labelledby="delivery-schedule-title">
      <h2 id="delivery-schedule-title">Tvoj dan. Tvoj početak.</h2>
      <p className="muted">{schedule.city} · {schedule.weekdays.map(day => translate(dayNames[day], locale)).join(translate(" i ", locale))}. {recurring ? "Ritam svake nedelje ili svake 2 nedelje biraš za svaki proizvod u korpi." : "Izaberi kada želiš svoju dostavu."}</p>
      {!schedule.dates.length ? <p role="alert">Trenutno nema dostupnih termina. Kontaktiraj nas za dostavu.</p> : <>
        <fieldset className="fieldset delivery-weekdays">
          <legend>Dan dostave</legend>
          <div className="choice-row">
            {schedule.weekdays.map(day => <label key={day} className={`delivery-day-choice ${selectedDay === day ? "is-selected" : ""}`}>
              <input type="radio" name="deliveryWeekday" value={day} checked={selectedDay === day} disabled={!schedule.dates.some(date => weekday(date) === day)} onChange={() => {
                const next = schedule.dates.find(date => weekday(date) === day && date >= value) ?? schedule.dates.find(date => weekday(date) === day)!;
                onChange(next); setMonth(next.slice(0, 7));
              }} />{dayNames[day]}
            </label>)}
          </div>
        </fieldset>
        <div className="field">
          <span>{recurring ? "Datum prve dostave" : "Datum dostave"}</span>
          <button className="button secondary calendar-trigger" type="button" aria-expanded={open} aria-controls="delivery-calendar" onClick={() => { setMonth(value.slice(0, 7)); setOpen(!open); }}>
            <span>{value ? formatDate(value, locale) : "Izaberi datum"}</span><span aria-hidden="true">▦</span>
          </button>
        </div>
        {open && displayedMonth ? <div id="delivery-calendar" className="delivery-calendar" role="region" aria-label="Kalendar dostave">
          <div className="calendar-heading">
            <button type="button" aria-label="Prethodni mesec" disabled={displayedMonth <= firstMonth} onClick={() => changeMonth(-1)}>←</button>
            <strong aria-live="polite">{new Intl.DateTimeFormat(intlLocales[locale], { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${displayedMonth}-01T12:00:00Z`))}</strong>
            <button type="button" aria-label="Sledeći mesec" disabled={displayedMonth >= lastMonth} onClick={() => changeMonth(1)}>→</button>
          </div>
          <div className="calendar-grid">
            {["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"].map(day => <span className="calendar-weekday" key={day} aria-hidden="true">{day}</span>)}
            {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
            {Array.from({ length: count }, (_, i) => {
              const date = `${displayedMonth}-${String(i + 1).padStart(2, "0")}`;
              return <button key={date} type="button" disabled={!available.has(date)} aria-label={formatDate(date, locale)} aria-pressed={date === value} onClick={() => { onChange(date); setOpen(false); }}>{i + 1}</button>;
            })}
          </div>
          <p className="muted small-text">Dostupni su samo izabrani dani dostave. Praznici, prošli datumi i zaključeni termini ne mogu da se izaberu.</p>
        </div> : null}
        <p className="small-text" aria-live="polite">{recurring ? "Paket počinje" : "Dostava stiže"} <strong>{formatDate(value, locale)}</strong>. {recurring ? "Sve datume vidiš u pregledu porudžbine." : ""}</p>
      </>}
    </section>
  ));
}
