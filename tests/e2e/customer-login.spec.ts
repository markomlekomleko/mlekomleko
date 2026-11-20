import { expect, test } from "@playwright/test";
import { cyr } from "./cyr";

test("register without an order, verify email, and keep authentication out of browser storage", async ({
  page,
}) => {
  await page.goto("/nalog");
  await expect(
    page.getByRole("heading", { name: cyr("Prijavite se kodom") }),
  ).toBeVisible();
  const consent = page.getByRole("button", { name: cyr("Samo neophodno") });
  if (await consent.isVisible()) await consent.click();
  await page
    .getByRole("button", { name: cyr("Napravi nalog"), exact: true })
    .click();
  await page
    .getByLabel(cyr("Email adresa"))
    .fill(`signup-${crypto.randomUUID()}@example.test`);
  await expect(page.getByLabel(cyr("Lozinka"), { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: `test-results/registration-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: cyr("Napravi nalog i pošalji kod") })
    .click();
  const localCode = page.getByTestId("local-auth-code").locator("strong");
  await expect(localCode).toHaveText(/^[0-9]{6}$/);
  await page
    .getByLabel(cyr("Šestocifreni kod"))
    .fill((await localCode.textContent())!);
  await page.getByRole("button", { name: cyr("Potvrdi kod"), exact: true }).click();
  await expect(page).toHaveURL(/\/nalog$/);
  await page
    .locator("summary")
    .filter({ hasText: cyr("Prijava, email i WhatsApp") })
    .click();
  await expect(
    page.getByRole("heading", { name: cyr("Prijava i WhatsApp") }),
  ).toBeVisible();
  // The orders are a section of the account page now (no longer a collapsed "Moje porudžbine").
  await expect(page.locator("#porudzbine").getByRole("heading", { name: new RegExp(`^${cyr("Porudžbine")}`) })).toBeVisible();
  await expect(page.locator("#porudzbine").getByText(cyr("Još nemaš nijednu porudžbinu."))).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "mm_session",
  );
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem("mleko-i-mleko-session"),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: cyr("Odjavi se"), exact: true }).click();
  await expect(
    page.getByRole("heading", { name: cyr("Prijavite se kodom") }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/login-${test.info().project.name}.png`,
    fullPage: true,
  });
});
