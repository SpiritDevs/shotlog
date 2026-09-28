import type { Reporter } from "shotlog";

export const reporter: Reporter = {
  id: "playground-user",
  email: "alex@example.com",
  name: "Alex Morgan",
  plan: "pro",
};

export const metadata = { appVersion: "0.0.0-dev", tenant: "playground" };
