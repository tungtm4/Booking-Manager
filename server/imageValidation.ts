import {inflateSync} from 'node:zlib';

// Kiểm tra ảnh THẬT cho giấy tờ tải lên (đợt A1 — rà soát lại):
// không dừng ở vài byte magic đầu file. Mỗi định dạng được kiểm tra tới mức giải mã/cấu trúc:
// - PNG: duyệt toàn bộ chunk + CRC, giải nén (inflate) dữ liệu điểm ảnh và đối chiếu đúng
//   kích thước thô suy ra từ IHDR (kể cả ảnh interlace theo 7 lượt Adam7).
// - JPEG: duyệt chuỗi marker/segment hợp lệ tới SOS, có đủ SOF/DQT/DHT, dữ liệu quét
//   kết thúc bằng EOI — file bị cắt cụt hay chỉ có header đều bị loại.
// - WebP: kích thước RIFF phải khớp đúng độ dài file, chuỗi chunk đi hết container,
//   header VP8/VP8L/VP8X hợp lệ và đọc được kích thước thật.
// Giới hạn chống file giả/bom giải nén: mỗi chiều ≤ 10.000px, tổng ≤ 40MP,
// dữ liệu điểm ảnh thô sau giải nén ≤ 200MB (inflate bị chặn cứng ở kích thước kỳ vọng).

export const MAX_IMAGE_DIMENSION = 10000;
export const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_RAW_PIXEL_BYTES = 200 * 1024 * 1024;

export interface DetectedImage { mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number }

const dimsOk = (w: number, h: number) =>
  Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1 &&
  w <= MAX_IMAGE_DIMENSION && h <= MAX_IMAGE_DIMENSION && w * h <= MAX_IMAGE_PIXELS;

// ---------- PNG ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buf: Buffer, from: number, to: number): number {
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
function pngRowBytes(width: number, channels: number, bitDepth: number): number {
  return Math.ceil((width * channels * bitDepth) / 8);
}
function pngExpectedRawSize(w: number, h: number, channels: number, bitDepth: number, interlace: number): number {
  if (interlace === 0) return h * (1 + pngRowBytes(w, channels, bitDepth));
  const passes: Array<[number, number, number, number]> = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
  let total = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = w > x0 ? Math.ceil((w - x0) / dx) : 0;
    const ph = h > y0 ? Math.ceil((h - y0) / dy) : 0;
    if (pw && ph) total += ph * (1 + pngRowBytes(pw, channels, bitDepth));
  }
  return total;
}
function validatePng(buf: Buffer): DetectedImage | null {
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 8 || !SIG.every((b, i) => buf[i] === b)) return null;
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = 0;
  let seenPlte = false, seenIend = false, first = true;
  const idatParts: Buffer[] = [];
  while (pos < buf.length) {
    if (pos + 8 > buf.length) return null;
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (pos + 12 + len > buf.length) return null;
    if (crc32(buf, pos + 4, pos + 8 + len) !== buf.readUInt32BE(pos + 8 + len)) return null;
    const dataAt = pos + 8;
    if (first) {
      if (type !== 'IHDR' || len !== 13) return null;
      width = buf.readUInt32BE(dataAt); height = buf.readUInt32BE(dataAt + 4);
      bitDepth = buf[dataAt + 8]; colorType = buf[dataAt + 9];
      if (buf[dataAt + 10] !== 0 || buf[dataAt + 11] !== 0) return null;
      interlace = buf[dataAt + 12];
      if (interlace !== 0 && interlace !== 1) return null;
      if (!(colorType in PNG_CHANNELS) || ![1, 2, 4, 8, 16].includes(bitDepth)) return null;
      if (!dimsOk(width, height)) return null;
      first = false;
    } else if (type === 'PLTE') seenPlte = true;
    else if (type === 'IDAT') { if (colorType === 3 && !seenPlte) return null; idatParts.push(buf.subarray(dataAt, dataAt + len)); }
    else if (type === 'IEND') { seenIend = true; pos += 12 + len; break; }
    pos += 12 + len;
  }
  if (!seenIend || pos !== buf.length || !idatParts.length) return null;
  const channels = PNG_CHANNELS[colorType];
  const expected = pngExpectedRawSize(width, height, channels, bitDepth, interlace);
  if (expected > MAX_RAW_PIXEL_BYTES) return null;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idatParts), { maxOutputLength: expected + 1 });
  } catch { return null; }
  if (raw.length !== expected) return null;
  return { mime: 'image/png', width, height };
}

// ---------- JPEG ----------
function validateJpeg(buf: Buffer): DetectedImage | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let pos = 2, width = 0, height = 0, seenSof = false, seenDqt = false, seenDht = false;
  for (let guard = 0; guard < 10000; guard++) {
    if (pos + 1 >= buf.length) return null;
    if (buf[pos] !== 0xff) return null;
    let marker = buf[pos + 1];
    while (marker === 0xff) { // byte đệm
      pos++;
      if (pos + 1 >= buf.length) return null;
      marker = buf[pos + 1];
    }
    if (marker === 0x00) return null;
    pos += 2;
    if (marker === 0xd9) return null; // EOI trước khi có dữ liệu quét
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue; // marker không có độ dài
    if (pos + 2 > buf.length) return null;
    const segLen = buf.readUInt16BE(pos);
    if (segLen < 2 || pos + segLen > buf.length) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) {
      if (segLen < 7) return null;
      height = buf.readUInt16BE(pos + 3); width = buf.readUInt16BE(pos + 5);
      if (!dimsOk(width, height)) return null;
      seenSof = true;
    } else if (marker === 0xdb) seenDqt = true;
    else if (marker === 0xc4) seenDht = true;
    else if (marker === 0xda) { // SOS — phần còn lại là dữ liệu quét, phải chốt bằng EOI
      if (!seenSof || !seenDqt || !seenDht) return null;
      const scanStart = pos + segLen;
      if (buf.length - scanStart < 4) return null;
      if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return null;
      return { mime: 'image/jpeg', width, height };
    }
    pos += segLen;
  }
  return null;
}

// ---------- WebP ----------
function validateWebp(buf: Buffer): DetectedImage | null {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  if (buf.readUInt32LE(4) !== buf.length - 8) return null;
  let pos = 12, width = 0, height = 0, first = true, seenImageChunk = false;
  while (pos < buf.length) {
    if (pos + 8 > buf.length) return null;
    const fourcc = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const dataAt = pos + 8;
    if (dataAt + size > buf.length) return null;
    if (first) {
      if (fourcc === 'VP8 ') {
        if (size < 10) return null;
        if ((buf[dataAt] & 1) !== 0) return null; // phải là keyframe
        if (buf[dataAt + 3] !== 0x9d || buf[dataAt + 4] !== 0x01 || buf[dataAt + 5] !== 0x2a) return null;
        width = buf.readUInt16LE(dataAt + 6) & 0x3fff;
        height = buf.readUInt16LE(dataAt + 8) & 0x3fff;
        seenImageChunk = true;
      } else if (fourcc === 'VP8L') {
        if (size < 5 || buf[dataAt] !== 0x2f) return null;
        const b1 = buf[dataAt + 1], b2 = buf[dataAt + 2], b3 = buf[dataAt + 3], b4 = buf[dataAt + 4];
        width = (b1 | ((b2 & 0x3f) << 8)) + 1;
        height = (((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10))) + 1;
        seenImageChunk = true;
      } else if (fourcc === 'VP8X') {
        if (size < 10) return null;
        width = (buf[dataAt + 4] | (buf[dataAt + 5] << 8) | (buf[dataAt + 6] << 16)) + 1;
        height = (buf[dataAt + 7] | (buf[dataAt + 8] << 8) | (buf[dataAt + 9] << 16)) + 1;
      } else return null;
      if (!dimsOk(width, height)) return null;
      first = false;
    } else if (fourcc === 'VP8 ' || fourcc === 'VP8L' || fourcc === 'ANMF') seenImageChunk = true;
    pos = dataAt + size + (size % 2);
  }
  if (pos !== buf.length || !seenImageChunk) return null;
  return { mime: 'image/webp', width, height };
}

export function validateImageFile(buf: Buffer): DetectedImage | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return validatePng(buf);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return validateJpeg(buf);
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'RIFF') return validateWebp(buf);
  return null;
}
