import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Tratamento Adaptativo",
    short_name: "Tratamento",
    description: "Organizador conservador de horários e registros do tratamento do Lucas.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f1ea",
    theme_color: "#173f35",
    lang: "pt-BR",
    categories: ["health", "medical", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Acordei agora", short_name: "Iniciar dia", url: "/?action=wake" },
      { name: "Ver histórico", short_name: "Histórico", url: "/?tab=history" },
    ],
  };
}
