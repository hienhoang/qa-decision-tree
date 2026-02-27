import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "./nav";

export const metadata: Metadata = {
  title: "QA Decision Tree",
  description: "Interactive QA Decision Tree",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased" style={{ background: "linear-gradient(135deg,#0f0c29,#1e1b4b)" }}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
