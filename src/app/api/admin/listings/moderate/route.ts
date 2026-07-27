import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/admin";
import { listingTag } from "@/lib/data/getCachedPublicListing";
import { revalidateListingLists } from "@/lib/data/revalidateListings";
import {
  propertyTypeLabelKa,
  serviceCategoryLabelKa,
} from "@/lib/notifications/listing-labels";
import {
  propertyEditUrl,
  propertyViewUrl,
  serviceEditUrl,
  serviceViewUrl,
} from "@/lib/utils/listingUrls";

export const runtime = "nodejs";

type Body = {
  kind?: "property" | "service";
  id?: string;
  action?: "approve" | "reject";
  notes?: string;
};

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.id || !body.kind || !body.action) {
    return Response.json(
      { error: "kind + id + action required" },
      { status: 400 },
    );
  }
  if (body.kind !== "property" && body.kind !== "service") {
    return Response.json({ error: "invalid kind" }, { status: 400 });
  }

  const db = createServiceClient(guard.admin.userId);
  const table = body.kind === "property" ? "properties" : "services";
  const newStatus = body.action === "approve" ? "active" : "blocked";

  const columns =
    body.kind === "property"
      ? "id, owner_id, title, type, is_for_sale"
      : "id, owner_id, title, category";

  const { data: existing, error: lookupErr } = await db
    .from(table)
    .select(columns)
    .eq("id", body.id)
    .maybeSingle<{
      owner_id: string;
      title: string | null;
      type?: string | null;
      is_for_sale?: boolean | null;
      category?: string | null;
    }>();
  if (lookupErr) {
    return Response.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "listing not found" }, { status: 404 });
  }

  const update: { status: typeof newStatus; admin_notes?: string | null } = {
    status: newStatus,
  };
  if (body.action === "reject") {
    update.admin_notes = body.notes?.trim() || null;
  } else if (body.notes?.trim()) {
    update.admin_notes = body.notes.trim();
  }

  const { error: updateErr } = await db
    .from(table)
    .update(update)
    .eq("id", body.id);
  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 });
  }

  // Approve/reject flips public visibility — drop the cached public listing
  // (detail page) AND the ISR-cached category + landing list pages now.
  revalidateTag(listingTag(body.kind, body.id));
  revalidateListingLists(body.kind);

  const listingName = existing.title?.trim() || "განცხადება";
  const typeLabel =
    body.kind === "property"
      ? propertyTypeLabelKa(existing.type)
      : serviceCategoryLabelKa(existing.category);
  const notes = body.notes?.trim();

  const viewUrl =
    body.kind === "property"
      ? propertyViewUrl({
          id: body.id,
          type: existing.type,
          is_for_sale: existing.is_for_sale,
        })
      : serviceViewUrl({ id: body.id, category: existing.category ?? "" });
  const editUrl =
    body.kind === "property"
      ? propertyEditUrl({ id: body.id, is_for_sale: existing.is_for_sale })
      : serviceEditUrl({ id: body.id, category: existing.category ?? "" });

  const message =
    body.action === "approve"
      ? `„${listingName}" (${typeLabel}) დამტკიცდა და გამოქვეყნდა საიტზე.`
      : `„${listingName}" (${typeLabel}) უარყოფილია.${
          notes ? ` მიზეზი: ${notes}` : ""
        }`;

  const { error: notifyErr } = await db.from("notifications").insert({
    user_id: existing.owner_id,
    type: "listing_moderation",
    title:
      body.action === "approve"
        ? "თქვენი განცხადება დამტკიცდა"
        : "თქვენი განცხადება უარყოფილია",
    message,
    action_url: body.action === "approve" ? viewUrl : editUrl,
    dashboard_scope:
      body.kind === "property"
        ? existing.is_for_sale
          ? "seller"
          : "renter"
        : existing.category === "food"
          ? "food"
          : existing.category === "cleaning"
            ? "cleaner"
            : ["employment", "transport", "entertainment"].includes(
                  existing.category ?? "",
                )
              ? existing.category!
              : "services",
  });
  if (notifyErr) {
    console.error("moderate: notification insert failed", notifyErr);
  }

  return Response.json({ ok: true, status: newStatus });
}
