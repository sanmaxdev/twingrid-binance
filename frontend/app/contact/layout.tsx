import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the Twin Grid team for support, partnership inquiries, or feedback about our automated Binance Futures grid trading platform.",
  openGraph: {
    title: "Contact Twin Grid — Support & Inquiries",
    description:
      "Reach out to the Twin Grid team for trading bot support, account help, or partnership inquiries.",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
