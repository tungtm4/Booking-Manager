/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parser
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Khởi tạo Gemini AI Client từ API Key
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ----------------------------------------------------------------------------
// API: Trích xuất báo giá KOL tự động bằng Gemini AI (Feature 2.2)
// ----------------------------------------------------------------------------
app.post('/api/ai/extract-prices', async (req, res) => {
  try {
    const { text, imageBase64, imageMimeType } = req.body;

    if (!text && !imageBase64) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng cung cấp đoạn văn bản tin nhắn hoặc ảnh chụp báo giá.',
      });
    }

    if (!aiClient) {
      // Nếu chưa có API key trên server, trả về phản hồi để client fallback
      return res.status(200).json({
        success: false,
        useFallback: true,
        message: 'Chưa cấu hình GEMINI_API_KEY trên môi trường server. Hệ thống sẽ sử dụng bộ phân tích cục bộ.',
      });
    }

    const systemInstruction = `Bạn là trợ lý AI chuyên gia phân tích và trích xuất thông tin báo giá KOL (Key Opinion Leader / Influencer) tại Việt Nam từ tin nhắn trao đổi (Zalo, Messenger, Telegram, Email) hoặc ảnh chụp màn hình báo giá.

NHIỆM VỤ:
Trích xuất mọi thông tin báo giá được nhắc đến trong nội dung và trả về dạng JSON Array.

QUY TẮC PHÂN LOẠI FORMAT:
- 'post': Bài đăng ảnh, status bài viết trên Facebook, Instagram, Fanpage.
- 'video': Video dài (YouTube video, Facebook Watch, clip review chuyên sâu).
- 'shorts': Video ngắn (TikTok clip, YouTube Shorts, Facebook/Instagram Reels dưới 60s).
- 'livestream': Buổi phát trực tiếp bán hàng hoặc giao lưu (1h-2h).
- 'thamDuSuKien': Tham dự sự kiện, event khai trương, workshop, họp báo ra mắt.
- 'sdha': Sử dụng hình ảnh (quyền SDHA, quảng cáo Whitelist/Spark Ads, banner 1-3 tháng).
- Nếu không xác định rõ hoặc chỉ nói chung chung thì để 'null'.

QUY TẮC ĐỔI GIÁ TIỀN (VND):
- Đổi mọi cách viết về số nguyên VND:
  + "8tr" / "8 triệu" / "8 củ" -> 8000000
  + "15.000.000" / "15.000.000đ" / "15tr5" -> 15000000 hoặc 15500000
  + "500k" / "500 ngàn" -> 500000
  + "25 triệu rưỡi" -> 25500000

TRÍCH DẪN (trichDan):
Ghi lại chính xác đoạn văn ngắn trong nội dung gốc chứa mức giá này.`;

    const contents: any[] = [];

    // Nếu có ảnh chụp màn hình báo giá
    if (imageBase64) {
      const mime = imageMimeType || 'image/png';
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      contents.push({
        inlineData: {
          mimeType: mime,
          data: cleanBase64,
        },
      });
    }

    // Nếu có văn bản
    const textPrompt = `Hãy đọc kỹ nội dung sau và trích xuất danh sách tất cả các báo giá của KOL:
${text ? `\n--- NỘI DUNG VĂN BẢN ---\n${text}\n----------------------` : '(Nội dung trong ảnh đính kèm)'}

Hãy trích xuất danh sách các mục báo giá theo cấu trúc JSON.`;

    contents.push({ text: textPrompt });

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              tenKOL: {
                type: Type.STRING,
                description: 'Tên KOL hoặc nghệ danh được báo giá',
              },
              format: {
                type: Type.STRING,
                description: 'Format bài đăng: post, video, shorts, livestream, thamDuSuKien, sdha hoặc null',
              },
              giaVND: {
                type: Type.NUMBER,
                description: 'Giá tiền quy đổi sang VND dạng số nguyên',
              },
              trichDan: {
                type: Type.STRING,
                description: 'Đoạn văn bản gốc thể hiện mức giá này',
              },
            },
            required: ['tenKOL', 'giaVND', 'trichDan'],
          },
        },
      },
    });

    const outputText = response.text || '[]';
    let parsedData = [];
    try {
      parsedData = JSON.parse(outputText);
    } catch {
      // Dự phòng nếu có markdown json tag
      const cleanJson = outputText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
    }

    // Chuẩn hóa định dạng format
    const validFormats = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];
    const sanitized = (Array.isArray(parsedData) ? parsedData : []).map((item: any) => ({
      tenKOL: String(item.tenKOL || 'KOL').trim(),
      format: validFormats.includes(item.format) ? item.format : null,
      giaVND: Number(item.giaVND) || 0,
      trichDan: String(item.trichDan || '').trim(),
    }));

    return res.json({
      success: true,
      data: sanitized,
    });
  } catch (err: any) {
    console.error('Lỗi khi gọi Gemini API:', err);
    return res.json({
      success: false,
      useFallback: true,
      error: `Gemini API tạm thời bận hoặc lỗi: ${err.message || 'Chuyển sang bộ phân tích tự động'}`
    });
  }
});

// ----------------------------------------------------------------------------
// API: Proxy tải dữ liệu Google Sheet CSV (Tránh bị chặn CORS ở Browser)
// ----------------------------------------------------------------------------
app.get('/api/sheets/fetch-csv', async (req, res) => {
  try {
    const sheetId = req.query.sheetId as string;
    const directUrl = req.query.url as string;

    let targetUrl = '';
    if (sheetId) {
      targetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv`;
    } else if (directUrl) {
      targetUrl = directUrl;
    } else {
      return res.status(400).json({ error: 'Thiếu sheetId hoặc url' });
    }

    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).json({
        error: `Không thể tải Google Sheet (Mã lỗi ${response.status}). Hãy đảm bảo bảng tính đã bật quyền 'Bất kỳ ai có đường liên kết đều có thể xem' (Anyone with the link can view).`,
      });
    }

    const csvText = await response.text();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.send(csvText);
  } catch (err: any) {
    return res.status(500).json({
      error: `Lỗi kết nối Google Sheet: ${err.message}`,
    });
  }
});

// ----------------------------------------------------------------------------
// API: Phân tích cấu trúc bảng & phân loại cột bằng AI (Feature 2.3)
// ----------------------------------------------------------------------------
app.post('/api/import/classify-columns', async (req, res) => {
  try {
    const { rows, fields } = req.body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Vui lòng cung cấp mảng dữ liệu các dòng đầu của bảng tính.',
      });
    }

    if (!aiClient) {
      return res.json({
        success: false,
        useFallback: true,
        message: 'Chưa cấu hình GEMINI_API_KEY trên server. Chuyển sang nhận diện cục bộ.',
      });
    }

    const systemInstruction = `Bạn là chuyên gia AI phân tích cấu trúc bảng tính Excel / Google Sheet để nhập danh bạ KOL / Influencer tại Việt Nam.

NHIỆM VỤ CỦA BẠN:
Nhận dữ liệu thô tối đa 12 dòng đầu tiên của bảng tính (có thể chứa các dòng tiêu đề trang trí/báo cáo phía trên):
1. Xác định DÒNG TIÊU ĐỀ THẬT (headerRowIndex, chỉ số 0-based trong mảng rows):
   - Bỏ qua các dòng tiêu đề trang trí, tên chiến dịch, tổng số lượng/tổng chi phí phía trên (ví dụ: "DANH SÁCH KOL/KOC CHIẾN DỊCH HÈ 2026", "Tổng số: 50 KOL", dòng ngày tháng...).
   - Dòng tiêu đề thật là dòng chứa tên các cột dữ liệu chính (ví dụ: "STT", "Họ và tên", "KOL", "Kênh", "Link", "Follower", "Báo giá Video", "Số điện thoại", "YOUTUBE"...).
   - Nếu bảng bắt đầu ngay bằng dòng tiêu đề các cột thì headerRowIndex = 0.

2. Với MỖI CỘT dữ liệu (căn cứ vào tên cột tại dòng tiêu đề + các dòng dữ liệu mẫu bên dưới):
   Phân loại thành một trong các giá trị sau:
   - Một 'key' phù hợp từ danh sách fields được gửi (ví dụ: 'ten', 'linhVuc', 'engagementRate', 'giaVideo', 'giaShorts', 'soDienThoai', 'emailZalo', 'tenNguoiLienHe'...).
   - HOẶC 'platform:YouTube', 'platform:TikTok', 'platform:Facebook', 'platform:Instagram': nếu cột đó chứa thông tin kênh của nền tảng đó — có thể là link URL, hoặc định dạng gộp "Tên kênh | Số follow" (ví dụ: "Khánh Vy OFFICIAL | 2.21M", "Schanel | 3.5M"), hoặc tên handle.
   - HOẶC 'ignore': nếu cột không liên quan đến hồ sơ KOL (ví dụ: cột STT, ngày nhập, mã code nội bộ, cột rỗng).
   - Mỗi cột bao gồm:
     + columnIndex: số thứ tự cột (0-based)
     + field: key trường hoặc platform:X hoặc ignore
     + confidence: 'cao', 'trung bình', hoặc 'thấp'
     + lyDo: giải thích ngắn gọn bằng tiếng Việt DỰA TRÊN NỘI DUNG Ô (ví dụ: "chứa URL tiktok.com", "các ô có dạng 'Tên kênh | 2.21M'", "chứa số tiền báo giá từ 8tr-25tr", "chứa số điện thoại di động").`;

    const prompt = `DANH SÁCH TRƯỜNG THÔNG TIN HỢP LỆ (fields):
${JSON.stringify(fields || [], null, 2)}

DỮ LIỆU CÁC DÒNG ĐẦU TIÊN CỦA BẢNG TÍNH:
${JSON.stringify(rows, null, 2)}

Hãy tìm headerRowIndex và phân loại từng cột theo đúng định dạng JSON được yêu cầu.`;

    const response = await aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [prompt],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headerRowIndex: {
              type: Type.INTEGER,
              description: 'Chỉ số 0-based của dòng tiêu đề thật',
            },
            columns: {
              type: Type.ARRAY,
              description: 'Danh sách phân loại từng cột dữ liệu',
              items: {
                type: Type.OBJECT,
                properties: {
                  columnIndex: {
                    type: Type.INTEGER,
                    description: 'Chỉ số cột (0-based)',
                  },
                  field: {
                    type: Type.STRING,
                    description:
                      'Key của trường tương ứng trong fields, hoặc platform:YouTube / platform:TikTok / platform:Facebook / platform:Instagram, hoặc ignore',
                  },
                  confidence: {
                    type: Type.STRING,
                    description: 'Độ tin cậy: cao, trung bình, hoặc thấp',
                  },
                  lyDo: {
                    type: Type.STRING,
                    description: 'Giải thích ngắn gọn bằng tiếng Việt dựa trên nội dung ô',
                  },
                },
                required: ['columnIndex', 'field', 'confidence', 'lyDo'],
              },
            },
          },
          required: ['headerRowIndex', 'columns'],
        },
      },
    });

    const outputText = response.text || '{}';
    let parsedData: any = {};
    try {
      parsedData = JSON.parse(outputText);
    } catch {
      const cleanJson = outputText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
    }

    if (typeof parsedData.headerRowIndex !== 'number' || !Array.isArray(parsedData.columns)) {
      throw new Error('Dữ liệu AI trả về không đúng cấu trúc');
    }

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (err: any) {
    console.error('Lỗi khi gọi AI phân loại cấu trúc bảng:', err);
    return res.json({
      success: false,
      useFallback: true,
      error: err.message || 'Lỗi khi gọi AI phân loại cột',
    });
  }
});

// ----------------------------------------------------------------------------
// Mount Vite Middleware cho Dev hoặc Static Files cho Production
// ----------------------------------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server KOL Booking Manager đang chạy tại http://0.0.0.0:${PORT}`);
  });
}

startServer();
