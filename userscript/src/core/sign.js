/* ------------------------------------------------------------------ */
/* MD5 / HMAC-MD5：与站点请求库（@ccw/axios + crypto-js）的签名一致        */
/* ------------------------------------------------------------------ */
export const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
export const MD5_K = new Int32Array(64);
for (let i = 0; i < 64; i++) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;

export function md5Bytes(bytes) {
  const len = bytes.length;
  const nblk = ((len + 8) >> 6) + 1;
  const w = new Int32Array(nblk * 16);
  for (let i = 0; i < len; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
  w[len >> 2] |= 0x80 << ((len % 4) * 8);
  w[nblk * 16 - 2] = (len * 8) | 0;
  w[nblk * 16 - 1] = Math.floor(len / 536870912);
  let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (let o = 0; o < w.length; o += 16) {
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const s = MD5_S[(i >> 4) * 4 + (i % 4)];
      F = (F + A + MD5_K[i] + w[o + g]) | 0;
      A = D; D = C; C = B;
      B = (B + ((F << s) | (F >>> (32 - s)))) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((v, k) => { for (let j = 0; j < 4; j++) out[k * 4 + j] = (v >>> (j * 8)) & 0xff; });
  return out;
}
export const utf8 = (s) => new TextEncoder().encode(s);
export const concat = (a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; };
export function hmacMd5Hex(key, msg) {
  let k = utf8(key);
  if (k.length > 64) k = md5Bytes(k);
  const ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { ipad[i] = (k[i] || 0) ^ 0x36; opad[i] = (k[i] || 0) ^ 0x5c; }
  const out = md5Bytes(concat(opad, md5Bytes(concat(ipad, utf8(msg)))));
  return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('');
}
