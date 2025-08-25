
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Poppins } from "next/font/google";
import { GeistSans } from 'geist/font/sans';
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"

import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/components/providers/auth-provider";
import AuthWrapper from "@/components/providers/auth-wrapper";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CallProvider } from '@/components/providers/call-provider'; // 1. Import it

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
        <CallProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
          >
            <AuthWrapper>{children}</AuthWrapper>
            <Toaster />
            <Analytics />
            <SpeedInsights />
          </ThemeProvider>
          </CallProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
