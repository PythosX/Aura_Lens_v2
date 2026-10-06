import type { RegionId } from "./regions";

export type Pt = { x: number; y: number };

export interface Settings {
  presetId: string;
  regionPresets: Record<RegionId, string>;
  neon: string;
  glow: number;
  width: number;
  opacity: number;
  particles: boolean;
  audio: boolean;
  showFps: boolean;
  debug: boolean;
}

export interface Preset {
  id: string;
  name: string;
  src: string;
  accent: string;
}

export const DEFAULT_SETTINGS: Settings = {
  presetId: "gojo",
  regionPresets: {
    eyes: "gojo",
    mouth: "sukuna",
    forehead: "naruto",
    fullFace: "neon",
  },
  neon: "#06B6D4",
  glow: 24,
  width: 4,
  opacity: 0.95,
  particles: true,
  audio: true,
  showFps: true,
  debug: false,
};
