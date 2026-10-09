import { test, expect } from "@playwright/test";
const origin = `http://localhost:${process.env.E2E_PORT || "4173"}`;
test("admin writes draft, previews, publishes, updates and unpublishes SEO page", async ({ page, request, context }) => {
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": `2001:db8:abcd:${crypto.randomUUID().slice(0,4)}::1` });
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Lozinka", { exact: true }).fill("e2e-admin-password");
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await page.getByRole("button", { name: "Podešavanja", exact: true }).click();
  await page.getByRole("button", { name: "Sadržaj sajta", exact: true }).click();
  await page.getByRole("button", { name: "Nova stranica", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const slug = `test-${crypto.randomUUID()}`;
  await dialog.getByLabel("URL: /informacije/").fill(slug);
  await dialog.getByLabel("Naslov stranice i SEO naslov").fill("Sveže mleko za vaš dom");
  await dialog.getByLabel("SEO opis").fill("Kako organizujemo redovnu dostavu mleka.");
  await dialog.getByLabel("Uvod", { exact: true }).fill("Dostava prema vašem ritmu.");
  await dialog.getByLabel("Podnaslov", { exact: true }).fill("Odaberite ritam");
  await dialog.getByLabel("Tekst", { exact: true }).fill("Nedeljno ili dvonedeljno.\n\n<script>window.evil=true</script>");
  await dialog.getByRole("button", { name: "Pregled pre objave" }).click();
  await expect(dialog.getByRole("article", { name: "Pregled stranice" })).toContainText("Odaberite ritam");
  await dialog.getByRole("button", { name: "Sačuvaj nacrt" }).click();
  await expect(dialog).not.toBeVisible();
  {
    // App Router can stream its shell before notFound() resolves (HTTP 200).
    const hidden = await request.get(`/informacije/${slug}`);
    expect([200, 404]).toContain(hidden.status());
    const body = await hidden.text();
    expect(body).toContain("Ova stranica ne postoji.");
    expect(body).toContain("noindex");
    expect(body).not.toContain("Sveže mleko za vaš dom");
    expect(body).not.toContain("Nedeljno ili dvonedeljno.");
  }
  const listing = page.locator("li").filter({ hasText: `/informacije/${slug}` });
  await listing.getByRole("button", { name: "Izmeni" }).click();
  await expect(dialog.getByLabel("URL: /informacije/")).toBeDisabled();
  await dialog.getByLabel("Vidljivost").selectOption("published");
  await dialog.getByRole("button", { name: "Sačuvaj i objavi" }).click();
  await expect(dialog).not.toBeVisible();
  const published = await request.get(`/informacije/${slug}`);
  expect(published.status()).toBe(200);
  const html = await published.text();
  expect(html).toContain(`<h1>Sveže mleko za vaš dom</h1>`);
  expect(html).toContain(`<h2>Odaberite ritam</h2>`);
  expect(html).toContain(`${origin}/informacije/${slug}`);
  expect(html).not.toContain("<script>window.evil=true</script>");
  expect(await (await request.get("/sitemap.xml")).text()).toContain(`/informacije/${slug}`);
  await listing.getByRole("button", { name: "Izmeni" }).click();
  await dialog.getByLabel("Vidljivost").selectOption("draft");
  await dialog.getByRole("button", { name: "Sačuvaj nacrt" }).click();
  await expect(dialog).not.toBeVisible();
  {
    // App Router can stream its shell before notFound() resolves (HTTP 200).
    const hidden = await request.get(`/informacije/${slug}`);
    expect([200, 404]).toContain(hidden.status());
    const body = await hidden.text();
    expect(body).toContain("Ova stranica ne postoji.");
    expect(body).toContain("noindex");
    expect(body).not.toContain("Sveže mleko za vaš dom");
    expect(body).not.toContain("Nedeljno ili dvonedeljno.");
  }
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain(`/informacije/${slug}`);
});

test("content pages enforce admin, same origin, validation and optimistic version", async ({ request }) => {
  const access = await request.post("/api/admin/access", { headers: { Origin: origin, "cf-connecting-ip": `2001:db8:beef:${crypto.randomUUID().slice(0,4)}::1` }, data: { email: "admin@example.test", password: "e2e-admin-password" } });
  expect(access.ok()).toBeTruthy();
  const authorization = `Bearer ${(await access.json()).sessionToken}`;
  const data = { slug: `api-${crypto.randomUUID()}`, title: "Naslov", description: "Opis", intro: "Uvod", sections: [], status: "draft" };
  expect((await request.get("/api/admin/content-pages")).status()).toBe(403);
  expect((await request.post("/api/admin/content-pages", { headers: { Authorization: authorization }, data })).status()).toBe(403);
  const headers = { Authorization: authorization, Origin: origin };
  expect((await request.post("/api/admin/content-pages", { headers, data: { ...data, slug: "../admin" } })).status()).toBe(422);
  const saved = await request.post("/api/admin/content-pages", { headers, data });
  expect(saved.ok()).toBeTruthy();
  const current = (await saved.json()).page;
  expect((await request.post("/api/admin/content-pages", { headers, data })).status()).toBe(409);
  expect((await request.post("/api/admin/content-pages", { headers, data: { ...data, expectedVersion: current.version, title: "Promena" } })).ok()).toBeTruthy();
  expect((await request.post("/api/admin/content-pages", { headers, data: { ...data, expectedVersion: current.version } })).status()).toBe(409);
  const readiness = await request.get("/api/admin/commerce-readiness", { headers });
  expect((await readiness.json()).payment.cardAvailable).toBe(false);
});
