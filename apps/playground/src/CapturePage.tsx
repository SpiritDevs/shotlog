import { useEffect, useRef } from "react";

const corsImage =
  "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg";

/** Deliberately hostile fixtures for manual and later Playwright fidelity checks. */
export function CapturePage() {
  const video = useRef<HTMLVideoElement>(null);
  const webgl = useRef<HTMLCanvasElement>(null);
  const tainted = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const gl = webgl.current?.getContext("webgl", {
      preserveDrawingBuffer: true,
    });
    if (gl) {
      gl.clearColor(0.16, 0.26, 0.7, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(60, 40, 160, 80);
      gl.clearColor(0.95, 0.55, 0.2, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 160;
    const context = canvas.getContext("2d");
    const media = video.current;
    let frame = 0;
    const draw = (time: number) => {
      if (context) {
        context.fillStyle = "#183a37";
        context.fillRect(0, 0, 280, 160);
        context.fillStyle = "#ecb365";
        context.fillRect(20 + ((time / 20) % 200), 50, 40, 60);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const stream = canvas.captureStream?.(12);
    if (media && stream) {
      media.srcObject = stream;
      void media.play().catch(() => {});
    }
    return () => {
      cancelAnimationFrame(frame);
      for (const track of stream?.getTracks() ?? []) track.stop();
      if (media) media.srcObject = null;
    };
  }, []);

  return (
    <>
      <style>{`
        * { all: revert !important; font: 30px serif !important; }
        html { background: #f4f1e8 !important; }
        .capture-page { display: block !important; margin: 24px auto !important; max-width: 1000px !important; }
        .capture-page section { display: block !important; margin: 24px 0 !important; padding: 20px !important; border: 2px solid #969089 !important; }
        .capture-page h1, .capture-page h2 { display: block !important; margin: 0 0 12px !important; font-weight: bold !important; }
        .capture-page p { display: block !important; margin: 12px 0 !important; }
        .capture-page img, .capture-page video, .capture-page canvas, .capture-page iframe { display: inline-block !important; width: 280px !important; height: 160px !important; object-fit: contain !important; vertical-align: top !important; }
        .capture-sticky { display: block !important; position: sticky !important; top: 0 !important; z-index: 10 !important; padding: 14px !important; background: #f5cd75 !important; }
        .capture-glass { display: block !important; padding: 32px !important; background: repeating-linear-gradient(45deg, #6776b1 0 15px, #d58969 15px 30px) !important; }
        .capture-glass p { padding: 20px !important; background: #ffffff88 !important; backdrop-filter: blur(8px) !important; }
        .capture-scroll { min-height: 500px !important; background: linear-gradient(#e8efea, #c9d9db) !important; }
      `}</style>
      <div className="capture-sticky">
        Sticky header · capture at different scroll positions ·{" "}
        <a href="#/">Home</a>
      </div>
      <article className="capture-page">
        <h1>Capture stress page</h1>
        <p>
          The page-wide reset includes the widget host. The card should retain
          its own styling.
        </p>
        <section>
          <h2>Cross-origin iframe</h2>
          <iframe title="Cross-origin example" src="https://example.com" />
          <p>A blank frame is expected in Page Render.</p>
        </section>
        <section>
          <h2>Generated video and WebGL</h2>
          <video
            ref={video}
            muted
            playsInline
            autoPlay
            aria-label="Canvas-generated moving square"
          />
          <canvas
            ref={webgl}
            width={280}
            height={160}
            aria-label="WebGL orange rectangle on blue"
          />
        </section>
        <section>
          <h2>Cross-origin images and tainted canvas</h2>
          <img
            src="https://www.w3.org/Icons/w3c_home.png"
            alt="W3C logo without CORS"
            onLoad={(event) => {
              const canvas = tainted.current;
              canvas
                ?.getContext("2d")
                ?.drawImage(event.currentTarget, 0, 0, 280, 160);
            }}
          />
          <img
            src={corsImage}
            crossOrigin="anonymous"
            alt="CORS-enabled example"
          />
          <canvas
            ref={tainted}
            width={280}
            height={160}
            aria-label="Canvas tainted by a cross-origin image"
          />
        </section>
        <section className="capture-glass">
          <h2>Backdrop filter</h2>
          <p>Translucent glass over a striped background.</p>
        </section>
        {[1, 2, 3, 4].map((number) => (
          <section key={number} className="capture-scroll">
            <h2>Scroll marker {number}</h2>
            <p>
              Capture here: this marker and the sticky header should be visible,
              with no Report Card.
            </p>
          </section>
        ))}
      </article>
    </>
  );
}
