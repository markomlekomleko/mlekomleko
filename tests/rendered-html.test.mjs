import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const productFixture = {
  id: "product_milk_1",
  slug: "kravlje-mleko",
  name: "Kravlje mleko",
  description: "Sveže kravlje mleko.",
  unit_label: "L",
  price_minor: 25000,
  currency: "RSD",
  image_url: null,
  seo_title: "Kravlje mleko",
  seo_description: "Sveže kravlje mleko sa dostavom.",
  is_active: 1,
  created_at: "2026-08-28T10:00:00.000Z",
  updated_at: "2026-08-28T10:00:00.000Z",
};
const deliveryFixture = {
  id: "delivery_1",
  delivery_date: "2026-09-04",
  cutoff_at: "2026-09-03T06:00:00.000Z",
  status: "locked",
  generated_at: "2026-09-03T06:00:00.000Z",
  locked_at: "2026-09-03T06:00:00.000Z",
  generation_key: "delivery-test-key",
};
const deliveryOrderFixture = {
  id: "delivery_order_1",
  delivery_id: deliveryFixture.id,
  source_order_id: "order_1",
  subscription_id: null,
  customer_id: "customer_1",
  customer_snapshot_json: JSON.stringify({
    fullName: "Željko Petrović",
    email: "zeljko@example.com",
    phone: "+381601234567",
    addressLine1: "Bulevar oslobođenja 10",
    addressLine2: null,
    city: "Beograd",
    postalCode: "11000",
  }),
  note: '   =HYPERLINK("https://attacker.invalid")',
  status: "locked",
};
const deliveryItemFixture = {
  id: "delivery_item_1",
  delivery_order_id: deliveryOrderFixture.id,
  product_id: productFixture.id,
  product_name: productFixture.name,
  unit_label: productFixture.unit_label,
  quantity: 3,
  unit_price_minor: productFixture.price_minor,
  source_type: "order",
};

const queries = [];

class FakeD1Statement {
  constructor(sql) {
    this.sql = sql;
    this.bindings = [];
  }

  bind(...bindings) {
    this.bindings = bindings;
    return this;
  }

  async all() {
    queries.push({ method: "all", sql: this.sql, bindings: this.bindings });
    if (/\bFROM products\b/i.test(this.sql)) {
      return { success: true, results: [productFixture] };
    }
    if (/FROM delivery_orders JOIN customers/i.test(this.sql)) {
      return { success: true, results: [deliveryOrderFixture] };
    }
    if (/FROM delivery_items WHERE delivery_order_id IN/i.test(this.sql)) {
      return { success: true, results: [deliveryItemFixture] };
    }
    if (/SUM\(di\.quantity\)/i.test(this.sql)) {
      return {
        success: true,
        results: [
          {
            product_id: productFixture.id,
            product_name: productFixture.name,
            unit_label: productFixture.unit_label,
            total_quantity: 3,
          },
        ],
      };
    }
    return { success: true, results: [] };
  }

  async first() {
    queries.push({ method: "first", sql: this.sql, bindings: this.bindings });
    if (/\bFROM deliveries\b/i.test(this.sql)) return deliveryFixture;
    return /\bFROM products\b/i.test(this.sql) ? productFixture : null;
  }

  async run() {
    queries.push({ method: "run", sql: this.sql, bindings: this.bindings });
    return { success: true, meta: { changes: 1 } };
  }
}

const database = {
  prepare(sql) {
    return new FakeD1Statement(sql);
  },
  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  },
};

globalThis.__mlekoTestCloudflareEnv = {
  DB: database,
  ADMIN_SECRET: "test-admin-secret",
  PAYMENT_WEBHOOK_SECRET: "test-webhook-secret",
};
register(new URL("./cloudflare-loader.mjs", import.meta.url));

const runtimeEnv = {
  ...globalThis.__mlekoTestCloudflareEnv,
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};
const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

let workerPromise;
async function worker() {
  if (!workerPromise) {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
    workerPromise = import(workerUrl.href).then((module) => module.default);
  }
  return workerPromise;
}

async function request(path, init = {}, origin = "http://localhost") {
  const handler = await worker();
  return handler.fetch(
    new Request(`${origin}${path}`, init),
    runtimeEnv,
    executionContext,
  );
}

test("server-renders the Serbian storefront shell and useful home content", async () => {
  const response = await request("/", { headers: { accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="sr-Latn">/);
  assert.match(
    html,
    /<title>Sveže mleko na vašoj adresi \| Mleko i Mleko<\/title>/,
  );
  assert.match(html, /<h1[^>]*>Pravo mleko\. Bez odlaska u nabavku\.<\/h1>/);
  assert.match(html, /Jednom izaberite proizvode i ritam/);
  assert.match(html, /Proverite sledeću dostavu/);
  assert.match(html, /href="\/prodavnica"/);
  assert.match(html, /href="\/nalog"/);
  assert.match(html, /class="skip-link"[^>]*href="#glavni-sadrzaj"/);
  assert.match(html, /<main id="glavni-sadrzaj">/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|SkeletonPreview/);
});

test("core customer and admin pages render without a running dev server", async () => {
  const paths = [
    "/prodavnica",
    "/korpa",
    "/checkout",
    "/prijava",
    "/nalog",
    "/admin",
    "/kako-funkcionise",
    "/faq",
    "/kontakt",
  ];
  const responses = await Promise.all(
    paths.map((path) => request(path, { headers: { accept: "text/html" } })),
  );
  for (const [index, response] of responses.entries()) {
    assert.equal(response.status, 200, `${paths[index]} should render`);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    const html = await response.text();
    assert.match(html, /Mleko i Mleko/);
    assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
  }
});

test("robots and sitemap expose public pages while blocking private flows", async () => {
  const [robotsResponse, sitemapResponse] = await Promise.all([
    request("/robots.txt"),
    request("/sitemap.xml"),
  ]);
  assert.equal(robotsResponse.status, 200);
  const robots = await robotsResponse.text();
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/nalog/);
  assert.match(robots, /Disallow: \/checkout/);
  assert.match(robots, /Sitemap: http:\/\/localhost:3000\/sitemap\.xml/);

  assert.equal(sitemapResponse.status, 200);
  assert.match(sitemapResponse.headers.get("content-type") ?? "", /xml/i);
  const sitemap = await sitemapResponse.text();
  assert.match(sitemap, /<loc>http:\/\/localhost:3000<\/loc>/);
  assert.match(sitemap, /<loc>http:\/\/localhost:3000\/prodavnica<\/loc>/);
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/(?:admin|nalog|checkout)<\/loc>/);
});

test("products API maps D1 rows into the public contract", async () => {
  queries.length = 0;
  const response = await request("/api/products", {
    headers: { accept: "application/json" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const payload = await response.json();
  assert.deepEqual(payload, {
    products: [
      {
        id: "product_milk_1",
        slug: "kravlje-mleko",
        name: "Kravlje mleko",
        shortDescription: "",
        description: "Sveže kravlje mleko.",
        category: "Ostalo",
        unitLabel: "L",
        priceMinor: 25000,
        subscriptionPriceMinor: 25000,
        compareAtPriceMinor: null,
        currency: "RSD",
        imageUrl: null,
        imageAlt: "",
        badge: null,
        origin: "",
        isFeatured: false,
        allowSubscription: true,
        isDemo: false,
        sortOrder: 0,
        seoTitle: "Kravlje mleko",
        seoDescription: "Sveže kravlje mleko sa dostavom.",
        isActive: true,
        createdAt: "2026-08-28T10:00:00.000Z",
        updatedAt: "2026-08-28T10:00:00.000Z",
      },
    ],
  });
  assert.ok(queries.some((entry) => /WHERE is_active = 1/i.test(entry.sql)));
});

test("checkout rejects raw card data before touching the database", async () => {
  queries.length = 0;
  const response = await request("/api/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "checkout-test-123",
    },
    body: JSON.stringify({
      customer: { email: "customer@example.com" },
      payment: { cardNumber: "4111111111111111", cvv: "123" },
    }),
  });
  assert.equal(response.status, 422);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.error.code, "CARD_DATA_REJECTED");
  assert.doesNotMatch(JSON.stringify(payload), /4111111111111111|123/);
  assert.equal(queries.length, 0);
});

test("checkout prices products server-side and stores only allowlisted attribution", async () => {
  queries.length = 0;
  const response = await request("/api/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "checkout-allowlist-456",
    },
    body: JSON.stringify({
      customer: {
        fullName: "Test Kupac",
        email: "kupac@example.com",
        phone: "+381600000000",
        addressLine1: "Test ulica 1",
        city: "Beograd",
        postalCode: "11000",
      },
      items: [
        {
          productId: productFixture.id,
          quantity: 2,
          purchaseType: "one_time",
        },
      ],
      paymentMethod: "cash",
      // Browser totals are deliberately ignored by the backend.
      totalMinor: 1,
      attribution: {
        query:
          "?utm_source=newsletter&utm_campaign=avgust&email=private%40example.com&unexpected=secret",
        referrer: "https://instagram.com/story/123",
      },
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.order.totalMinor, productFixture.price_minor * 2);
  assert.equal(payload.order.currency, "RSD");
  assert.equal(payload.order.paymentStatus, "pending");

  const customerInsert = queries.find((entry) =>
    /^INSERT INTO customers\b/i.test(entry.sql),
  );
  assert.ok(customerInsert, "customer snapshot should be written");
  const attribution = JSON.parse(customerInsert.bindings[9]);
  assert.deepEqual(attribution, {
    utm_source: "newsletter",
    utm_campaign: "avgust",
    referrer_host: "instagram.com",
  });
  assert.doesNotMatch(
    JSON.stringify(attribution),
    /private@example\.com|unexpected|secret/,
  );
});

test("admin delivery export returns a complete formula-safe UTF-8 Spoke CSV", async () => {
  queries.length = 0;
  const response = await request(
    "/api/admin/deliveries/export?date=2026-09-04",
    {
      headers: { "x-admin-secret": "test-admin-secret" },
    },
    "https://shop.example.test",
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/csv/i);
  assert.match(
    response.headers.get("content-disposition") ?? "",
    /spoke-2026-09-04\.csv/,
  );
  assert.equal(response.headers.get("cache-control"), "no-store");

  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = new TextDecoder().decode(bytes);
  assert.match(
    csv,
    /^"Address Line 1","Address Line 2","City","Postal Code","Customer name","Phone","Email","Notes","Order ID","Products"\r\n/,
  );
  assert.match(csv, /Željko Petrović/);
  assert.match(csv, /3 x Kravlje mleko \(L\)/);
  assert.match(
    csv,
    /"'=HYPERLINK\(""https:\/\/attacker\.invalid""\)"/,
  );
  assert.match(csv, /"order_1"/);
});

test("admin delivery Excel contains route and preparation sheets", async () => {
  queries.length = 0;
  const response = await request(
    "/api/admin/deliveries/export?date=2026-09-04&format=xlsx",
    { headers: { "x-admin-secret": "test-admin-secret" } },
    "https://shop.example.test",
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /spreadsheetml/);
  assert.match(response.headers.get("content-disposition") ?? "", /dostave-2026-09-04\.xlsx/);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const packageText = new TextDecoder().decode(bytes);
  assert.match(packageText, /xl\/worksheets\/sheet1\.xml/);
  assert.match(packageText, /xl\/worksheets\/sheet2\.xml/);
  assert.match(packageText, /Customer name/);
  assert.match(packageText, /Ukupna količina/);
  assert.match(packageText, /Željko Petrović/);
  assert.match(packageText, /Kravlje mleko/);
});

test("admin and payment webhook routes deny invalid credentials before DB access", async () => {
  queries.length = 0;
  const [adminResponse, webhookResponse] = await Promise.all([
    request("/api/admin/dashboard", {}, "https://shop.example.test"),
    request(
      "/api/webhooks/payments",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-webhook-secret": "wrong-secret",
        },
        body: JSON.stringify({
          eventId: "evt_1",
          orderId: "ord_1",
          status: "paid",
        }),
      },
      "https://shop.example.test",
    ),
  ]);

  assert.equal(adminResponse.status, 403);
  assert.equal((await adminResponse.json()).error.code, "ADMIN_FORBIDDEN");
  assert.equal(webhookResponse.status, 401);
  assert.equal(
    (await webhookResponse.json()).error.code,
    "INVALID_WEBHOOK_SIGNATURE",
  );
  assert.equal(queries.length, 0);
});
