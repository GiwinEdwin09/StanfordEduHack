import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Viva — Evidence-based oral exams",
  description:
    "Adaptive AI oral exams with explainable, evidence-based integrity signals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
