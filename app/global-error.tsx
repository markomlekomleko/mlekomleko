"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="sr-Latn">
      <body>
        <main style={{ maxWidth: 720, margin: "8vh auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
          <h1>Došlo je do privremenog problema.</h1>
          <p>Pokušajte ponovo. Vaši podaci nisu prikazani na ovoj stranici.</p>
          <button type="button" onClick={reset}>Pokušaj ponovo</button>
        </main>
      </body>
    </html>
  );
}
