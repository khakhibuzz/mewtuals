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

const title = "Mewtuals — Partnerships for internet-native companies";
const description =
  "Mewtuals identifies and advances high-value partnerships for AI startups, creator-economy companies, and consumer brands.";
const socialImage = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Mewtuals — One partnership can change a company. We find the right one.",
};

export const metadata: Metadata = {
  title,
  description,
  manifest: "/manifest.webmanifest",
  themeColor: "#11110f",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mewtuals",
  },
  icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
  openGraph: {
    title,
    description,
    type: "website",
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [socialImage.url],
  },
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
