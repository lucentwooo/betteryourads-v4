import type { Metadata, Viewport } from "next";
import "../src/styles/app.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "BetterYourAds",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
