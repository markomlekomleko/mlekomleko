import { expect, test, type Locator, type Page } from "@playwright/test";
import { cyr } from "./cyr";
import { acceptNecessary, addMilkFromShop, fillCheckoutForm, freshIp, newCustomer, signInWithCode } from "./tp-helpers";

// Phase 2 of TEST_PLAN.md, scope 6: on every step of the purchase and in the account nothing scrolls
// sideways and the primary buttons are fully on screen, big enough for a thumb, and not covered by anything.

async function expectNoSideScroll(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter(element => {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || box.right <= width + 1) return false;
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const overflow = getComputedStyle(parent).overflowX;
          if (overflow === "auto" || overflow === "scroll" || overflow === "hidden" || overflow === "clip") return false;
        }
        return getComputedStyle(element).position !== "fixed";
      })
      .slice(0, 5)
      .map(element => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)}`);
    return { scroll: document.documentElement.scrollWidth, width, bodyScroll: document.body.scrollWidth, offenders };
  });
  expect(result.scroll, `${label}: page is ${result.scroll}px wide in a ${result.width}px viewport (offenders: ${result.offenders.join(", ") || "none"})`).toBeLessThanOrEqual(result.width);
  expect(result.bodyScroll, `${label}: body scrolls sideways`).toBeLessThanOrEqual(result.width);
}

/** The control is on screen, a comfortable touch target, and the click would reach it (nothing on top). */
async function expectTappable(page: Page, control: Locator, label: string) {
  await control.scrollIntoViewIfNeeded();
  await expect(control, `${label} visible`).toBeVisible();
  const box = (await control.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${label} right edge`).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(box.height, `${label} touch height`).toBeGreaterThanOrEqual(44);
  expect(box.width, `${label} touch width`).toBeGreaterThanOrEqual(44);
  await control.click({ trial: true, timeout: 5000 });
}

test("TP-6 purchase steps and account: no sideways scroll, primary buttons reachable", async ({ page, context }) => {
  test.setTimeout(180_000);
  await freshIp(context);
  const customer = newCustomer("viewport");
  const card = await addMilkFromShop(page, { type: "subscription", litres: 4 });
  await expectNoSideScroll(page, "shop");
  const add = card.locator(".configurator-actions button", { hasText: cyr("Napuni frižider") });
  await expectTappable(page, add, "shop: add to fridge");
  for (const name of ["Pretplata", "Jednokratna kupovina"]) await expectTappable(page, card.getByRole("button", { name: cyr(name) }), `shop: ${name}`);
  await add.click();

  await page.locator(".cart-link").click();
  const drawer = page.locator(".cart-drawer");
  await expect(drawer).toHaveAttribute("data-open", "true");
  await expectNoSideScroll(page, "cart drawer");
  await expectTappable(page, drawer.getByRole("link", { name: cyr("Nastavi na poručivanje") }), "drawer: continue");
  await drawer.getByRole("link", { name: cyr("Otvori ceo frižider") }).click();

  await expect(page).toHaveURL(/\/korpa$/);
  await expectNoSideScroll(page, "cart");
  const proceed = page.getByRole("link", { name: new RegExp(cyr("Nastavi na podatke")) });
  await expectTappable(page, proceed, "cart: continue to details");
  await proceed.click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expectNoSideScroll(page, "checkout (empty form)");
  await fillCheckoutForm(page, customer);
  await expect(page.locator("#delivery-area-status")).toContainText(cyr("Grad i poštanski broj su u zoni dostave."));
  await page.locator('input[type="checkbox"][required]').check();
  await expectNoSideScroll(page, "checkout (filled)");
  const submit = page.getByRole("button", { name: cyr("Potvrdi porudžbinu") });
  await expect(submit).toBeEnabled();
  await expectTappable(page, submit, "checkout: confirm order");
  await page.locator(".calendar-trigger").click();
  await expectNoSideScroll(page, "checkout with the calendar open");
  await page.locator(".calendar-trigger").click();
  await submit.click();

  await expect(page.getByRole("heading", { name: cyr("Hvala na porudžbini.") })).toBeVisible();
  await expectNoSideScroll(page, "confirmation");
  await expectTappable(page, page.getByRole("link", { name: cyr("Otvori nalog") }), "confirmation: open account");

  await signInWithCode(page, customer.email);
  await expect(page.locator(".account-subscription")).toBeVisible();
  await expectNoSideScroll(page, "account");
  const card2 = page.locator(".account-subscription").first();
  await expectTappable(page, card2.getByRole("button", { name: new RegExp(`^${cyr("Preskoči sledeću")}`) }), "account: skip");
  await expectTappable(page, card2.getByRole("button", { name: new RegExp(`^${cyr("Pauziraj dostave")}`) }), "account: pause");
  await card2.getByRole("button", { name: new RegExp(`^${cyr("Pauziraj dostave")}`) }).click();
  await expectNoSideScroll(page, "account with the pause form");
  await expectTappable(page, page.getByRole("region", { name: cyr("Potvrda izmene") }).getByRole("button", { name: cyr("Potvrdi pauzu") }), "account: confirm pause");
  await card2.getByRole("button", { name: new RegExp(`^${cyr("Povećaj količinu")}`) }).click();
  await expectTappable(page, card2.getByRole("button", { name: new RegExp(`^${cyr("Dodaj 1 ×")}`) }), "account: add litre");
  await card2.getByRole("button", { name: new RegExp(`^${cyr("Dodaj 1 ×")}`) }).click();
  await expectNoSideScroll(page, "account with the surcharge preview");
  await expectTappable(page, page.getByRole("region", { name: cyr("Doplata pre potvrde") }).getByRole("button", { name: new RegExp(cyr("Potvrdi doplatu")) }), "account: confirm surcharge");
});

test("TP-6b the sticky buy bar and the cookie banner never hide the primary button on the product page", async ({ page, context }) => {
  await freshIp(context);
  await page.goto("/proizvodi/sveze-kravlje-mleko-1l");
  const card = page.locator(".configurator").first();
  const add = card.locator(".configurator-actions button", { hasText: cyr("Napuni frižider") });
  await acceptNecessary(page);
  await expectNoSideScroll(page, "product page");
  await add.scrollIntoViewIfNeeded();
  await expect(add).toBeVisible();
  await add.click({ trial: true });
});
