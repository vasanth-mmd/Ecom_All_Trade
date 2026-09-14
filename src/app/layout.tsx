import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "MultiTrade Fill Rate Report 2026 · Milky Mist",
  description: "PO fulfilment dashboard across quick-commerce trades (MultiTrade)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
