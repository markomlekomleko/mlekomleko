export function RhythmSection() {
  return (
    <section className="rhythm" aria-labelledby="rhythm-title">
      <div className="page-shell">
        <div className="section-head">
          <p className="eyebrow">04 / Tvoj ritam dostave</p>
          <h2 id="rhythm-title">Jednokratno ili redovno. Ti biraš.</h2>
        </div>
        <div className="rhythm-grid">
          <article>
            <h3>Jednokratno</h3>
            <p>Naručiš samo za sledeću dostavu. Bez obaveze i bez pretplate.</p>
          </article>
          <article>
            <h3>Svake nedelje</h3>
            <p>Isti izbor stiže svake nedelje. Količinu menjaš do roka za izmene.</p>
          </article>
          <article>
            <h3>Svake 2 nedelje</h3>
            <p>Mirniji ritam za manje domaćinstvo. Preskakanje i pauza su na nalogu.</p>
          </article>
        </div>
        <p className="rhythm-note">
          Izmene, preskakanje i pauza mogući su do roka koji je naveden uz svaku dostavu.
        </p>
      </div>
    </section>
  );
}
