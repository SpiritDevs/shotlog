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
        <section
          aria-labelledby="account-heading"
          style={{ background: "#eef4ff", padding: "2rem", minHeight: "20rem" }}
        >
          <h2 id="account-heading">Account settings</h2>
          <p>Sample account: alex@example.com</p>
          <button type="button">Save settings</button>
          <p>
            Capture this page, mark the save button with a Rectangle, and use
            Solid redaction to hide private details before submitting.
          </p>
        </section>
        <a href="/api/inbox">View the signed webhook inbox</a>
      </main>
    </ShotlogProvider>
  );
}
