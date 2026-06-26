import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/AuthContext";
import { SITE_URL, SITE_NAME, SUPPORT_EMAIL } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const OG_IMAGE = `${SITE_URL}/ogimage.png`;
const SITE_TITLE = "Twin Grid — Automated Binance Futures AI Trading Bot";
const SITE_DESCRIPTION =
  "Automate your Binance Futures trading with Twin Grid — an enterprise-grade AI-powered algorithmic grid trading bot. Hands-free, 24/7 execution with real-time monitoring and smart risk management.";

export const metadata: Metadata = {
  // ─── Core ───────────────────────────────────────────
  title: {
    default: SITE_TITLE,
    template: "%s | Twin Grid",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "grid trading bot",
    "Binance Futures bot",
    "automated trading bot",
    "crypto trading bot",
    "AI trading bot",
    "algorithmic trading platform",
    "grid strategy crypto",
    "Binance bot",
    "futures trading automation",
    "Twin Grid",
    "BTCUSDT grid trading",
    "crypto automation software",
    "best grid trading bot",
    "binance futures grid bot",
    "automated crypto trading",
    "DCA trading bot",
    "bitcoin trading bot",
    "passive income crypto",
    "auto trading binance",
    "smart grid trading",
    "cryptocurrency bot",
    "binance algo trading",
    "grid bot strategy",
    "leverage trading bot",
    "24/7 crypto trading",
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,

  // ─── Canonical & Alternates ─────────────────────────
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: "/",
  },

  // ─── Open Graph ─────────────────────────────────────
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Twin Grid — Automated AI-Powered Crypto Trading Platform",
        type: "image/png",
      },
    ],
  },

  // ─── Twitter Card ───────────────────────────────────
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },

  // ─── Robots ─────────────────────────────────────────
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  // ─── Icons ──────────────────────────────────────────
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },

  // ─── Manifest ───────────────────────────────────────
  manifest: "/manifest.json",

  // ─── Verification (add your IDs when available) ─────
  // verification: {
  //   google: "your-google-verification-code",
  // },

  // ─── Category ───────────────────────────────────────
  category: "finance",
};

export const viewport: Viewport = {
  themeColor: "#0B0E11",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", inter.variable)}>
      <head>
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Twin Grid",
              applicationCategory: "FinanceApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              description: SITE_DESCRIPTION,
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
                description: "Performance-based fee model — only pay when you profit",
              },
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: "4.8",
                ratingCount: "120",
                bestRating: "5",
                worstRating: "1",
              },
              featureList: [
                "Automated Binance Futures grid trading",
                "24/7 hands-free execution",
                "Real-time monitoring dashboard",
                "Smart risk management",
                "Dynamic grid adaptation",
                "Multi-account support",
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Twin Grid",
              url: SITE_URL,
              logo: `${SITE_URL}/logo.png`,
              contactPoint: {
                "@type": "ContactPoint",
                email: SUPPORT_EMAIL,
                contactType: "customer service",
              },
              sameAs: [],
            }),
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener('contextmenu', function(e) {
                if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                  e.preventDefault();
                }
              });
            `
          }}
        />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
