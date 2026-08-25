import type { UiContent } from "@agent-workspace/ui";
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Workspace",
  description: "Agent Workspace web scaffold",
};

export default function RootLayout({ children }: Readonly<{ children: UiContent }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
