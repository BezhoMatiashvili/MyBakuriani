# Keepz — open setup items

Payments work without these items. Each one only makes the flow smoother.
Contract: `docs/contracts.md` → **C32**.

## Ask Keepz (test integration first, then production)

- [ ] **Register the callback URL.** Keepz's server tells ours "order X is
      paid", so the wallet is credited within seconds even if the payer closes
      the tab. Register it exactly as written; a trailing slash gets a 403: - staging: `https://staging.mybakuriani.ge/api/payments/keepz/callback` - prod: `https://mybakuriani.ge/api/payments/keepz/callback`
- [ ] **Register the success and fail redirect.** Sends the payer back to us
      after paying, which also completes any "pay by card" purchase such as
      VIP. Without it, the payer has to open the result page themselves. - staging: `https://staging.mybakuriani.ge/dashboard/payments/result` - prod: `https://mybakuriani.ge/dashboard/payments/result`
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
