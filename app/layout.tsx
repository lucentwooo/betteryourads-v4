// Root layout. Reproduces app.html's <head>/<body>: Inter from Google Fonts,
// then tokens.css, then app.css IN THAT ORDER (load order is load-bearing for
// the cascade), the favicon, and the logo-mark preload. The CSS files are
// imported verbatim from styles/ so they are bundled, not re-authored.
import type { Metadata } from "next";
import "@/styles/tokens.css";
import "@/styles/app.css";
// The app.html inline <style> block (auth split, cards, dropzone, modal, toast,
// angle/variant rows, spinner, #app height) lived after the app.css <link>.
// Ported verbatim into styles/app-inline.css and imported here in that order so
// the cascade matches app.html exactly.
import "@/styles/app-inline.css";

export const metadata: Metadata = {
  title: "BetterYourAds",
  icons: { icon: "/assets/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap"
        />
        <link rel="preload" as="image" href="/assets/logo-mark.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
