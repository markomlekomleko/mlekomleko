import { DeliveryChecker } from "../delivery-checker";
import type { DeliveryWindow, StorefrontSettings } from "../../lib/frontend";

export function StepsSection({
  settings,
  delivery,
}: {
  settings: Pick<StorefrontSettings, "serviceAreaTitle" | "serviceAreaNote">;
  delivery: DeliveryWindow;
}) {
  return (
    <section className="steps" aria-labelledby="steps-title">
      <div className="page-shell">
        <div className="section-head">
          <p className="eyebrow">02 / Kako stiže do tebe</p>
          <h2 id="steps-title">Tri koraka, bez komplikovanja.</h2>
        </div>
        <ol className="steps-grid">
          <li>
            <span aria-hidden="true">01</span>
            <h3>Izabereš mleko i ritam.</h3>
            <p>Kravlje ili kozje, jednokratno ili kao redovna dostava.</p>
          </li>
          <li>
            <span aria-hidden="true">02</span>
            <h3>Potvrdimo termin.</h3>
            <p>Sledeći datum dostave i rok za izmene vidiš pre potvrde porudžbine.</p>
          </li>
          <li>
            <span aria-hidden="true">03</span>
            <h3>Flaša se vraća.</h3>
            <p>Od druge dostave preuzimamo čiste korišćene flaše i donosimo pune.</p>
          </li>
        </ol>
        <div id="proveri-dostavu" className="steps-delivery">
          <DeliveryChecker
            title={settings.serviceAreaTitle}
            note={settings.serviceAreaNote}
            delivery={delivery}
          />
        </div>
      </div>
    </section>
  );
}
