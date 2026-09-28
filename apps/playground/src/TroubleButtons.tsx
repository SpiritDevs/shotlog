export function TroubleButtons() {
  return (
    <section
      className="panel home-card trouble-panel"
      aria-labelledby="trouble-title"
    >
      <span className="eyebrow">DIAGNOSTIC TRAIL</span>
      <h2 id="trouble-title">Cause some trouble</h2>
      <p>
        Trigger a failure, then open Included Details in the Report Card to
        inspect it.
      </p>
      <div className="trouble-buttons">
        <button
          type="button"
          onClick={() => {
            setTimeout(() => {
              throw new Error("Playground uncaught error");
            }, 0);
          }}
        >
          Throw an error
        </button>
        <button
          type="button"
          onClick={() => console.warn("Playground warning", { page: "Home" })}
        >
          console.warn
        </button>
        <button
          type="button"
          onClick={() => {
            void fetch("/api/nope").catch(() => {});
          }}
        >
          Failing fetch
        </button>
        <button
          type="button"
          onClick={() => {
            void fetch("/api/nope?token=secret123").catch(() => {});
          }}
        >
          Request with token
        </button>
        <button
          type="button"
          onClick={() => {
            void Promise.reject(new Error("Playground unhandled rejection"));
          }}
        >
          Unhandled rejection
        </button>
      </div>
    </section>
  );
}
