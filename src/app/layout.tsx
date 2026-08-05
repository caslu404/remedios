import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: "Tratamento Adaptativo", template: "%s · Tratamento Adaptativo" },
  description: "Seu tratamento organizado ao redor do seu dia — sem alterar a prescrição.",
  applicationName: "Tratamento Adaptativo",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Tratamento" },
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    title: "Tratamento Adaptativo",
    description: "Seu dia, em ordem — sem alterar a prescrição.",
    images: [{ url: "/og.png", width: 1792, height: 907, alt: "Tratamento Adaptativo — Seu dia, em ordem." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tratamento Adaptativo",
    description: "Seu dia, em ordem — sem alterar a prescrição.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#173f35",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
