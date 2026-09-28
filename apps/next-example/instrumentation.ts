/** Validate server configuration at startup, before accepting requests. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./lib/config");
}
