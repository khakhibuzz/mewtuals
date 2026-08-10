import type { Metadata, Viewport } from "next";
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

const title = "Mewtuals — Partnerships for Physical AI companies";
const description =
  "Mewtuals maps the Physical AI ecosystem and advances the right external partnerships from signal to pilot.";
const socialImage = {
  url: "https://mewtuals.com/og.png",
  width: 1731,
  height: 909,
  alt: "Mewtuals — External partnerships for Physical AI companies.",
};

export const metadata: Metadata = {
  title,
  description,
  manifest: "/manifest.webmanifest",
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

export const viewport: Viewport = {
  themeColor: "#11110f",
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
