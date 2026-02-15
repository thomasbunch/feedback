/**
 * Image comparison utility using sharp + pixelmatch
 * Decodes two images, runs pixel-level comparison, and produces a WebP diff image
 */

import sharp from "sharp";
import pixelmatch from "pixelmatch";

export interface ImageDiffResult {
  mismatchCount: number;
  mismatchPercentage: number;
  totalPixels: number;
  width: number;
  height: number;
  diffBuffer: Buffer;
}

/**
 * Compare two images pixel-by-pixel and produce a diff image.
 *
 * @param img1Buffer - First image as a Buffer (any format sharp can decode)
 * @param img2Buffer - Second image as a Buffer (any format sharp can decode)
 * @param options - Comparison options
 * @param options.threshold - Pixel matching sensitivity 0-1 (lower = stricter). Default: 0.1
 * @returns Mismatch statistics and a WebP-encoded diff image
 * @throws If image dimensions differ
 */
export async function compareImages(
  img1Buffer: Buffer,
  img2Buffer: Buffer,
  options?: { threshold?: number }
): Promise<ImageDiffResult> {
  // Decode both images to raw RGBA
  const [raw1, raw2] = await Promise.all([
    sharp(img1Buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(img2Buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);

  // Validate dimensions match
  if (
    raw1.info.width !== raw2.info.width ||
    raw1.info.height !== raw2.info.height
  ) {
    throw new Error(
      `Image dimensions differ: ${raw1.info.width}x${raw1.info.height} vs ${raw2.info.width}x${raw2.info.height}. Both images must have the same dimensions.`
    );
  }

  const { width, height } = raw1.info;

  // Create diff output buffer and run pixelmatch
  // pixelmatch v7 expects Uint8Array, not Buffer -- use views without copying
  const diff = Buffer.alloc(width * height * 4);
  const mismatchCount = pixelmatch(
    new Uint8Array(raw1.data.buffer, raw1.data.byteOffset, raw1.data.byteLength),
    new Uint8Array(raw2.data.buffer, raw2.data.byteOffset, raw2.data.byteLength),
    new Uint8Array(diff.buffer, diff.byteOffset, diff.byteLength),
    width,
    height,
    { threshold: options?.threshold ?? 0.1 }
  );

  // Encode diff image to WebP
  const diffWebP = await sharp(diff, {
    raw: { width, height, channels: 4 },
  })
    .webp({ quality: 80 })
    .toBuffer();

  const totalPixels = width * height;
  return {
    mismatchCount,
    mismatchPercentage: (mismatchCount / totalPixels) * 100,
    totalPixels,
    width,
    height,
    diffBuffer: diffWebP,
  };
}
