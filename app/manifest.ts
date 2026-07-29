import type { MetadataRoute } from "next";

type MewtualsManifestIcon = Omit<
  NonNullable<MetadataRoute.Manifest["icons"]>[number],
  "purpose"
> & {
  purpose: "any maskable";
};

type MewtualsManifest = Omit<MetadataRoute.Manifest, "icons"> & {
  icons: MewtualsManifestIcon[];
};

export default function manifest(): MewtualsManifest {
  return {
    name: "Mewtuals",
    short_name: "Mewtuals",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f0e9",
    theme_color: "#11110f",
    icons: [
      {
        src: "/icons/mewtuals-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/icons/mewtuals-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
