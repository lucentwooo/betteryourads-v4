import type { Metadata } from "next";
import {
  display,
  instrumentSerif,
  bricolage,
  jetbrainsMono,
} from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "BetterYourAds",
  description: "Stage-one-driven ad creative generation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${instrumentSerif.variable} ${bricolage.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--cream)] text-[var(--ink)]">
        {children}
      </body>
    </html>
  );
}
