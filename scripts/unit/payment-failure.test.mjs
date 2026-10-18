import { test } from "node:test";
import assert from "node:assert/strict";
import { isPaymentFailure } from "../../supabase/functions/_shared/payment-failure.ts";

// { code, hint, message } as PostgREST hands the charge RPCs' errors to
// purchase-vip and company-subscription. Captured on staging from
// purchase_package, purchase_renter_membership and
// purchase_company_subscription in a rolled-back dry run (S2-B).
const INSUFFICIENT =
  "არასაკმარისი ბალანსი. საჭიროა: 0.1 ₾, ხელმისაწვდომია: 0.00 ₾";

const notified = {
  "purchase_package: insufficient balance": {
    code: "22023",
    hint: "insufficient_balance",
    message: INSUFFICIENT,
  },
  "membership: insufficient balance": {
    code: "22023",
    hint: null,
    message: INSUFFICIENT,
  },
  "company: insufficient balance": {
    code: "22023",
    hint: null,
    message: INSUFFICIENT,
  },
  "standard VIP while SUPER VIP is active": {
    code: "23P01",
    hint: null,
    message: "vip_tier_conflict",
  },
  "statement timeout": {
    code: "57014",
    hint: null,
    message: "canceling statement due to statement timeout",
  },
  deadlock: { code: "40P01", hint: null, message: "deadlock detected" },
  "network failure": { code: "", hint: "", message: "TypeError: fetch failed" },
};

const answeredInResponseOnly = {
  "package not found": {
    code: "P0002",
    hint: "package_unavailable",
    message: "პაკეტი ვერ მოიძებნა",
  },
  "package disabled": {
    code: "22023",
    hint: "package_unavailable",
    message: "პაკეტი არ არის ხელმისაწვდომი",
  },
  "VIP without exactly one target": {
    code: "22023",
    hint: "invalid_target",
    message: "VIP პაკეტისთვის აირჩიეთ ზუსტად ერთი ობიექტი",
  },
  "someone else's listing": {
    code: "42501",
    hint: "not_owner",
    message: "ობიექტი ვერ მოიძებნა ან თქვენ არ ხართ მფლობელი",
  },
  "discount percent out of range": {
    code: "22023",
    hint: "invalid_discount_percent",
    message: "არასწორი ფასდაკლების პროცენტი",
  },
  "quantity out of range": {
    code: "22023",
    hint: "invalid_quantity",
    message: "არასწორი რაოდენობა",
  },
  "malformed listing id": {
    code: "22P02",
    hint: null,
    message: 'invalid input syntax for type uuid: "not-a-uuid"',
  },
  "company package on the personal endpoint": {
    code: "22023",
    hint: null,
    message: "კომპანიის პაკეტი პირადი წევრობისთვის მიუწვდომელია",
  },
  "membership package not found": {
    code: "P0002",
    hint: null,
    message: "MEMBERSHIP_PACKAGE_NOT_FOUND",
  },
  "membership package disabled": {
    code: "22023",
    hint: null,
    message: "MEMBERSHIP_PACKAGE_DISABLED",
  },
  "membership FB profile missing": {
    code: "22023",
    hint: null,
    message: "MEMBERSHIP_FB_PROFILE_REQUIRED",
  },
  "membership already pending": {
    code: "P0001",
    hint: null,
    message: "MEMBERSHIP_ALREADY_PENDING",
  },
  "company tier invalid": {
    code: "22023",
    hint: null,
    message: "არასწორი პაკეტი",
  },
  "company not found": {
    code: "P0002",
    hint: null,
    message: "კომპანია ვერ მოიძებნა",
  },
  "not the company owner": {
    code: "42501",
    hint: null,
    message: "მხოლოდ კომპანიის მფლობელს შეუძლია პაკეტის შეძენა",
  },
  "company tier locked": {
    code: "P0001",
    hint: null,
    message: "SUBSCRIPTION_TIER_LOCKED",
  },
  "PostgREST request error": {
    code: "PGRST202",
    hint: null,
    message: "Could not find the function",
  },
};

test("real payment failures notify the buyer", () => {
  for (const [name, error] of Object.entries(notified)) {
    assert.equal(isPaymentFailure(error), true, name);
  }
});

test("validation, ownership and not-found errors do not", () => {
  for (const [name, error] of Object.entries(answeredInResponseOnly)) {
    assert.equal(isPaymentFailure(error), false, name);
  }
});
