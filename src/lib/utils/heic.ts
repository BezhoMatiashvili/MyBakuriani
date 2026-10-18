// HEIC/HEIF helpers shared by the listing photo uploader and the ownership
// document picker (C39).

/** iPhones default to HEIC/HEIF; the MIME is often empty, so check the name too. */
export function isHeicFile(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/** Browser-only HEIC→JPEG conversion. Dynamically imported to stay out of the main bundle. */
export async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const renamed = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  const name = renamed.toLowerCase().endsWith(".jpg")
    ? renamed
    : `${renamed}.jpg`;
  return new File([blob], name, { type: "image/jpeg" });
}
