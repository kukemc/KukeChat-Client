// Compression is best-effort: unsupported codecs and canvas failures fall back to
// originals only if they satisfy the upload size limit. The server remains the final validator.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MIN_PROCESS_BYTES = 512 * 1024;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 12_000_000;
const MAX_SIDE = 2048;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ACCEPTED_IMAGE_TYPES = new Set([...IMAGE_TYPES, 'image/gif']);

function useOriginal(file: File): File {
  if (ACCEPTED_IMAGE_TYPES.has(file.type.toLowerCase()) && file.size > MAX_UPLOAD_BYTES) {
    throw new Error('图片压缩失败或原图超出处理上限，请选择另一张不超过 3MB 的图片');
  }
  return file;
}
// Message/post uploads can submit many files with Promise.all. Decode only one at a time.
let compressionQueue: Promise<void> = Promise.resolve();

async function readImageDimensions(file: File): Promise<[number, number] | null> {
  // Parse only the header before decoding: a tiny file can otherwise expand into
  // hundreds of megapixels inside the browser's native decoder.
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  if (file.type === 'image/png' && bytes.length >= 24 &&
      view.getUint32(0) === 0x89504e47 && view.getUint32(12) === 0x49484452) {
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (file.type === 'image/jpeg' && bytes.length >= 4 && view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xff) { offset++; continue; }
      if (marker === 0xda || marker === 0xd9 || marker === 0x00) return null;
      const length = view.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) return null;
        return [view.getUint16(offset + 7), view.getUint16(offset + 5)];
      }
      offset += length + 2;
    }
  }
  if (file.type === 'image/webp' && bytes.length >= 30 &&
      view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const chunk = view.getUint32(12);
    if (chunk === 0x56503858) {
      // VP8X animation must not silently become a single still frame.
      if (bytes[20] & 0x02) return null;
      return [1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)];
    }
    if (chunk === 0x56503820 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    }
    if (chunk === 0x5650384c && bytes[20] === 0x2f) {
      return [1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
        1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | (bytes[22] >> 6))];
    }
  }
  return null;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Image upload cancelled', 'AbortError');
  }
}

function yieldToUi(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, 0);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Image upload cancelled', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function loadImage(blob: Blob, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', onAbort);
      URL.revokeObjectURL(url);
    };
    const onAbort = () => {
      image.src = '';
      cleanup();
      reject(new DOMException('Image upload cancelled', 'AbortError'));
    };
    image.onload = () => {
      if (typeof image.decode === 'function') {
        void image.decode().then(() => { cleanup(); resolve(image); }, (error: unknown) => { cleanup(); reject(error); });
      } else {
        cleanup();
        resolve(image);
      }
    };
    image.onerror = () => { cleanup(); reject(new Error('Cannot decode image')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    } else {
      image.src = url;
    }
  });
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function isDecodable(blob: Blob, signal?: AbortSignal): Promise<boolean> {
  const image = await loadImage(blob, signal);
  if (!image.naturalWidth || !image.naturalHeight) return false;
  // decode() is awaited by loadImage where available. Force actual pixel access in
  // older webviews where the load event may only indicate readable image headers.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) return false;
  context.drawImage(image, 0, 0, 1, 1);
  checkAbort(signal);
  return true;
}

/** Best-effort image-only upload preparation; original File is returned on any codec failure. */
export async function prepareImageUpload(file: File, signal?: AbortSignal): Promise<File> {
  checkAbort(signal);
  // GIF is always untouched (including animated GIF); voice and unsupported formats bypass canvas.
  if (!IMAGE_TYPES.has(file.type.toLowerCase())) return useOriginal(file);
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('待压缩图片原图不能超过 12MB');
  }
  if (file.size < MIN_PROCESS_BYTES || typeof document === 'undefined' ||
      typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return useOriginal(file);
  }
  const previous = compressionQueue;
  let release!: () => void;
  compressionQueue = new Promise<void>((resolve) => { release = resolve; });
  try {
    await previous;
    checkAbort(signal);
    return await compressImage(file, signal);
  } finally {
    release();
  }
}

async function compressImage(file: File, signal?: AbortSignal): Promise<File> {
  try {
    await yieldToUi(signal);
    const dimensions = await readImageDimensions(file);
    checkAbort(signal);
    if (!dimensions || !dimensions[0] || !dimensions[1] ||
        dimensions[0] * dimensions[1] > MAX_SOURCE_PIXELS) return useOriginal(file);
    const image = await loadImage(file, signal);
    checkAbort(signal);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > MAX_SOURCE_PIXELS) return useOriginal(file);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: true });
    if (!context || typeof canvas.toBlob !== 'function') return useOriginal(file);

    // Only shrink: never upscale a small image. A second/third pass is only needed
    // when the initial 2048px encoding is still over the server's 3 MiB limit.
    const baseScale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const longSides = [MAX_SIDE, 1600, 1280];
    let best: Blob | null = null;
    for (const side of longSides) {
      const scale = Math.min(baseScale, side / Math.max(width, height));
      const outputWidth = Math.max(1, Math.round(width * scale));
      const outputHeight = Math.max(1, Math.round(height * scale));
      if (side !== MAX_SIDE && canvas.width === outputWidth && canvas.height === outputHeight) break;
      await yieldToUi(signal);
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      // Transparent pixels stay transparent: never composite onto an opaque background.
      context.clearRect(0, 0, outputWidth, outputHeight);
      context.drawImage(image, 0, 0, outputWidth, outputHeight);
      const formats: Array<[string, number | undefined]> = file.type === 'image/jpeg'
        ? [['image/jpeg', 0.82], ['image/jpeg', 0.68]]
        : file.type === 'image/png'
          ? [['image/webp', 0.82], ['image/webp', 0.65], ['image/png', undefined]]
          : [['image/webp', 0.82], ['image/webp', 0.65]];
      for (const [type, quality] of formats) {
        await yieldToUi(signal);
        const candidate = await encode(canvas, type, quality);
        checkAbort(signal);
        // Some browsers silently substitute PNG for unsupported WebP encoders.
        if (!candidate || candidate.type !== type || candidate.size === 0) continue;
        if (!best || candidate.size < best.size) best = candidate;
      }
      if (best && best.size <= MAX_UPLOAD_BYTES &&
          (file.size > MAX_UPLOAD_BYTES || best.size <= file.size * 0.85)) break;
    }
    // Never replace a valid original with an oversized or barely smaller encode.
    if (!best || best.size > MAX_UPLOAD_BYTES ||
        (file.size <= MAX_UPLOAD_BYTES && best.size > file.size * 0.85)) return useOriginal(file);
    if (!await isDecodable(best, signal)) return useOriginal(file);
    checkAbort(signal);
    const extension = best.type === 'image/jpeg' ? 'jpg' : best.type === 'image/webp' ? 'webp' : 'png';
    const name = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([best], `${name}.${extension}`, { type: best.type, lastModified: file.lastModified });
  } catch (error) {
    checkAbort(signal);
    // Decoder, canvas or encoder can be missing/throw in community webviews.
    return useOriginal(file);
  }
}
