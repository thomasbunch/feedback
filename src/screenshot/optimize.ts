/**
 * Screenshot optimization pipeline
 * Resizes and converts screenshots to WebP for efficient MCP transport
 */

import sharp from "sharp";

/**
 * Optimize a raw screenshot buffer: resize + WebP conversion
 * @param buffer - Raw PNG/JPEG buffer from capture
 * @param options - Optimization options
 * @returns Optimized buffer with metadata
 */
export async function optimizeScreenshot(
  buffer: Buffer,
  options?: { maxWidth?: number; quality?: number }
): Promise<{ data: Buffer; mimeType: string; width: number; height: number }> {
  const maxWidth = options?.maxWidth ?? 1280;
  const quality = options?.quality ?? 80;

  const optimized = await sharp(buffer)
    .resize(maxWidth, undefined, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });

  return {
    data: optimized.data,
    mimeType: "image/webp",
    width: optimized.info.width,
    height: optimized.info.height,
  };
}
