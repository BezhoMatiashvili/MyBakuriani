// Notification types that are also sent as an email (C33). Mirrors
// public.email_notification_types() in the newest migration that defines it;
// scripts/check-contracts.mjs compares the two. Kept free of imports so
// scripts/unit can load it straight from src/.
//
// Deliberately absent: listing_pending (an echo of the user's own action),
// broadcast (mass messages are marketing: Resend Broadcasts), and
// content_change_superseded (internal bookkeeping).
export const EMAIL_NOTIFICATION_TYPES = [
  // money & membership
  "payment_success",
  "payment_failed",
  "payment_refund",
  "payment_required",
  "membership_pending",
  "membership_approved",
  "membership_rejected",
  "vip_expiring",
  "company_subscription",
  // listing moderation
  "listing_moderation",
  "content_change_approved",
  "content_change_rejected",
  "company_moderation",
  // work requests
  "cleaning_task_new",
  "cleaning_task_status",
  "cleaning_task_cancellation_requested",
  "cleaning_task_cancelled",
  "smart_match_request",
  "smart_match_offer",
  "job_application",
  "org_membership_request",
  "org_membership_response",
  // admin queues
  "admin_listing_pending",
  "admin_content_change_pending",
  "admin_membership_pending",
  "admin_payment_review",
  "admin_company_pending",
  "admin_sms_pending",
] as const;

export type EmailNotificationType = (typeof EMAIL_NOTIFICATION_TYPES)[number];
