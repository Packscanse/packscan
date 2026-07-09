import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Packscan",
    short_name: "Packscan",
    description: "Unified parcel scanning for multi-carrier pickup points",
    start_url: "/scan",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0a0a0a",
  };
}
