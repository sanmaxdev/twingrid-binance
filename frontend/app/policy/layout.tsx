import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy & Terms of Service",
  description:
    "Read Twin Grid's Privacy Policy and Terms of Service. Learn about our data handling, API security (AES-256 encryption), and trading disclaimer for our automated Binance Futures bot.",
  openGraph: {
    title: "Privacy Policy & Terms — Twin Grid",
    description:
      "Read Twin Grid's Privacy Policy and Terms of Service. Learn about API security, data handling, and trading disclaimers.",
  },
};

export default function PolicyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
