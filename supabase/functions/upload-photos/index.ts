import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireUser,
} from "../_shared/guards.ts";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { supabase, user } = await requireUser(req);

    const formData = await req.formData();
    const files = formData.getAll("photos") as File[];
    const propertyIdField = formData.get("property_id");
    const propertyId =
      typeof propertyIdField === "string" && propertyIdField.trim().length > 0
        ? propertyIdField.trim()
        : null;

    if (!files || files.length === 0) {
      throw new Error("ფოტო არ არის ატვირთული");
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error(
          `არასწორი ფაილის ტიპი: ${file.type}. დასაშვებია: JPG, PNG, WebP`,
        );
      }

      // Validate file size
      if (file.size > MAX_SIZE) {
        throw new Error(
          `ფაილი ძალიან დიდია: ${(file.size / 1024 / 1024).toFixed(1)}MB. მაქსიმუმი: 5MB`,
        );
      }

      // Generate unique filename
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `${propertyId ?? user.id}/${crypto.randomUUID()}.${ext}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("property-photos")
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("property-photos")
        .getPublicUrl(fileName);

      uploadedUrls.push(urlData.publicUrl);
    }

    // If property_id provided, append photos to property
    if (propertyId) {
      const { data: property } = await supabase
        .from("properties")
        .select("photos")
        .eq("id", propertyId)
        .eq("owner_id", user.id)
        .single();

      if (property) {
        const existingPhotos = property.photos || [];
        await supabase
          .from("properties")
          .update({
            photos: [...existingPhotos, ...uploadedUrls],
            updated_at: new Date().toISOString(),
          })
          .eq("id", propertyId)
          .eq("owner_id", user.id);
      }
    }

    return jsonResponse(
      {
        data: { urls: uploadedUrls, count: uploadedUrls.length },
      },
      200,
    );
  } catch (err) {
    return errorResponse(err);
  }
});
