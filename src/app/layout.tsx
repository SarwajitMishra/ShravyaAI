
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Poppins } from "next/font/google";
import { GeistSans } from 'geist/font/sans';
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"

import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/app/auth-provider";
import AuthWrapper from "@/app/auth-wrapper";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ['400', '600', '700'],
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: "Shravya AI",
  description: "Your personal AI companion for mindful conversations.",
  icons: {
    icon: "icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#FF9933",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={GeistSans.className} suppressHydrationWarning>
        <AuthProvider>
          <AuthWrapper>{children}</AuthWrapper>
          <Toaster />
          <Analytics />
          <SpeedInsights />
        </AuthProvider>
      </body>
    </html>
  );
}
