import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function signIn(page: Page) {
  await page.getByLabel("Korisničko ime").fill("e2e-admin");
  await page.getByLabel("Lozinka", { exact: true }).fill("e2e-admin-password");
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page.locator(".status-dot")).toHaveText("● Povezano");
}
async function download(page: Page, button: ReturnType<Page["getByRole"]>, testInfo: TestInfo, filename: string) {
  const pending = page.waitForEvent("download");
  await button.click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${filename.split(".").pop()}$`));
  const path = testInfo.outputPath(filename);
  await file.saveAs(path);
  expect(await file.failure()).toBeNull();
  return readFile(path);
}

test("admin requires fresh login on reload and downloads both delivery and individual confirmation formats", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const created = await page.request.post("/api/checkout", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      items: [{ productId: "prod_kravlje_1l", quantity: 3, purchaseType: "one_time" }], paymentMethod: "cash",
      customer: { email: `export-${crypto.randomUUID()}@example.test`, fullName: 'Željko "Čolić", QA', phone: "0601234567", addressLine1: "Čačanska 1, ulaz 2", city: "Beograd", postalCode: "11000", deliveryNote: "Pozvati pre dostave\nDrugi sprat" },
    },
  });
  expect(created.status()).toBe(201);
  const { order } = await created.json();
  for (const url of [`/api/admin/orders/${order.id}/export`, `/api/admin/deliveries/export?date=${order.deliveryDate}`]) {
    expect((await page.request.get(url)).status()).toBe(403);
  }
  await page.goto("/admin");
  const consent = page.getByRole("button", { name: "Samo neophodno" });
  if (await consent.isVisible()) await consent.click();

  await page.getByLabel("Korisničko ime").fill("e2e-admin");
  await page.getByLabel("Lozinka", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page.locator(".admin-access .notice.error")).toContainText("Korisničko ime ili lozinka nisu ispravni");
  await signIn(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Prijava u administraciju" })).toBeVisible();
  await expect(page.getByLabel("Lozinka", { exact: true })).toHaveValue("");
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toMatch(/e2e-admin|sessionToken/);
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Administracija" });
  await nav.getByRole("button", { name: "Porudžbine", exact: true }).click();
  const orderRow = page.getByRole("row").filter({ hasText: order.orderNumber });
  const csv = await download(page, orderRow.getByRole("button", { name: "Potvrda CSV" }), testInfo, "potvrda.csv");
  expect(csv.subarray(0, 3).toString("hex")).toBe("efbbbf");
  const headers = csv.toString().split("\r\n")[0].split(",");
  expect(new Set(headers).size).toBe(headers.length);
  expect(csv.toString()).toContain(order.orderNumber);
  expect(csv.toString()).toContain('Željko ""Čolić"", QA');
  expect(csv.toString()).toContain('"0601234567"');
  const xlsx = await download(page, orderRow.getByRole("button", { name: "Potvrda Excel" }), testInfo, "potvrda.xlsx");
  expect(xlsx.readUInt32LE(0)).toBe(0x04034b50);
  expect(xlsx.toString()).toContain('name="Potvrda"');
  expect(xlsx.toString()).toContain('name="Stavke"');
  expect(xlsx.toString()).toContain(`<v>${order.totalMinor / 100}</v>`);
  expect(xlsx.toString()).toContain('0601234567');

  await nav.getByRole("button", { name: "Dostave", exact: true }).click();
  await page.getByLabel("Datum", { exact: true }).fill(order.deliveryDate);
  await expect(page.locator(".status-dot")).toHaveText("● Povezano");
  const generate = page.locator(".inline-controls").getByRole("button", { name: /^(Generiši|Osveži)$/ });
  await generate.click();
  await expect(page.getByRole("status").filter({ hasText: "Lista dostave je generisana." })).toBeVisible();
  const deliveryCsv = await download(page, page.getByRole("button", { name: "CSV za Spoke" }), testInfo, "dostave.csv");
  expect(deliveryCsv.toString()).toContain('"Address Line 1"');
  expect(deliveryCsv.toString()).toContain('Željko ""Čolić"", QA');
  expect(deliveryCsv.toString()).toContain('3 x');
  const deliveryXlsx = await download(page, page.getByRole("button", { name: "Excel + priprema" }), testInfo, "dostave.xlsx");
  expect(deliveryXlsx.toString()).toContain('name="Dostave"');
  expect(deliveryXlsx.toString()).toContain('name="Priprema"');
  expect(deliveryXlsx.toString()).toContain('Čačanska 1, ulaz 2');
  await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Prijava u administraciju" })).toBeVisible();
});
