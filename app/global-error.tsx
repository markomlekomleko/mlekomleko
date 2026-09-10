"use client";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="sr-Latn">
      <body>
        <main style={{ maxWidth: 720, margin: "8vh auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
          <h1>Došlo je do privremenog problema.</h1>
          <p>Pokušajte ponovo. Vaši podaci nisu prikazani na ovoj stranici.</p>
          {error.digest && <p>Šifra greške: {error.digest}</p>}
          <button type="button" onClick={retry}>Pokušaj ponovo</button>
        </main>
      </body>
    </html>
  );
}
