import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization")!;
    const {
      data: { user },
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) throw new Error("Unauthorized");

    const formData = await req.formData();
    const files = formData.getAll("photos") as File[];
    const propertyId = formData.get("property_id") as string;

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
      const fileName = `${propertyId || user.id}/${crypto.randomUUID()}.${ext}`;

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

    return new Response(
      JSON.stringify({
        data: { urls: uploadedUrls, count: uploadedUrls.length },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
