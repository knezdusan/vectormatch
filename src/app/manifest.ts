import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VectorMatch",
    short_name: "VectorMatch",
    description:
      "The AI agent for web developers — find hidden opportunities and pitch directly to decision makers.",
    start_url: "/",
    display: "standalone",
    background_color: "#16161e",
    theme_color: "#a855f7",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
