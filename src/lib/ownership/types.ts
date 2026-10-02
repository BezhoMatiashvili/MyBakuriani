// Wire shapes shared by the ownership-verification API routes, the owner page
// and the admin panel (C39). Types only — no runtime code.

import type {
  OwnershipDocumentKind,
  OwnershipListingKind,
  OwnershipVerificationStatus,
} from "@/lib/ownership/document-file";

export type {
  OwnershipDocumentKind,
  OwnershipListingKind,
  OwnershipVerificationStatus,
};

// ---------------------------------------------------------------------------
// POST /api/ownership-verifications/documents  (multipart/form-data)
//   fields: file (File), kind (OwnershipDocumentKind),
//           replacesDocumentId? (uuid of the caller's own unsubmitted upload)
// ---------------------------------------------------------------------------

export type OwnershipDocumentUploadResponse = {
  id: string;
  kind: OwnershipDocumentKind;
  contentType: string;
  size: number;
};

/**
 * 400 invalid_request | invalid_kind | empty | unsupported | incomplete,
 * 401 unauthorized, 409 document_limit, 413 too_large,
 * 429 rate_limited | upload_busy (with Retry-After), 503 upload_failed.
 */
export type OwnershipDocumentUploadError =
  | "invalid_request"
  | "invalid_kind"
  | "empty"
  | "unsupported"
  | "incomplete"
  | "unauthorized"
  | "document_limit"
  | "too_large"
  | "rate_limited"
  | "upload_busy"
  | "upload_failed";

// ---------------------------------------------------------------------------
// POST /api/ownership-verifications  (application/json)
// ---------------------------------------------------------------------------

export type OwnershipSubmitItem = {
  kind: OwnershipListingKind;
  id: string;
  /** The registry extract uploaded for this listing. */
  documentId: string;
};

export type OwnershipSubmitRequest = {
  identityDocumentId: string;
  /** 1…MAX_OWNERSHIP_ITEMS. */
  items: OwnershipSubmitItem[];
};

export type OwnershipSubmitResponse = {
  submissionId: string;
  count: number;
};

/**
 * 400 invalid_input | document_invalid | extract_shared, 401 unauthorized,
 * 404 listing_not_found, 409 request_exists, 429 rate_limited,
 * 500 submit_failed.
 */
export type OwnershipSubmitError =
  | "invalid_input"
  | "document_invalid"
  | "extract_shared"
  | "unauthorized"
  | "listing_not_found"
  | "request_exists"
  | "rate_limited"
  | "submit_failed";

// ---------------------------------------------------------------------------
// GET /api/admin/ownership-verifications?status=pending|approved|decided&q=&page=
//   pending: every pending row, oldest first (the panel groups by submissionId)
//   approved / decided: 50 per page, newest first, `q` matches listing id,
//   listing title, owner name or owner phone
// ---------------------------------------------------------------------------

export type AdminOwnershipListFilter = "pending" | "approved" | "decided";

export type AdminOwnershipDocument = {
  id: string;
  contentType: string;
  size: number;
  /** False once the file was discarded, claimed for deletion or deleted. */
  available: boolean;
};

export type AdminOwnershipItem = {
  id: string;
  submissionId: string;
  status: OwnershipVerificationStatus;
  decisionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  owner: {
    id: string;
    displayName: string | null;
    phone: string | null;
    personalId: string | null;
  } | null;
  listing: {
    kind: OwnershipListingKind;
    id: string;
    title: string;
    /** services.category (null for properties). */
    category: string | null;
    /** properties.type (null for services). */
    propertyType: string | null;
    isForSale: boolean | null;
    location: string | null;
    status: "active" | "pending" | "draft" | "blocked";
    /** The listing's CURRENT cadastral code (properties only). */
    cadastralCode: string | null;
    /** Public detail URL; `?preview=1` when the listing is not active. */
    href: string;
  };
  documents: {
    identity: AdminOwnershipDocument;
    extract: AdminOwnershipDocument;
  };
};

export type AdminOwnershipListResponse = {
  items: AdminOwnershipItem[];
  total: number;
  page: number;
  pageSize: number;
};

// ---------------------------------------------------------------------------
// POST /api/admin/ownership-verifications  { id, action, note? }
// ---------------------------------------------------------------------------

export type AdminOwnershipAction = "approve" | "reject" | "revoke";

export type AdminOwnershipReviewRequest = {
  id: string;
  action: AdminOwnershipAction;
  note?: string;
};

export type AdminOwnershipReviewResponse = {
  status: OwnershipVerificationStatus;
  idempotent: boolean;
};

/**
 * 400 invalid_request | invalid_action | note_required | note_too_long,
 * 401/403 (requireAdmin), 403 forbidden | self_review (the admin's own
 * listing: another admin decides), 404 not_found,
 * 409 already_decided | document_missing, 500 review_failed.
 */
export type AdminOwnershipReviewError =
  | "invalid_request"
  | "invalid_action"
  | "note_required"
  | "note_too_long"
  | "forbidden"
  | "self_review"
  | "not_found"
  | "already_decided"
  | "document_missing"
  | "review_failed";

// ---------------------------------------------------------------------------
// Owner-side reads (browser client, RLS: own rows; column grant — never select
// reviewed_by or the document ids)
// ---------------------------------------------------------------------------

/** The columns `authenticated` may select on ownership_verifications. */
export const OWNER_VERIFICATION_COLUMNS =
  "id, submission_id, owner_id, property_id, service_id, status, decision_note, reviewed_at, created_at, updated_at";

export type OwnerVerificationRow = {
  id: string;
  submission_id: string;
  owner_id: string;
  property_id: string | null;
  service_id: string | null;
  status: OwnershipVerificationStatus;
  decision_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
