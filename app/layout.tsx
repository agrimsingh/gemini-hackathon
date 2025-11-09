import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vibe de Deux",
  description: "Realtime collaborative AI code generation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

