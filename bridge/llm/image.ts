import type { ImageData } from './types';

const MAX_CHARS = 10_000_000;

/** Parses a browser data: URL into inline image data, or undefined if it is not a safe image. */
export function parseDataUrl(dataUrl: unknown): ImageData | undefined {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_CHARS) return undefined;
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  return m ? { mimeType: m[1], data: m[2] } : undefined;
}
