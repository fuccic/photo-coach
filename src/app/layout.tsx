import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";
import { PhotosProvider } from "@/components/PhotosProvider";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Photo Coach",
  description: "Find out what to change on your camera to take a better photo.",
};

export const viewport: Viewport = {
  themeColor: "#fff8f1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmMono.variable} font-sans antialiased`}>
        <PhotosProvider>
          <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">{children}</div>
        </PhotosProvider>
      </body>
    </html>
  );
}
