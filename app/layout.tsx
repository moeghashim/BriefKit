import "./globals.css";

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
      <body>
        <a className="skip-link" href="#interview">Skip to interview</a>
        {children}
      </body>
    </html>
  );
}
