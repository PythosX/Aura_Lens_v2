export type Lm = { x: number; y: number; z: number };

const HAND_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/";
const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";

function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.crossOrigin = "anonymous";
    s.onload = () => res();
    s.onerror = () => rej(new Error("Could not load " + src));
    document.head.appendChild(s);
  });
}

const importRemote = (url: string) =>
  (new Function("u", "return import(u)") as (u: string) => Promise<any>)(url);

export type CameraError = "denied" | "none" | "busy" | "unknown";

/**
 * Camera + hand + Face Landmarker pipeline.
 * Face and hand inference are kept separate from the 60 FPS renderer.
 */
export class TrackerEngine {
  video: HTMLVideoElement | null = null;
  latest: Lm[][] = [];
  face: Lm[] = [];
  private Ctor: any = null;
  private hands: any = null;
  private faceLandmarker: any = null;
  private stream: MediaStream | null = null;
  private running = false;
  private lastFaceTime = -1;

  async loadRuntime() {
    let H: any = null;
    try {
      const mod: any = await import("@mediapipe/hands");
      H = mod.Hands ?? mod.default?.Hands;
    } catch { /* CDN fallback */ }
    if (!H) {
      await loadScript(HAND_CDN + "hands.js");
      H = (window as any).Hands;
    }
    if (!H) throw new Error("MediaPipe Hands runtime unavailable");
    this.Ctor = H;
  }

  async initModel() {
    this.hands = new this.Ctor({ locateFile: (f: string) => HAND_CDN + f });
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
      selfieMode: false,
    });
    this.hands.onResults((r: any) => { this.latest = r.multiHandLandmarks ?? []; });
    await this.hands.initialize();

    // Face Landmarker is loaded remotely so the project stays dependency-light.
    const vision = await importRemote(VISION_CDN)();
    const { FilesetResolver, FaceLandmarker } = vision;
    const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
    this.faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }

  async startCamera(video: HTMLVideoElement) {
    this.video = video;
    if (!navigator.mediaDevices?.getUserMedia) throw "none" as CameraError;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
    } catch (e: any) {
      const n = e?.name;
      if (n === "NotAllowedError" || n === "SecurityError") throw "denied" as CameraError;
      if (n === "NotFoundError" || n === "OverconstrainedError") throw "none" as CameraError;
      if (n === "NotReadableError") throw "busy" as CameraError;
      throw "unknown" as CameraError;
    }
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
  }

  startDetection() {
    if (this.running || !this.video) return;
    this.running = true;
    let lastTime = -1;
    const tick = async () => {
      if (!this.running) return;
      const v = this.video!;
      if (v.readyState >= 2 && v.currentTime !== lastTime) {
        lastTime = v.currentTime;
        try {
          await this.hands.send({ image: v });
          if (this.faceLandmarker && v.currentTime !== this.lastFaceTime) {
            const result = this.faceLandmarker.detectForVideo(v, performance.now());
            this.face = result?.faceLandmarks?.[0] ?? [];
            this.lastFaceTime = v.currentTime;
          }
        } catch { /* skip bad frame */ }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.hands?.close?.();
    this.faceLandmarker?.close?.();
    this.faceLandmarker = null;
  }
}
