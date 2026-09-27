import type { ComponentType } from "react";
import type { MapboxMapViewProps } from "./MapboxCanvas";

type MapboxCanvas = ComponentType<MapboxMapViewProps>;

let loaded: MapboxCanvas | null = null;
let pending: Promise<MapboxCanvas> | null = null;

/**
 * Loads the interactive map (mapbox-gl, ~480 KB gzip) once per page. Only an
 * interactive map needs it: phones show a static preview until tapped.
 */
export function loadMapboxCanvas(): Promise<MapboxCanvas> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= import("./MapboxCanvas")
    // One retry: a deploy can replace the chunk between page load and here.
    .catch(() => import("./MapboxCanvas"))
    .then(
      (mod) => (loaded = mod.default),
      (error: unknown) => {
        pending = null;
        throw error;
      },
    );
  return pending;
}

export function loadedMapboxCanvas(): MapboxCanvas | null {
  return loaded;
}
