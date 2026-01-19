import "./globals.css";
import { Playfair_Display, Source_Serif_4, JetBrains_Mono } from "next/font/google";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"]
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"]
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"]
});

export const metadata = {
  title: "BriefKit - PRD Interview",
  description: "Interview-driven PRD generator"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${playfair.variable} ${sourceSerif.variable} ${jetbrains.variable}`}>
        <a className="skip-link" href="#interview">Skip to interview</a>
        {children}
      </body>
    </html>
  );
}
