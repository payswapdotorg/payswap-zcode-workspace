import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PaySwap Workspace — Payment agents & automations",
  description: "ZCode-style agent workspace, fully aimed at payments: tasks, automations, plugin marketplace and settlement tooling.",
  keywords: ["PaySwap", "payments", "agents", "automations", "reconciliation", "payouts"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "PaySwap Workspace",
    description: "Agent workspace for money movement — tasks, automations, plugins.",
    url: "https://chat.z.ai",
    siteName: "PaySwap",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PaySwap Workspace",
    description: "Agent workspace for money movement.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
