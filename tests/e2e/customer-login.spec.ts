import { expect, test } from "@playwright/test";

test("register without an order, verify email, and keep authentication out of browser storage", async ({ page }) => {
  await page.goto("/prijava");
  const consent = page.getByRole("button", { name: "Samo neophodno" });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("button", { name: "Napravi nalog", exact: true }).click();
  await page.getByLabel("Email adresa").fill(`signup-${crypto.randomUUID()}@example.test`);
  await page.getByLabel("Lozinka", { exact: true }).fill("a-long-customer-password");
  await page.screenshot({ path: `test-results/registration-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Napravi nalog i pošalji kod" }).click();
  const localCode = page.getByTestId("local-auth-code").locator("strong");
  await expect(localCode).toHaveText(/^[0-9]{6}$/);
  await page.getByLabel("Šestocifreni kod").fill((await localCode.textContent())!);
  await page.getByRole("button", { name: "Potvrdi kod", exact: true }).click();
  await expect(page).toHaveURL(/\/nalog$/);
  await expect(page.getByRole("heading", { name: "Prijava i WhatsApp" })).toBeVisible();
  await expect(page.getByText("Još nema porudžbina.")).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain("mm_session");
  expect(await page.evaluate(() => window.localStorage.getItem("mleko-i-mleko-session"))).toBeNull();
  await page.getByRole("button", { name: "Odjavi se", exact: true }).click();
  await expect(page.getByRole("link", { name: "Prijavi se ili napravi nalog" })).toBeVisible();
  await page.screenshot({ path: `test-results/login-${test.info().project.name}.png`, fullPage: true });
});
