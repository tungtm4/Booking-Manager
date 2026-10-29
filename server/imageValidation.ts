import sharp from 'sharp';

// Kiểm tra ảnh giấy tờ bằng DECODER ĐƯỢC DUY TRÌ (sharp/libvips) — bản sửa A1 vòng 3.
// Bài học từ hai vòng trước: tự viết parser theo header/cấu trúc vẫn lọt file không có
// dữ liệu điểm ảnh thật (ví dụ WebP 26 byte chỉ có khung RIFF/VP8L). Từ vòng này, file
// chỉ được lưu khi decoder giải mã TOÀN BỘ điểm ảnh thành công:
// - sharp đọc bằng libvips (cùng họ decoder libjpeg/libpng/libwebp chuẩn), failOn:'error'
//   để mọi cảnh báo hỏng dữ liệu đều thành lỗi, limitInputPixels chặn bom giải nén.
// - Sau metadata, ép giải mã raw() hết mọi frame (kể cả ảnh động nhiều frame) và đối
//   chiếu kích thước đã giải mã với metadata trước khi chấp nhận.
// Giới hạn: mỗi chiều ≤ 10.000px, tổng ≤ 40MP (limitInputPixels của sharp thực thi).

export const MAX_IMAGE_DIMENSION = 10000;
export const MAX_IMAGE_PIXELS = 40_000_000;

export interface DetectedImage { mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number }

const FORMAT_MIME: Record<string, DetectedImage['mime']> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function validateImageFile(buf: Buffer): Promise<DetectedImage | null> {
  if (!buf || buf.length === 0) return null;
  try {
    const meta = await sharp(buf, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' }).metadata();
    const mime = meta.format ? FORMAT_MIME[meta.format] : undefined;
    if (!mime || !meta.width || !meta.height) return null;
    if (meta.width > MAX_IMAGE_DIMENSION || meta.height > MAX_IMAGE_DIMENSION) return null;
    const pages = meta.pages && meta.pages > 1 ? meta.pages : 1;
    const { info } = await sharp(buf, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error', animated: pages > 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Ảnh động: raw() xếp mọi frame chồng nhau — chiều cao giải mã = chiều cao 1 frame × số frame.
    const expectedHeight = pages > 1 ? (meta.pageHeight ?? meta.height) * pages : meta.height;
    if (info.width !== meta.width || info.height !== expectedHeight) return null;
    return { mime, width: meta.width, height: meta.height };
  } catch {
    return null;
  }
}
