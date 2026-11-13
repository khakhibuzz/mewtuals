import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mewtuals",
    short_name: "Mewtuals",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f0e9",
    theme_color: "#11110f",
    icons: [192, 512].flatMap((size) =>
      (["any", "maskable"] as const).map((purpose) => ({
        src: `/icons/mewtuals-${size}.png`,
        sizes: `${size}x${size}`,
        type: "image/png",
        purpose,
      })),
    ),
  };
}
