import type {
  Metadata,
  Viewport,
} from "next";
import {
  Geist,
  Geist_Mono,
} from "next/font/google";
import "./globals.css";
import GlobalMessageListener from "./components/GlobalMessageListener";
import ThemeController from "./components/ThemeController";
import PushRegistration from "./components/PushRegistration";
import PullToRefresh from "./components/PullToRefresh";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brework",
  description: "Connect with students through meaningful conversations.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f8f7f4",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeController />
        <GlobalMessageListener />
        <PushRegistration />
        <PullToRefresh>{children}</PullToRefresh>
      </body>
    </html>
  );
}
