# Keepz — open setup items

Wallet top-ups are credited without these items (the 10-minute reconcile job
settles them). The redirect item is the exception: without it the payer is
left on Keepz. Contract: `docs/contracts.md` → **C32**.

## Ask Keepz (test integration first, then production)

- [ ] **Register the callback URL.** Keepz's server tells ours "order X is
      paid", so the wallet is credited within seconds even if the payer closes
      the tab. Register it exactly as written; a trailing slash gets a 403: - staging: `https://staging.mybakuriani.ge/api/payments/keepz/callback` - prod: `https://mybakuriani.ge/api/payments/keepz/callback`
- [ ] **Register the success and fail redirect.** This is the open bug "the
      payer stays on Keepz after paying". Keepz's `/success` page asks its own
      server for the order's redirect and navigates there by itself; its
      "Done" button only opens Keepz's home. We cannot send the URL per order:
      the test integrator gets `6036 No permission to use dynamic redirect`
      (probed on the dev gateway 2026-10-03) and `createOrder` would then
      cancel every checkout. So Keepz must register one URL for success and
      fail, or grant that permission.
  - staging: `https://staging.mybakuriani.ge/dashboard/payments/result`
  - prod (once its credentials exist):
    `https://mybakuriani.ge/dashboard/payments/result`
  - Until then nothing in the app links to the result page (the credit notice
    links to `/dashboard`), so a "pay by card" purchase such as VIP completes
    only if the payer opens the page by hand; the wallet itself is credited by
    the reconcile job.
  - Check once Keepz confirms: pay 0.10 ₾ on staging and the payer should land
    on the result page by itself. If not, capture the `/success` URL: Keepz
    asks for the redirect only when it carries `integratorOrderId` (or
    `customField3`) and none of `order_code`, `tipsEnabled=true` or
    `ratingEnabled=true`.
  - Optional: the dynamic-redirect permission too, so we can send a
    locale-prefixed URL per order (a static URL lands en/ru payers on the
    Georgian page).
- [ ] **Refund permission, including partial refunds** (without it Keepz
      returns error 6038). The admin "refund to card" button needs it.
- [ ] **Test card details** for the dev gateway (`web.appdev.keepz.me`).
- [ ] **Callback format:** is it encrypted, and does Keepz retry when it fails?
      The route accepts JSON, form-encoded and encrypted bodies.
- [ ] **Production credentials:** a separate integrator ID, receiver ID and
      key pair, used with `KEEPZ_ENV=production`.

## Our side (needs approval)

- [ ] **Deploy the retired sandbox functions.** `payment-create` and
      `payment-process` become 410 tombstones.

## Done

- [x] Test credentials are in `.env.local` and on the staging DigitalOcean app
      as `KEEPZ_*` secrets. A live dev-gateway probe works: orders are created,
      status is readable, and the checkout host is `web.appdev.keepz.me`.
- [x] **Reconcile job on staging.** Job `keepz-reconcile-10min` is scheduled,
      the Vault secret was generated inside the database, and
      `KEEPZ_RECONCILE_SECRET_SHA256` is set in `.env.local` and on the
      staging DigitalOcean app. Each run gets a 404/403 until the Keepz code is
      deployed, then it starts working with no further steps.
- [x] **Keepz named as the card processor** in the terms (clauses 12.7–12.9)
      and in the privacy policy (section 6), in ka, en and ru. Last updated
      25.09.2026.
