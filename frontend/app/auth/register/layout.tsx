import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Join Twin Grid and start automated Binance Futures trading. Set up your account in minutes.",
  robots: { index: false, follow: false },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
