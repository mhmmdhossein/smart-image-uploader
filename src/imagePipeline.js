/**
 * Browser-side image pipeline: resize, flat-background removal, re-encode.
 * Zero dependencies — plain Canvas API. Safe to use outside React too.
 */

/** Read a File/Blob into an HTMLImageElement. */
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_DECODE_FAILED"));
    };
    img.src = url;
  });
}

/** Draw an image onto a canvas, capping its longest edge at `maxEdge`. */
export function drawToCanvas(image, maxEdge = 1600) {
  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = maxEdge ? Math.min(1, maxEdge / longest) : 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Remove a flat, uniform background (product shots on white/grey seamless).
 *
 * Flood-fills inward from every edge pixel, clearing only pixels that are both
 * close to the sampled edge colour AND connected to the border. Uniform areas
 * *inside* the subject are therefore preserved. Edge pixels fade out over a
 * soft band so the cut-out does not look jagged.
 *
 * It refuses to touch the image in two cases:
 *   - `already-transparent`: the border is mostly transparent, so the image is
 *     already a cut-out. (Transparent pixels read as rgb(0,0,0) on canvas, so
 *     continuing would treat *black* as the background and eat dark parts of
 *     the subject.)
 *   - `not-flat`: the border colours vary too much — a real scene, not a
 *     seamless backdrop. This algorithm would shred it.
 *
 * @returns {{canvas: HTMLCanvasElement, removedRatio: number, skipped?: "already-transparent"|"not-flat"}}
 */
export function removeFlatBackground(canvas, { tolerance = 26, softness = 18 } = {}) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // ---- sample the border before changing anything -------------------------
  const borderIndexes = [];
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 64));
  for (let x = 0; x < width; x += stepX) {
    borderIndexes.push(x * 4, ((height - 1) * width + x) * 4);
  }
  for (let y = 0; y < height; y += stepY) {
    borderIndexes.push(y * width * 4, (y * width + width - 1) * 4);
  }

  const opaqueBorder = borderIndexes.filter((i) => data[i + 3] > 10);
  const transparentRatio = 1 - opaqueBorder.length / borderIndexes.length;
  if (transparentRatio > 0.4) {
    return { canvas, removedRatio: 0, skipped: "already-transparent" };
  }

  let baseR = 0;
  let baseG = 0;
  let baseB = 0;
  for (const i of opaqueBorder) {
    baseR += data[i];
    baseG += data[i + 1];
    baseB += data[i + 2];
  }
  baseR /= opaqueBorder.length;
  baseG /= opaqueBorder.length;
  baseB /= opaqueBorder.length;

  const spread =
    opaqueBorder.reduce(
      (sum, i) =>
        sum +
        Math.sqrt(
          (data[i] - baseR) ** 2 + (data[i + 1] - baseG) ** 2 + (data[i + 2] - baseB) ** 2
        ),
      0
    ) / opaqueBorder.length;

  if (spread > tolerance * 1.6) {
    return { canvas, removedRatio: 0, skipped: "not-flat" };
  }

  // ---- flood fill from the edges -----------------------------------------
  const distance = (i) =>
    Math.sqrt(
      (data[i] - baseR) ** 2 + (data[i + 1] - baseG) ** 2 + (data[i + 2] - baseB) ** 2
    );

  const visited = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);

  let removed = 0;
  while (stack.length) {
    const pixel = stack.pop();
    if (visited[pixel]) continue;
    visited[pixel] = 1;

    const i = pixel * 4;
    if (data[i + 3] === 0) continue;

    const dist = distance(i);
    if (dist > tolerance + softness) continue;

    data[i + 3] =
      dist <= tolerance ? 0 : Math.round(((dist - tolerance) / softness) * data[i + 3]);
    removed += 1;

    const x = pixel % width;
    const y = (pixel - x) / width;
    if (x > 0) stack.push(pixel - 1);
    if (x < width - 1) stack.push(pixel + 1);
    if (y > 0) stack.push(pixel - width);
    if (y < height - 1) stack.push(pixel + width);
  }

  ctx.putImageData(imageData, 0, 0);
  return { canvas, removedRatio: removed / (width * height) };
}

/** Encode a canvas, falling back to PNG when the requested type is unsupported. */
export function canvasToBlob(canvas, { type = "image/webp", quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) return resolve(blob);
        canvas.toBlob(
          (png) => (png ? resolve(png) : reject(new Error("ENCODE_FAILED"))),
          "image/png"
        );
      },
      type,
      quality
    );
  });
}

/**
 * Run the whole pipeline on a File and return the processed Blob.
 * Useful on its own if you want to handle the upload yourself.
 */
export async function processImage(
  file,
  { maxEdge = 1600, quality = 0.82, format = "image/webp", removeBackground = false, backgroundOptions } = {}
) {
  const image = await fileToImage(file);
  const canvas = drawToCanvas(image, maxEdge);

  let skipped;
  if (removeBackground) {
    const result = removeFlatBackground(canvas, backgroundOptions);
    skipped = result.skipped;
  }

  const blob = await canvasToBlob(canvas, { type: format, quality });
  return { blob, width: canvas.width, height: canvas.height, skipped };
}
