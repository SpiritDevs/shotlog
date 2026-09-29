import { supportsScreenCapture } from "../capture.js";
import { withWebmDuration } from "./webm-duration.js";

export interface RecordedVideo {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
}

export const supportsRecording = () =>
  supportsScreenCapture() && typeof MediaRecorder !== "undefined";

const formats = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
];

/**
 * Asks to share the screen. Call it synchronously from the click: the browser's picker needs
 * the click's user activation, and so does starting the audio mix. Resolves undefined when the
 * Reporter cancels the picker.
 */
export function requestRecording(): Promise<Recorder | undefined> {
  const audio = createAudio();
  const options: DisplayMediaStreamOptions & {
    preferCurrentTab: boolean;
    selfBrowserSurface: "include";
    surfaceSwitching: "exclude";
  } = {
    video: {
      displaySurface: "browser",
      frameRate: { ideal: 30, max: 30 },
      width: { max: 1920 },
      height: { max: 1080 },
    },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
  };
  let sharing: Promise<MediaStream>;
  try {
    sharing = navigator.mediaDevices.getDisplayMedia(options);
  } catch (error) {
    void audio?.context.close();
    throw error;
  }
  return sharing.then(
    (stream) => {
      try {
        return new Recorder(stream, audio);
      } catch (error) {
        for (const track of stream.getTracks()) track.stop();
        void audio?.context.close();
        throw error;
      }
    },
    (error: unknown) => {
      void audio?.context.close();
      if (
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "AbortError")
      )
        return undefined;
      throw error;
    },
  );
}

interface AudioMix {
  readonly context: AudioContext;
  readonly output: MediaStreamAudioDestinationNode;
  readonly gain: GainNode;
}

/** The recording always has an audio track, so the microphone can join after it starts. */
function createAudio(): AudioMix | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  try {
    const context = new AudioContext();
    const output = context.createMediaStreamDestination();
    const gain = context.createGain();
    gain.connect(output);
    return { context, output, gain };
  } catch {
    return undefined;
  }
}

export class Recorder {
  private readonly recorder: MediaRecorder;
  private readonly chunks: Blob[] = [];
  private readonly video: MediaStreamTrack;
  private microphone: Promise<boolean> | undefined;
  private microphoneStream: MediaStream | undefined;
  private startedAt = 0;
  // Read while sharing: an ended track reports no size.
  private size_: { width: number; height: number } = { width: 0, height: 0 };
  private stopped: Promise<RecordedVideo> | undefined;
  /** Bytes recorded so far. */
  size = 0;

  constructor(
    private readonly display: MediaStream,
    private readonly audio: AudioMix | undefined,
  ) {
    const [video] = display.getVideoTracks();
    if (!video) throw new Error("Screen sharing has no video");
    this.video = video;
    const tracks = [video, ...(audio?.output.stream.getAudioTracks() ?? [])];
    const mimeType = formats.find((format) =>
      MediaRecorder.isTypeSupported(format),
    );
    this.recorder = new MediaRecorder(new MediaStream(tracks), {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 96_000,
    });
    this.recorder.addEventListener("dataavailable", (event) => {
      if (!event.data.size) return;
      this.chunks.push(event.data);
      this.size += event.data.size;
    });
  }

  /** Idempotent, like addMicrophone: React may run the session's effects twice. */
  start(): void {
    if (this.startedAt || this.stopped) return;
    this.recorder.start(1000);
    this.startedAt = performance.now();
    this.measure();
  }

  private measure(): void {
    const { width = 0, height = 0 } = this.video.getSettings();
    if (width && height) this.size_ = { width, height };
  }

  get elapsedMs(): number {
    return this.startedAt ? performance.now() - this.startedAt : 0;
  }

  /** Runs when the Reporter stops sharing from the browser's own controls. */
  onEnded(listener: () => void): () => void {
    this.video.addEventListener("ended", listener);
    return () => this.video.removeEventListener("ended", listener);
  }

  /** Adds the microphone to the mix. False when there is none or permission is refused. */
  addMicrophone(): Promise<boolean> {
    this.microphone ??= this.connectMicrophone();
    return this.microphone;
  }

  private async connectMicrophone(): Promise<boolean> {
    if (!this.audio || !navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (this.stopped) {
        for (const track of stream.getTracks()) track.stop();
        return false;
      }
      this.microphoneStream = stream;
      this.audio.context
        .createMediaStreamSource(stream)
        .connect(this.audio.gain);
      await this.audio.context.resume();
      return true;
    } catch {
      return false;
    }
  }

  setMuted(muted: boolean): void {
    if (this.audio) this.audio.gain.gain.value = muted ? 0 : 1;
  }

  stop(): Promise<RecordedVideo> {
    this.stopped ??= new Promise<RecordedVideo>((resolve, reject) => {
      const durationMs = Math.round(this.elapsedMs);
      if (this.video.readyState === "live") this.measure();
      const { width, height } = this.size_;
      const finish = () => {
        const type = this.recorder.mimeType || "video/webm";
        const blob = new Blob(this.chunks, {
          type: type.split(";", 1)[0] ?? type,
        });
        if (!blob.size) return reject(new Error("Nothing was recorded"));
        withWebmDuration(blob, durationMs).then(
          (fixed) =>
            resolve({
              blob: fixed,
              mimeType: type,
              durationMs,
              width: width || 1,
              height: height || 1,
            }),
          reject,
        );
      };
      if (this.recorder.state === "inactive") finish();
      else {
        this.recorder.addEventListener("stop", finish, { once: true });
        this.recorder.stop();
      }
      this.release();
    });
    return this.stopped;
  }

  /** Stops without keeping anything. */
  cancel(): void {
    this.stopped ??= Promise.reject(new Error("Recording cancelled"));
    this.stopped.catch(() => {});
    if (this.recorder.state !== "inactive") this.recorder.stop();
    this.release();
  }

  /** Ends sharing and the microphone right away, so the browser's indicators go too. */
  private release(): void {
    for (const track of this.display.getTracks()) track.stop();
    for (const track of this.microphoneStream?.getTracks() ?? []) track.stop();
    void this.audio?.context.close().catch(() => {});
  }
}
