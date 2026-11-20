// TEST_PLAN Phase 2, section E (time) with the section F four-check helper.
// The clock is moved, never waited for: globalThis.Date is replaced (tests/tp-efg-harness.mjs).
// The daily job is the real cron route GET /api/jobs/scheduled at 08:00 UTC; the admin confirms
// each handover on its day through POST /api/admin/deliveries {action:'complete'}.
// Run: node --test tests/tp-e-time.test.mjs   (uses the prebuilt dist/ bundle)
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  setup, teardown, at, api, ok, fails, buy, sub, session, mutate, job, adminDelivery, adminList, confirm, recordPayment,
  outboxMarker, outboxSince, topicCounts, rows, one, scalar, addDays, weekday, fourChecks, globalInvariants, CRON, customer,
} from './tp-efg-harness.mjs';

beforeEach(() => setup());
afterEach(() => teardown());

const PACKAGE = 4 * 2 * 25000 + 4 * 35000; // 4 weekly deliveries × 2 L × 250 RSD + 4 × 350 RSD delivery = 3 400 RSD

/** The daily cron run at 08:00 UTC (09:00 CET / 10:00 CEST). */
async function runJob(date, time = '08:00:00') {
  at(`${date}T${time}Z`);
  return ok(await job());
}
/** Admin confirms the stop of this subscription on its day (10:00 UTC); cash is taken when the admin view says so. */
async function handover(date, subscriptionId, { time = '10:00:00', clock, extra = {} } = {}) {
  at(clock ?? `${date}T${time}Z`);
  const list = await adminList(date);
  const stop = list.orders.find((o) => o.subscription_id === subscriptionId);
  assert.ok(stop, `a stop for ${subscriptionId} on ${date}: ${JSON.stringify(list.orders.map((o) => o.subscription_id))}`);
  const preview = await adminDelivery(date);
  const cashDue = preview.orders.filter((o) => o.subscription_id === subscriptionId).reduce((n, o) => n + Number(o.cash_due_minor ?? 0), 0);
  const result = ok(await confirm(stop.id, { ...(cashDue > 0 ? { cashCollected: true } : {}), ...extra }));
  return { stop, result, cashDue };
}
const realizedDates = (subscriptionId) => rows("SELECT d.delivery_date FROM delivery_orders dor JOIN deliveries d ON d.id = dor.delivery_id WHERE dor.subscription_id = ? AND dor.status = 'delivered' ORDER BY d.delivery_date", subscriptionId).map((r) => r.delivery_date);
const stopsOn = (date, subscriptionId) => Number(scalar("SELECT COUNT(*) FROM delivery_orders dor JOIN deliveries d ON d.id = dor.delivery_id WHERE d.delivery_date = ? AND dor.subscription_id = ?", date, subscriptionId));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// E1 — one subscription, day by day, 11 weeks (8 Jan → 27 Mar 2027, before the March DST change)
// ─────────────────────────────────────────────────────────────────────────────────────────────
test('E1 eleven weeks of one cash subscription (Beograd, Tuesday): purchase → 4 handovers → renewal → admin payment → skip → pause → resume → cancel renewal → last handover → ended; four checks after every step', async () => {
  // Purchase on Friday 8 Jan for Tuesday 12 Jan (cutoff Sun 10 Jan 19:00), cash at the first delivery.
  at('2027-01-08T10:00:00Z');
  let marker = outboxMarker();
  const bought = await buy({ deliveryDate: '2027-01-12' });
  const id = bought.subscription.id;
  const cookie = session();
  assert.equal(bought.order.totalMinor, PACKAGE);
  assert.deepEqual([bought.order.subtotalMinor, bought.order.deliveryFeeMinor], [200000, 140000]);
  await fourChecks('purchase', {
    subscriptionId: id, cookie, marker,
    expect: { status: 'active', renewalEnabled: true, nextDeliveryDate: '2027-01-12', packages: [['open', 'pending', 0]], orderTotals: [PACKAGE], credits: [], summary: [4, 0, 4, 'pending'] },
    adminDate: '2027-01-12', adminExpect: { stops: 1, litres: 2, cashDue: PACKAGE },
    topics: { 'order.created': 1, 'email.order_confirmation.requested': 1, 'payment.cash_due': 1, 'subscription.activated': 1 },
    forbiddenTopics: ['fiscal.receipt.requested', 'payment.captured', 'billing.invoice_created'],
  });

  // Plan of the life: which Tuesdays carry a handover, which customer action happens on which day.
  const realized = ['2027-01-12', '2027-01-19', '2027-01-26', '2027-02-02', '2027-02-09', '2027-02-23', '2027-03-09', '2027-03-16'];
  const noDelivery = ['2027-02-16' /* skipped */, '2027-03-02' /* paused */, '2027-03-23' /* ended */];
  const summaries = { '2027-01-12': [4, 1, 3, 'paid'], '2027-01-19': [4, 2, 2, 'paid'], '2027-01-26': [4, 3, 1, 'paid'], '2027-02-02': null, '2027-02-09': [4, 1, 3, 'paid'], '2027-02-23': [4, 2, 2, 'paid'], '2027-03-09': [4, 3, 1, 'paid'], '2027-03-16': null };
  const packagesAfter = {
    '2027-01-12': [['open', 'paid', 1]], '2027-01-19': [['open', 'paid', 2]], '2027-01-26': [['open', 'paid', 3]], '2027-02-02': [['completed', 'paid', 4]],
    '2027-02-09': [['completed', 'paid', 4], ['open', 'paid', 1]], '2027-02-23': [['completed', 'paid', 4], ['open', 'paid', 2]],
    '2027-03-09': [['completed', 'paid', 4], ['open', 'paid', 3]], '2027-03-16': [['completed', 'paid', 4], ['completed', 'paid', 4]],
  };
  const nextAfter = { '2027-01-12': '2027-01-19', '2027-01-19': '2027-01-26', '2027-01-26': '2027-02-02', '2027-02-02': '2027-02-09', '2027-02-09': '2027-02-16', '2027-02-23': '2027-03-02', '2027-03-09': '2027-03-16' };
  let renewalOrderId = null;

  for (let date = '2027-01-09'; date <= '2027-03-27'; date = addDays(date, 1)) {
    // ── daily job ──────────────────────────────────────────────────────────────────────────
    marker = outboxMarker();
    const run = await runJob(date);
    assert.equal(run.date, date);
    const jobTopics = topicCounts(outboxSince(marker).filter((r) => r.aggregate_id === id || r.aggregate_type === 'order'));
    const tomorrow = addDays(date, 1);
    assert.equal(jobTopics['email.delivery_reminder.requested'] ?? 0, realized.includes(tomorrow) ? 1 : 0, `${date}: "tomorrow" reminder only before a real handover (${JSON.stringify(jobTopics)})`);
    assert.equal(jobTopics['email.delivery_deadline.requested'] ?? 0, weekday(date) === 0 && realized.includes(addDays(date, 2)) ? 1 : 0, `${date}: cutoff-day reminder (Sunday) only before a real handover`);
    assert.equal(jobTopics['billing.invoice_created'] ?? 0, date === '2027-02-03' ? 1 : 0, `${date}: renewal only the day after the 4th realized delivery`);
    // Only route days get a delivery list.
    assert.deepEqual(rows('SELECT delivery_date FROM deliveries').filter((r) => ![2, 5].includes(weekday(r.delivery_date))), [], `${date}: no list on a non-delivery weekday`);
    globalInvariants(date);

    if (date === '2027-02-03') {
      renewalOrderId = scalar("SELECT id FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice' AND delivery_date = '2027-02-09'", id);
      assert.ok(renewalOrderId, 'renewal package order for Tue 9 Feb');
      await fourChecks('automatic renewal', {
        subscriptionId: id, cookie, marker,
        expect: { status: 'active', renewalEnabled: true, nextDeliveryDate: '2027-02-09', packages: [['completed', 'paid', 4], ['open', 'pending', 0]], orderTotals: [PACKAGE, PACKAGE], credits: [], summary: [4, 0, 4, 'pending'] },
        adminDate: '2027-02-09', adminExpect: { stops: 1, litres: 2, cashDue: PACKAGE },
        topics: { 'billing.invoice_created': 1, 'payment.cash_due': 1, 'email.invoice.requested': 1 },
        forbiddenTopics: ['fiscal.receipt.requested', 'payment.captured'],
      });
    }

    // ── the day's handover or customer/admin action ────────────────────────────────────────
    if (realized.includes(date)) {
      marker = outboxMarker();
      const { cashDue } = await handover(date, id);
      assert.equal(cashDue, date === '2027-01-12' ? PACKAGE : 0, `${date}: cash is collected only at the first visit of the first (cash) package`);
      await fourChecks(`handover ${date}`, {
        subscriptionId: id, cookie, marker,
        expect: { packages: packagesAfter[date], summary: summaries[date], ...(nextAfter[date] ? { nextDeliveryDate: nextAfter[date] } : {}), credits: [], status: date === '2027-03-16' ? 'cancelled' : 'active' },
        adminDate: date, adminExpect: { stops: 1, litres: 2, cashDue: 0 },
        topics: { 'fiscal.delivery.requested': 1, ...(date === '2027-01-12' ? { 'fiscal.receipt.requested': 1, 'email.receipt.requested': 1 } : {}) },
        forbiddenTopics: [...(date === '2027-01-12' ? [] : ['fiscal.receipt.requested', 'email.receipt.requested']), 'billing.invoice_created'],
      });
    }
    if (noDelivery.includes(date)) {
      assert.equal(stopsOn(date, id), 0, `${date}: no stop for this subscription`);
      const view = await adminList(date);
      assert.equal(view.orders.filter((o) => o.subscription_id === id).length, 0, `${date}: admin list has no stop`);
    }
    if (date === '2027-02-04') {
      at('2027-02-04T10:00:00Z');
      marker = outboxMarker();
      ok(await recordPayment(renewalOrderId));
      await fourChecks('admin records the renewal payment', {
        subscriptionId: id, cookie, marker,
        expect: { status: 'active', nextDeliveryDate: '2027-02-09', packages: [['completed', 'paid', 4], ['open', 'paid', 0]], orderTotals: [PACKAGE, PACKAGE], summary: [4, 0, 4, 'paid'] },
        adminDate: '2027-02-09', adminExpect: { stops: 1, litres: 2, cashDue: 0 },
        topics: { 'fiscal.receipt.requested': 1, 'email.receipt.requested': 1 },
        forbiddenTopics: ['billing.invoice_created', 'payment.captured'],
      });
      // Recording the same payment again changes nothing.
      ok(await recordPayment(renewalOrderId));
      assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic='fiscal.receipt.requested' AND aggregate_id=?", renewalOrderId)), 1);
    }
    if (date === '2027-02-10') {
      at('2027-02-10T10:00:00Z');
      marker = outboxMarker();
      ok(await mutate(id, 'skip_next', {}, cookie));
      await fourChecks('skip next week (16 Feb)', {
        subscriptionId: id, cookie, marker,
        expect: { status: 'active', nextDeliveryDate: '2027-02-23', summary: [4, 1, 3, 'paid'], credits: [] },
        adminDate: '2027-02-16', adminExpect: { stops: 0, litres: 0 },
        topics: { 'subscription.skip_next': 1 }, forbiddenTopics: ['billing.invoice_created', 'payment.cash_due'],
      });
    }
    if (date === '2027-02-24') {
      at('2027-02-24T10:00:00Z');
      marker = outboxMarker();
      ok(await mutate(id, 'pause', { pauseUntil: '2027-03-17' }, cookie));
      await fourChecks('pause', {
        subscriptionId: id, cookie, marker,
        expect: { status: 'paused', nextDeliveryDate: '2027-03-23', summary: [4, 2, 2, 'paid'], credits: [] },
        adminDate: '2027-03-02', adminExpect: { stops: 0, litres: 0 },
        topics: { 'subscription.pause': 1 }, forbiddenTopics: ['billing.invoice_created'],
      });
    }
    if (date === '2027-03-03') {
      at('2027-03-03T10:00:00Z');
      marker = outboxMarker();
      ok(await mutate(id, 'resume', {}, cookie));
      await fourChecks('resume after one paused week', {
        subscriptionId: id, cookie, marker,
        expect: { status: 'active', nextDeliveryDate: '2027-03-09', summary: [4, 2, 2, 'paid'], credits: [] },
        adminDate: '2027-03-09', adminExpect: { stops: 1, litres: 2, cashDue: 0 },
        topics: { 'subscription.resume': 1 }, forbiddenTopics: ['billing.invoice_created'],
      });
    }
    if (date === '2027-03-10') {
      at('2027-03-10T10:00:00Z');
      marker = outboxMarker();
      const cancelled = ok(await mutate(id, 'cancel', {}, cookie));
      assert.equal(cancelled.cancelAfterPackage, true);
      await fourChecks('cancel renewal (paid package keeps running)', {
        subscriptionId: id, cookie, marker,
        expect: { status: 'active', renewalEnabled: false, nextDeliveryDate: '2027-03-16', summary: [4, 3, 1, 'paid'], credits: [] },
        adminDate: '2027-03-16', adminExpect: { stops: 1, litres: 2, cashDue: 0 },
        topics: { 'subscription.cancel': 1 }, forbiddenTopics: ['billing.invoice_created'],
      });
    }
  }

  // ── the end of the life ──────────────────────────────────────────────────────────────────
  const end = await fourChecks('after the end (27 Mar)', {
    subscriptionId: id, cookie,
    expect: { status: 'cancelled', renewalEnabled: false, packages: [['completed', 'paid', 4], ['completed', 'paid', 4]], orderTotals: [PACKAGE, PACKAGE], credits: [], summary: null },
    adminDate: '2027-03-23', adminExpect: { stops: 0, litres: 0 },
  });
  assert.deepEqual(realizedDates(id), realized, 'exactly the planned handovers, all on Tuesdays');
  assert.ok(realized.every((d) => weekday(d) === 2));
  assert.equal(Number(scalar("SELECT COUNT(*) FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice'", id)), 2, 'two packages, never a third after the cancellation');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'billing.invoice_created'")), 1);
  assert.equal(Number(scalar("SELECT SUM(COALESCE(di.delivered_quantity, di.quantity)) FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id WHERE dor.subscription_id = ? AND dor.status = 'delivered'", id)), 16, '8 × 2 L handed over = 2 paid packages');
  assert.equal(Number(scalar("SELECT COALESCE(SUM(total_minor), 0) FROM orders WHERE subscription_id = ? AND payment_status = 'paid'", id)), 2 * PACKAGE, 'paid exactly two packages');
  assert.equal(end.account.loyalty.progress, 8, 'loyalty counts the 8 realized deliveries');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'email.delivery_reminder.requested' AND aggregate_id = ?", id)), 8, 'one "tomorrow" reminder per realized delivery, none for skip/pause/end');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// E2 — month and year rollover
// ─────────────────────────────────────────────────────────────────────────────────────────────
test('E2 a package starting Tue 22 Dec 2026 runs 22 Dec, 29 Dec, 5 Jan, 12 Jan and renews once on the same weekday in the new year', async () => {
  at('2026-12-18T10:00:00Z');
  const quote = ok(await api('/api/cart', { items: [sub()], deliveryDate: '2026-12-22', city: 'Beograd', postalCode: '11000' }));
  assert.deepEqual(quote.lines[0].deliveryDates, ['2026-12-22', '2026-12-29', '2027-01-05', '2027-01-12']);
  assert.equal(quote.totalMinor, PACKAGE, 'the year end does not shorten the package');
  const bought = await buy({ deliveryDate: '2026-12-22', paymentMethod: 'card' });
  const id = bought.subscription.id;
  assert.equal(bought.order.totalMinor, PACKAGE);
  const planned = ['2026-12-22', '2026-12-29', '2027-01-05', '2027-01-12'];
  for (let date = '2026-12-19'; date <= '2027-01-20'; date = addDays(date, 1)) {
    await runJob(date);
    if (planned.includes(date) || date === '2027-01-19') await handover(date, id);
    globalInvariants(date);
  }
  assert.deepEqual(realizedDates(id), [...planned, '2027-01-19']);
  const packages = rows("SELECT o.delivery_date, o.order_number, o.total_minor, o.payment_status, sp.status FROM subscription_packages sp JOIN orders o ON o.id = sp.order_id WHERE sp.subscription_id = ? ORDER BY o.delivery_date", id);
  assert.equal(packages.length, 2, JSON.stringify(packages));
  assert.deepEqual(packages.map((p) => [p.delivery_date, p.total_minor, p.payment_status]), [['2026-12-22', PACKAGE, 'paid'], ['2027-01-19', PACKAGE, 'paid']], 'renewal on the next Tuesday, 19 Jan 2027, full price');
  assert.match(packages[1].order_number, /^MM-202701-/);
  assert.equal(stopsOn('2027-01-19', id), 1, 'the renewed package is on the 19 Jan list');
  assert.equal(stopsOn('2027-01-15', id) + stopsOn('2027-01-01', id), 0, 'never on a Friday (1 Jan, 15 Jan)');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'billing.invoice_created'")), 1);
  const view = (await fourChecks('year rollover', { subscriptionId: id, expect: { status: 'active', nextDeliveryDate: '2027-01-26', summary: [4, 1, 3, 'paid'] } })).view;
  assert.equal(weekday(view.nextDeliveryDate), 2);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// E3 — daylight saving time in Europe/Belgrade (28 Mar 2027 → CEST, 31 Oct 2027 → CET)
// ─────────────────────────────────────────────────────────────────────────────────────────────
const cutoffCases = [
  // [delivery date, expected cutoff instant (UTC) = 19:00 local two days before a 07:00 route]
  ['2027-03-23', '2027-03-21T18:00:00.000Z'], // Tue, CET (UTC+1)
  ['2027-03-26', '2027-03-24T18:00:00.000Z'], // Fri before the change
  ['2027-03-30', '2027-03-28T17:00:00.000Z'], // Tue after the change: Sunday 28 Mar is the changeover day itself
  ['2027-04-02', '2027-03-31T17:00:00.000Z'], // Fri, CEST (UTC+2)
  ['2027-10-26', '2027-10-24T17:00:00.000Z'], // Tue, CEST
  ['2027-10-29', '2027-10-27T17:00:00.000Z'], // Fri before the October change
  ['2027-11-02', '2027-10-31T18:00:00.000Z'], // Tue after the change: Sunday 31 Oct is the changeover day itself
  ['2027-11-05', '2027-11-03T18:00:00.000Z'], // Fri, CET
];
test('E3a DST: the cutoff is 19:00 local two days before a 07:00 delivery on both sides of both changes (cart quote; the account view is checked in E3d)', async () => {
  at('2027-03-15T10:00:00Z');
  for (const [date, cutoff] of cutoffCases) {
    at(addDays(date, -10) + 'T10:00:00Z');
    const quote = ok(await api('/api/cart', { items: [sub()], deliveryDate: date, city: 'Beograd', postalCode: '11000' }));
    assert.equal(quote.cutoffAt, cutoff, `${date} cutoff`);
    const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Belgrade', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(cutoff));
    assert.equal(local, weekday(date) === 2 ? 'Sun 19:00' : 'Wed 19:00', `${date}: cutoff local time`);
    assert.ok(quote.lines[0].deliveryDates.every((d) => weekday(d) === weekday(date)), `${date}: package stays on its weekday ${quote.lines[0].deliveryDates}`);
  }
});

test('E3b DST March: a skip one minute before the 19:00 local cutoff on changeover Sunday is accepted, at 19:00 it is refused; the Tuesday route locks and runs on Tuesday', async () => {
  at('2027-03-19T10:00:00Z');
  const early = await buy({ deliveryDate: '2027-03-23', email: 'tp-efg-dst-a@example.test' });
  const late = await buy({ deliveryDate: '2027-03-23', email: 'tp-efg-dst-b@example.test' });
  for (let date = '2027-03-20'; date <= '2027-03-23'; date = addDays(date, 1)) await runJob(date);
  await handover('2027-03-23', early.subscription.id);
  await handover('2027-03-23', late.subscription.id);
  // Next delivery Tue 30 Mar; its cutoff is Sun 28 Mar 19:00 CEST = 17:00 UTC (the day the clocks go forward).
  for (let date = '2027-03-24'; date <= '2027-03-28'; date = addDays(date, 1)) await runJob(date);
  at('2027-03-28T16:59:00Z');
  ok(await mutate(early.subscription.id, 'skip_next', {}, session('tp-efg-dst-a@example.test')));
  at('2027-03-28T17:00:00Z');
  fails(await mutate(late.subscription.id, 'skip_next', {}, session('tp-efg-dst-b@example.test')), 409, 'DELIVERY_LOCKED');
  await runJob('2027-03-29');
  assert.equal(scalar("SELECT status FROM deliveries WHERE delivery_date = '2027-03-30'"), 'locked');
  assert.equal(scalar("SELECT cutoff_at FROM deliveries WHERE delivery_date = '2027-03-30'"), '2027-03-28T17:00:00.000Z');
  // The Monday job (10:00 CEST) queued the "tomorrow" reminder for the customer who did not skip.
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'email.delivery_reminder.requested' AND aggregate_id = ? AND json_extract(payload_json,'$.deliveryDate') = '2027-03-30'", late.subscription.id)), 1);
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'email.delivery_reminder.requested' AND aggregate_id = ? AND json_extract(payload_json,'$.deliveryDate') = '2027-03-30'", early.subscription.id)), 0);
  await handover('2027-03-30', late.subscription.id);
  assert.equal(stopsOn('2027-03-30', early.subscription.id), 0);
  assert.equal(one('SELECT next_delivery_date d FROM subscriptions WHERE id = ?', early.subscription.id).d, '2027-04-06');
  assert.equal(one('SELECT next_delivery_date d FROM subscriptions WHERE id = ?', late.subscription.id).d, '2027-04-06');
  for (const s of [early, late]) assert.ok(realizedDates(s.subscription.id).every((d) => weekday(d) === 2));
});

test('E3c DST October: a Novi Sad Friday package across 31 Oct 2027 (22 Oct, 29 Oct, 5 Nov, 12 Nov) keeps Friday, cutoffs stay Wednesday 19:00 local, renews once', async () => {
  at('2027-10-18T10:00:00Z');
  const bought = await buy({ deliveryDate: '2027-10-22', city: 'Novi Sad', postalCode: '21000', email: 'tp-efg-ns@example.test', paymentMethod: 'card' });
  const id = bought.subscription.id;
  const planned = ['2027-10-22', '2027-10-29', '2027-11-05', '2027-11-12'];
  for (let date = '2027-10-19'; date <= '2027-11-14'; date = addDays(date, 1)) {
    await runJob(date);
    if (planned.includes(date)) await handover(date, id);
  }
  assert.deepEqual(realizedDates(id), planned);
  assert.deepEqual(rows("SELECT delivery_date, cutoff_at FROM deliveries WHERE delivery_date IN ('2027-10-29','2027-11-05') ORDER BY delivery_date").map((r) => [r.delivery_date, r.cutoff_at]), [['2027-10-29', '2027-10-27T17:00:00.000Z'], ['2027-11-05', '2027-11-03T18:00:00.000Z']]);
  assert.equal(Number(scalar("SELECT COUNT(*) FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice'", id)), 2);
  assert.equal(scalar("SELECT next_delivery_date FROM subscriptions WHERE id = ?", id), '2027-11-19');
  assert.equal(weekday('2027-11-19'), 5);
  // The reminder for Fri 29 Oct (sent Thu 28 Oct, CEST) and for Fri 5 Nov (Thu 4 Nov, CET): one each.
  assert.deepEqual(rows("SELECT json_extract(payload_json,'$.deliveryDate') d FROM outbox WHERE topic='email.delivery_reminder.requested' AND aggregate_id = ? ORDER BY d", id).map((r) => r.d), planned);
});

test('E3d DST October: a Belgrade Tuesday delivery right after the changeover weekend (Tue 2 Nov 2027) locks at Sun 31 Oct 19:00 CET, not an hour early or late', async () => {
  at('2027-10-27T10:00:00Z');
  const a = await buy({ deliveryDate: '2027-11-02', email: 'tp-efg-oct-a@example.test' });
  const b = await buy({ deliveryDate: '2027-11-02', email: 'tp-efg-oct-b@example.test' });
  // 31 Oct 17:30 UTC = 18:30 CET: still editable (with the old +2 offset it would already be 19:30).
  at('2027-10-31T17:30:00Z');
  ok(await mutate(a.subscription.id, 'skip_next', {}, session('tp-efg-oct-a@example.test')));
  at('2027-10-31T17:59:59Z');
  ok(await api('/api/account', null, { method: 'GET', cookie: session('tp-efg-oct-b@example.test') }));
  const viewB = (await api('/api/account', null, { method: 'GET', cookie: session('tp-efg-oct-b@example.test') })).body.subscriptions[0];
  assert.equal(viewB.cutoffAt, '2027-10-31T18:00:00.000Z');
  assert.equal(viewB.locked, false);
  at('2027-10-31T18:00:00Z');
  fails(await mutate(b.subscription.id, 'pause', { pauseUntil: '2027-11-20' }, session('tp-efg-oct-b@example.test')), 409, 'DELIVERY_LOCKED');
  await runJob('2027-11-01');
  await handover('2027-11-02', b.subscription.id);
  assert.deepEqual(realizedDates(b.subscription.id), ['2027-11-02']);
  assert.equal(stopsOn('2027-11-02', a.subscription.id), 0);
  assert.equal(scalar('SELECT next_delivery_date FROM subscriptions WHERE id = ?', a.subscription.id), '2027-11-09');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// E4 — holidays and days without delivery
// ─────────────────────────────────────────────────────────────────────────────────────────────
async function setHolidays(dates) { return ok(await api('/api/admin/settings', { holidays: dates }, { method: 'PATCH', admin: true })); }

test('E4a a holiday inside a paid package (Tue 26 Jan) is skipped: 4 deliveries on 12, 19 Jan, 2, 9 Feb, nothing on the holiday, no extra charge', async () => {
  at('2027-01-08T10:00:00Z');
  const bought = await buy({ deliveryDate: '2027-01-12', paymentMethod: 'card' });
  const id = bought.subscription.id;
  at('2027-01-13T10:00:00Z');
  await setHolidays(['2027-01-26']);
  const planned = ['2027-01-12', '2027-01-19', '2027-02-02', '2027-02-09'];
  for (let date = '2027-01-09'; date <= '2027-02-09'; date = addDays(date, 1)) {
    await runJob(date);
    if (planned.includes(date)) await handover(date, id);
  }
  assert.deepEqual(realizedDates(id), planned);
  assert.equal(stopsOn('2027-01-26', id), 0);
  assert.equal(Number(scalar("SELECT COUNT(*) FROM delivery_orders dor JOIN deliveries d ON d.id = dor.delivery_id WHERE d.delivery_date = '2027-01-26'")), 0, 'no list content on the holiday');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'email.delivery_reminder.requested' AND json_extract(payload_json,'$.deliveryDate') = '2027-01-26'")), 0, 'no reminder for the holiday');
  assert.equal(scalar('SELECT status FROM subscription_packages WHERE order_id = ?', bought.order.id), 'completed');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM orders WHERE subscription_id = ? AND payment_status = 'paid'", id)), 1, 'no charge before the renewal');
});

test('E4b a holiday known at purchase is left out of the package dates and the quote keeps 4 deliveries', async () => {
  at('2027-01-04T10:00:00Z');
  await setHolidays(['2027-01-19']);
  const quote = ok(await api('/api/cart', { items: [sub()], deliveryDate: '2027-01-12', city: 'Beograd', postalCode: '11000' }));
  assert.deepEqual(quote.lines[0].deliveryDates, ['2027-01-12', '2027-01-26', '2027-02-02', '2027-02-09']);
  assert.equal(quote.totalMinor, PACKAGE);
  assert.equal(quote.deliveryOccurrences, 4);
});

test('E4c a holiday as the first date: checkout for that day is refused; a holiday set after the purchase moves the whole package to the next Tuesday (never to a Friday)', async () => {
  at('2027-01-04T10:00:00Z');
  await setHolidays(['2027-01-12']);
  const refused = await api('/api/checkout', { customer: customer(), items: [sub()], paymentMethod: 'cash', deliveryDate: '2027-01-12' });
  assert.equal(refused.status, 422, JSON.stringify(refused.body));
  assert.equal(Number(scalar('SELECT COUNT(*) FROM orders')), 0);
  await setHolidays([]);
  const bought = await buy({ deliveryDate: '2027-01-12', paymentMethod: 'card' });
  const id = bought.subscription.id;
  at('2027-01-05T10:00:00Z');
  await setHolidays(['2027-01-12']);
  assert.equal(scalar('SELECT next_delivery_date FROM subscriptions WHERE id = ?', id), '2027-01-19');
  const planned = ['2027-01-19', '2027-01-26', '2027-02-02', '2027-02-09'];
  for (let date = '2027-01-06'; date <= '2027-02-09'; date = addDays(date, 1)) {
    await runJob(date);
    if (planned.includes(date)) await handover(date, id);
  }
  assert.deepEqual(realizedDates(id), planned, 'all four deliveries on Tuesdays after the holiday');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM delivery_orders WHERE customer_id = (SELECT customer_id FROM subscriptions WHERE id = ?) AND delivery_id IN (SELECT id FROM deliveries WHERE delivery_date = '2027-01-15')", id)), 0, 'no stop on Friday 15 Jan');
  const account = ok(await api('/api/account', null, { method: 'GET', cookie: session() }));
  const order = account.orders.find((o) => o.id === bought.order.id);
  assert.notEqual(order.scheduled_delivery_date, '2027-01-15', 'the package order is not shown on a Friday');
});

test('E4d [PITANJE] a holiday set after the purchase rewrites the booked date of the package order to the next route day of any weekday (here Friday 15 Jan)', async () => {
  at('2027-01-04T10:00:00Z');
  const bought = await buy({ deliveryDate: '2027-01-12', paymentMethod: 'card' });
  at('2027-01-05T10:00:00Z');
  await setHolidays(['2027-01-12']);
  // Documents current behaviour: orders.delivery_date of a subscription package follows the one-time
  // order rule (next route day: Fri 15 Jan) while the subscription moves to Tue 19 Jan.
  assert.equal(scalar('SELECT delivery_date FROM orders WHERE id = ?', bought.order.id), '2027-01-15');
  assert.equal(scalar('SELECT next_delivery_date FROM subscriptions WHERE id = ?', bought.subscription.id), '2027-01-19');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// E5 — the daily job twice for the same day, and twice in parallel
// ─────────────────────────────────────────────────────────────────────────────────────────────
async function finishedCardPackage() {
  at('2027-01-08T10:00:00Z');
  const bought = await buy({ deliveryDate: '2027-01-12', paymentMethod: 'card' });
  const id = bought.subscription.id;
  for (let date = '2027-01-09'; date <= '2027-02-02'; date = addDays(date, 1)) {
    await runJob(date);
    if (['2027-01-12', '2027-01-19', '2027-01-26', '2027-02-02'].includes(date)) await handover(date, id);
  }
  assert.equal(scalar('SELECT status FROM subscription_packages WHERE order_id = ?', bought.order.id), 'completed');
  return { bought, id };
}
function moneyEffects(id) {
  return {
    packages: Number(scalar('SELECT COUNT(*) FROM subscription_packages WHERE subscription_id = ?', id)),
    packageOrders: Number(scalar("SELECT COUNT(*) FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice'", id)),
    invoices: Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'billing.invoice_created'")),
    captures: Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'payment.captured'")),
    fiscal: Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'fiscal.receipt.requested'")),
    invoiceEmails: Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'email.invoice.requested'")),
    lists: Number(scalar("SELECT COUNT(*) FROM deliveries")),
    reminders: Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic IN ('email.delivery_reminder.requested','email.delivery_deadline.requested')")),
    paidCharges: Number(scalar("SELECT COUNT(*) FROM payment_attempts WHERE operation = 'charge' AND status = 'paid'")),
  };
}

test('E5a the job run twice (and a third time later) on the renewal day creates one renewal order, package, charge, invoice, receipt request and list', async () => {
  const { id } = await finishedCardPackage();
  await runJob('2027-02-03');
  const after = moneyEffects(id);
  assert.equal(after.packageOrders, 2);
  assert.equal(after.packages, 2);
  await runJob('2027-02-03');
  await runJob('2027-02-03', '08:10:00');
  await runJob('2027-02-03', '19:30:00'); // after the Friday cutoff: the next window's list may be added, never a second one per date
  const again = { ...moneyEffects(id) }, first = { ...after }; delete again.lists; delete first.lists;
  assert.deepEqual(again, first);
  globalInvariants('job ×4 on one day');
  const renewal = one("SELECT * FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice' ORDER BY delivery_date DESC LIMIT 1", id);
  assert.deepEqual([renewal.delivery_date, renewal.payment_status, renewal.total_minor], ['2027-02-09', 'paid', PACKAGE]);
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'payment.captured' AND aggregate_id = ?", renewal.id)), 1);
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'fiscal.receipt.requested' AND aggregate_id = ?", renewal.id)), 1);
});

test('E5b the job run twice in parallel on the renewal day still creates exactly one renewal order, package, charge and invoice', async () => {
  const { id } = await finishedCardPackage();
  at('2027-02-03T08:00:00Z');
  await Promise.all([job(), job()]);
  const effects = moneyEffects(id);
  assert.equal(effects.packageOrders, 2);
  assert.equal(effects.packages, 2);
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'billing.invoice_created'")), 1);
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'payment.captured' AND aggregate_id IN (SELECT id FROM orders WHERE subscription_id = ? AND delivery_date = '2027-02-09')", id)), 1);
  globalInvariants('parallel renewal');
});

test('E5b2 BUG: two parallel daily-job runs on the same day — the second answers 500 (UNIQUE idempotency_keys monthly-billing) instead of 200', async () => {
  await finishedCardPackage();
  at('2027-02-03T08:00:00Z');
  const [first, second] = await Promise.all([job(), job()]);
  assert.deepEqual([first.status, second.status], [200, 200], JSON.stringify([first.body, second.body]));
});

test('E5c the job run twice and in parallel on the day before a delivery: one list per date, one reminder, one cutoff reminder', async () => {
  at('2027-01-08T10:00:00Z');
  const bought = await buy({ deliveryDate: '2027-01-12', paymentMethod: 'card' });
  const id = bought.subscription.id;
  at('2027-01-10T08:00:00Z');
  await Promise.all([job(), job()]);
  await runJob('2027-01-10');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'email.delivery_deadline.requested' AND aggregate_id = ?", id)), 1);
  at('2027-01-11T08:00:00Z');
  const results = await Promise.all([job(), job()]);
  assert.deepEqual(results.map((r) => r.status), [200, 200], JSON.stringify(results.map((r) => r.body)));
  await runJob('2027-01-11');
  await runJob('2027-01-11', '15:00:00');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'email.delivery_reminder.requested' AND aggregate_id = ?", id)), 1);
  assert.equal(Number(scalar("SELECT COUNT(*) FROM deliveries WHERE delivery_date = '2027-01-12'")), 1);
  assert.equal(stopsOn('2027-01-12', id), 1);
  assert.equal(scalar("SELECT status FROM deliveries WHERE delivery_date = '2027-01-12'"), 'locked');
  assert.equal(scalar('SELECT next_delivery_date FROM subscriptions WHERE id = ?', id), '2027-01-19', 'locking advanced the subscription once, not twice');
  globalInvariants('parallel lock');
});

test('E5d the scheduled job refuses a missing or wrong CRON secret and HEAD never runs it', async () => {
  at('2027-01-11T08:00:00Z');
  fails(await api('/api/jobs/scheduled', null, { method: 'GET' }), 401, 'CRON_FORBIDDEN');
  fails(await api('/api/jobs/scheduled', null, { method: 'GET', headers: { authorization: 'Bearer wrong' } }), 401, 'CRON_FORBIDDEN');
  fails(await api('/api/jobs/scheduled', null, { method: 'GET', headers: { authorization: CRON } }), 401, 'CRON_FORBIDDEN');
  const head = await api('/api/jobs/scheduled', undefined, { method: 'HEAD', headers: { authorization: `Bearer ${CRON}` } });
  assert.equal(head.status, 405);
  assert.equal(Number(scalar('SELECT COUNT(*) FROM deliveries')), 0, 'nothing ran');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// E6 — catch-up after missed days, and a late 4th confirmation
// ─────────────────────────────────────────────────────────────────────────────────────────────
test('E6a the job missed for six days (Mon 1 → Sat 6 Feb) catches up in one run: past lists locked once, no late "tomorrow" reminders, no duplicates', async () => {
  at('2027-01-08T10:00:00Z');
  const bought = await buy({ deliveryDate: '2027-01-12', paymentMethod: 'card' });
  const id = bought.subscription.id;
  for (let date = '2027-01-09'; date <= '2027-01-31'; date = addDays(date, 1)) {
    await runJob(date);
    if (['2027-01-12', '2027-01-19', '2027-01-26'].includes(date)) await handover(date, id);
  }
  const remindersBefore = Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'email.delivery_reminder.requested'"));
  // No job from 1 to 6 Feb. The next run is Sunday 7 Feb.
  await runJob('2027-02-07');
  await runJob('2027-02-07');
  assert.equal(scalar("SELECT status FROM deliveries WHERE delivery_date = '2027-02-02'"), 'locked', 'the missed Tuesday list is materialized and locked');
  assert.equal(stopsOn('2027-02-02', id), 1);
  assert.equal(Number(scalar("SELECT COUNT(*) FROM deliveries WHERE delivery_date = '2027-02-02'")), 1);
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'email.delivery_reminder.requested'")), remindersBefore, 'no "tomorrow" reminder for a day already gone');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice'", id)), 1, 'no renewal while the 4th visit is not confirmed');
  assert.equal(scalar('SELECT next_delivery_date FROM subscriptions WHERE id = ?', id), '2027-02-09');
  globalInvariants('catch-up');
});

test('E6b renewal happens exactly once when the 4th delivery is confirmed late (Tue 2 Feb confirmed on Wed 10 Feb, after the next route locked)', async () => {
  at('2027-01-08T10:00:00Z');
  const bought = await buy({ deliveryDate: '2027-01-12', paymentMethod: 'card' });
  const id = bought.subscription.id;
  for (let date = '2027-01-09'; date <= '2027-02-09'; date = addDays(date, 1)) {
    await runJob(date);
    if (['2027-01-12', '2027-01-19', '2027-01-26'].includes(date)) await handover(date, id);
  }
  // 2 Feb is packed (locked) but not confirmed. The 9 Feb list has nothing to carry: the package is fully reserved.
  assert.equal(stopsOn('2027-02-09', id), 0, 'no fifth visit while the 4th is unconfirmed');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice'", id)), 1);
  at('2027-02-10T09:00:00Z');
  const list = await adminList('2027-02-02');
  const stop = list.orders.find((o) => o.subscription_id === id);
  ok(await confirm(stop.id));
  ok(await confirm(stop.id)); // a repeated late confirmation is a replay
  assert.equal(scalar('SELECT status FROM subscription_packages WHERE order_id = ?', bought.order.id), 'completed');
  await runJob('2027-02-11');
  await runJob('2027-02-11', '12:00:00');
  await runJob('2027-02-12');
  const renewals = rows("SELECT delivery_date, total_minor, payment_status FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice' ORDER BY delivery_date", id);
  assert.deepEqual(renewals.map((r) => [r.delivery_date, r.total_minor, r.payment_status]), [['2027-01-12', PACKAGE, 'paid'], ['2027-02-16', PACKAGE, 'paid']], 'one renewal, on the first Tuesday whose cutoff has not passed');
  assert.equal(scalar('SELECT next_delivery_date FROM subscriptions WHERE id = ?', id), '2027-02-16');
  assert.equal(Number(scalar("SELECT COUNT(*) FROM outbox WHERE topic = 'billing.invoice_created'")), 1);
  globalInvariants('late 4th');
});

test('E6c a late 4th confirmation the day after the delivery (before the next cutoff) renews for the very next Tuesday', async () => {
  at('2027-01-08T10:00:00Z');
  const bought = await buy({ deliveryDate: '2027-01-12', paymentMethod: 'card' });
  const id = bought.subscription.id;
  for (let date = '2027-01-09'; date <= '2027-02-03'; date = addDays(date, 1)) {
    await runJob(date);
    if (['2027-01-12', '2027-01-19', '2027-01-26'].includes(date)) await handover(date, id);
  }
  // Confirmed on Wed 3 Feb after the job already ran: renewal comes with Thursday's job.
  await handover('2027-02-02', id, { clock: '2027-02-03T12:00:00Z' });
  assert.equal(Number(scalar("SELECT COUNT(*) FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice'", id)), 1);
  await runJob('2027-02-04');
  await runJob('2027-02-05');
  assert.deepEqual(rows("SELECT delivery_date FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice' ORDER BY delivery_date", id).map((r) => r.delivery_date), ['2027-01-12', '2027-02-09']);
});
