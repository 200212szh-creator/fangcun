import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.nameZh} · ${brand.nameEn}`,
    short_name: brand.nameZh,
    description: brand.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f7f3ea",
    theme_color: "#18324b",
    lang: "zh-CN",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
