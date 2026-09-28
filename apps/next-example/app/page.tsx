"use client";

import { ShotlogProvider } from "shotlog";

export default function Page() {
  return (
    <ShotlogProvider endpoint="/api/support">
      <main>
        <h1>Support reports in Next.js</h1>
        <p>
          Open the Launcher to send a report through an App Router endpoint.
        </p>
        <a href="/api/inbox">View the signed webhook inbox</a>
      </main>
    </ShotlogProvider>
  );
}
