import type { Metadata } from "next";
import { Overpass } from "next/font/google";
import "./globals.css";

// Overpass is drawn from Highway Gothic, the lettering on US road signs.
const overpass = Overpass({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TripTogether",
  description: "Plan a trip with your group, from the first invite to the drive home.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={overpass.variable}>
      <body>{children}</body>
    </html>
  );
}
