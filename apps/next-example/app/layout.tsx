import type { ReactNode } from "react";

export const metadata = { title: "shotlog · Next.js example" };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", margin: "3rem" }}>
        {children}
      </body>
    </html>
  );
}
