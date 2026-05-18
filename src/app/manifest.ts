import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyBakuriani",
    short_name: "MyBakuriani",
    description: "MyBakuriani — Premium real estate platform in Bakuriani",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#2563EB",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
