import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PwaRegistration from "./pwa/PwaRegistration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mewtuals — Partnerships for internet-native companies",
  description:
    "Mewtuals identifies and advances high-value partnerships for AI startups, creator-economy companies, and consumer brands.",
  manifest: "/manifest.webmanifest",
  themeColor: "#11110f",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mewtuals",
  },
  icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
