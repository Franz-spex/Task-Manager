import type { Metadata } from "next";
import "./globals.css";
import "./reference.css";

export const metadata: Metadata = {
  title: "taskbloc — A little more organized",
  description: "Your personal task workspace. Plan projects, organize tasks, and find clarity with an editable demo planning assistant.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
