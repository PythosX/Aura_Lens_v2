import { useCallback } from "react";
import type { TrackerEngine } from "../lib/tracker";
import { detectRegions, type RegionStates } from "../lib/regions";

export function useMultiRegionTracker(engine: TrackerEngine) {
  return useCallback((width: number, height: number): RegionStates =>
    detectRegions(engine.face, engine.latest, width, height, 0.12), [engine]);
}
