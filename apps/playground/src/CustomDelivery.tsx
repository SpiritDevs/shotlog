import {
  RateLimited,
  ShotlogProvider,
  type SupportLogSubmission,
} from "shotlog";

declare global {
  interface Window {
    shotlogCustomSubmissions: SupportLogSubmission[];
  }
}

export function CustomDelivery() {
  return (
    <ShotlogProvider
      onSubmit={async ({ log }) => {
        window.shotlogCustomSubmissions ??= [];
        const submissions = window.shotlogCustomSubmissions;
        submissions.push(log);
        if (submissions.length === 2) throw new RateLimited(120);
      }}
    >
      <main className="app-shell">
        <h1>Custom delivery</h1>
        <p>
          The first report is stored in window.shotlogCustomSubmissions. The
          second call throws RateLimited(120).
        </p>
        <a href="#/">Back to Playground</a>
      </main>
    </ShotlogProvider>
  );
}
