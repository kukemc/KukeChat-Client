// 上传前在本地压图：图片要经我们的服务器转进对象存储（共创世界的 CSP 只放行我们的域名），服务器到对象存储的带宽很小，
// 能在浏览器里省掉的字节都省掉。静态图画到 canvas 上重新编码成 JPEG（顺带去掉 EXIF 定位），最长边 1600；
// GIF 原样传（canvas 只会画第一帧）。压出来反而更大的小图用原图，后端反正还会再处理一遍。
const MAX_SIDE = 1600;
const TARGET_BYTES = 900 * 1024;
const MAX_BYTES = 3 * 1024 * 1024; // 后端单张上限
const ATTEMPTS = [[1600, 0.8], [1600, 0.7], [1280, 0.66], [1080, 0.58]];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读不出来')); };
    img.src = url;
  });
}

function encode(img, side, quality) {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  // 透明的地方垫白底（和后端把 PNG 转 JPEG 的结果一致）
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

/** 返回要上传的 Blob（带 name）；不是图片或太大时抛出能直接给用户看的错误。 */
export async function compressForUpload(file) {
  const type = (file.type || '').toLowerCase();
  if (!type.startsWith('image/')) throw new Error('只能发图片');
  if (type === 'image/gif') {
    if (file.size > MAX_BYTES) throw new Error('动图超过 3MB，发不了');
    return file;
  }
  let img;
  try { img = await loadImage(file); } catch (err) {
    if (file.size <= MAX_BYTES) return file; // 浏览器解不了的格式交给后端
    throw err;
  }
  const small = Math.max(img.naturalWidth, img.naturalHeight) <= MAX_SIDE;
  let best = null;
  for (const [side, quality] of ATTEMPTS) {
    const blob = await encode(img, side, quality);
    if (!blob) break;
    if (!best || blob.size < best.size) best = blob;
    if (blob.size <= TARGET_BYTES) break;
  }
  if (!best) {
    if (file.size <= MAX_BYTES) return file;
    throw new Error('图片太大了，换一张试试');
  }
  // 本来就不大的 JPEG / PNG：重新编码没变小就用原图
  if (small && file.size <= best.size && file.size <= MAX_BYTES) return file;
  if (best.size > MAX_BYTES) throw new Error('图片太大了，换一张试试');
  return new File([best], (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}
