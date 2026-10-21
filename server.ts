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

// Chỉ nhận diện mã/trạng thái có cấu trúc, không suy đoán từ câu lỗi.
export function isTemporaryAiError(error: unknown): boolean {
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth = 0): boolean => {
    if (depth > 6 || value == null || seen.has(value)) return false;
    seen.add(value);
    if (typeof value === 'string') {
      try { return visit(JSON.parse(value), depth + 1); } catch { return false; }
    }
    if (typeof value !== 'object') return false;
    const e = value as Record<string, unknown>;
    const codes = [e.code, e.status, e.statusCode];
    // Không thử lại lỗi xác thực/đầu vào, kể cả khi message lồng thông tin khác.
    if (codes.some(c => [400, 401, 403, 404].includes(Number(c)))) return false;
    return codes.some(c => [429, 503].includes(Number(c)) || c === 'UNAVAILABLE' || c === 'RESOURCE_EXHAUSTED')
      || [e.error, e.message, e.cause, e.response].some(v => visit(v, depth + 1));
  };
  return visit(error);
}

export async function callAiWithRetry<T>(
  call: () => Promise<T>,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await call(); }
    catch (error) {
      if (attempt >= 2 || !isTemporaryAiError(error)) throw error;
      await wait([1000, 2500][attempt]);
    }
  }
}

export function aiFailureMessage(error: unknown): string {
  return isTemporaryAiError(error)
    ? 'AI đang quá tải, vui lòng thử lại sau ít phút.'
    : 'Không thể xử lý bằng AI lúc này. Vui lòng thử lại sau hoặc nhập thông tin thủ công.';
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
        message: 'Vui lòng cung cấp đoạn văn bản tin nhắn hoặc ảnh chụp báo giá.',
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

    const response = await callAiWithRetry(() => aiClient!.models.generateContent({
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
    }));

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
    console.warn('Yêu cầu AI thất bại', { tamThoi: isTemporaryAiError(err) });
    return res.json({
      success: false,
      useFallback: true,
      message: aiFailureMessage(err)
    });
  }
});

// ----------------------------------------------------------------------------
// API: Phân tích mô tả / brief chiến dịch bằng AI (Feature: Parse Brief SOW)
// ----------------------------------------------------------------------------
app.post('/api/ai/parse-brief', async (req, res) => {
  try {
    const { moTa } = req.body;

    if (!moTa || typeof moTa !== 'string' || !moTa.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp nội dung mô tả hoặc brief chiến dịch.',
      });
    }

    if (!aiClient) {
      return res.json({
        success: false,
        useFallback: true,
        message: 'Chưa cấu hình GEMINI_API_KEY trên server. Vui lòng nhập thông tin thủ công.',
      });
    }

    const systemInstruction = `Bạn là chuyên gia Media Planner và Campaign Manager tại Việt Nam, chuyên phân tích brief quảng cáo/booking KOL và chuyển thành yêu cầu SOW (Scope of Work).

NHIỆM VỤ:
Đọc kỹ đoạn mô tả brief của khách hàng và trích xuất các thông số chiến dịch thành JSON đúng cấu trúc yêu cầu.

QUY TẮC CỰC KỲ QUAN TRỌNG:
1. CHỈ trích xuất thông tin brief NÓI RÕ hoặc có căn cứ trực tiếp; nếu không có thì để null hoặc mảng rỗng [] — TUYỆT ĐỐI KHÔNG TỰ BỊA SỐ HOẶC ĐOÁN MÒ THÔNG SỐ KHÔNG CÓ TRONG BRIEF.
2. Quy đổi số tiền viết kiểu Việt thành số nguyên VND đầy đủ:
   - "250tr", "250 triệu", "250 củ" -> 250000000
   - "1,2 tỷ", "1.2 tỉ" -> 1200000000
   - "30tr/KOL", "30 triệu / creator" -> 30000000
   - "500k", "500 ngàn" -> 500000
3. PHÂN BIỆT RÕ CÁC LOẠI NGÂN SÁCH:
   - "ngân sách tổng/toàn chiến dịch", "tổng budget", "ngân sách dự kiến cả dự án" -> nganSachTong (number | null)
   - "tối đa mỗi KOL", "mỗi creator tối đa", "budget cho 1 bạn", "ngân sách từng người" -> nganSachMoiKol (number | null)
   - Không tự nhân ngân sách mỗi KOL với số KOL để điền nganSachTong; không tự chia tổng để điền nganSachMoiKol. Trường không được nêu phải là null.
4. PHÂN BIỆT RÕ HẠNG MỤC (DELIVERABLES):
   - Cụm "mỗi KOL làm X", "mỗi bạn sản xuất X", "KPI mỗi người là X" -> hangMucMoiKol (mảng các object { format, soLuong })
   - Số lượng tính gộp cho CẢ campaign (ví dụ "cần tổng 5 video review", "tổng sản lượng 10 clip ngắn") -> hangMucTongCampaign (mảng các object { format, soLuong })
5. Ánh xạ các hạng mục công việc về đúng 6 format key chuẩn:
   - 'video': Video dài (YouTube video, video dài Facebook, clip review chi tiết trên 3 phút)
   - 'shorts': Clip ngắn (TikTok clip, YouTube Shorts, Facebook/Instagram Reels dưới 60s)
   - 'post': Bài đăng ảnh / status bài viết Facebook, Instagram, Fanpage
   - 'livestream': Buổi phát sóng trực tiếp (livestream bán hàng, livestream sự kiện)
   - 'thamDuSuKien': Tham dự / có mặt tại sự kiện, khai trương, workshop, họp báo
   - 'sdha': Sử dụng hình ảnh (quyền SDHA, quảng cáo Spark Ads, Whitelist, banner)
6. Nền tảng (nenTang): Chỉ nhận một trong các giá trị: "TikTok", "YouTube", "Facebook", "Instagram", hoặc null nếu không nói rõ hoặc đa nền tảng.
7. Lĩnh vực (linhVuc): Tên lĩnh vực chính của brief (ví dụ: "Ẩm thực", "Làm đẹp", "Công nghệ", "Thời trang", "Du lịch", "Mẹ & bé", "Giải trí", "Tài chính", "Sức khỏe & Gym", "Giáo dục", "Lifestyle", "Gaming"), hoặc null.
8. Số lượng KOL (soLuongKol): Số nguyên (ví dụ: 3, 5, 10), hoặc null.
9. Tương tác (engagementToiThieu): Tỷ lệ % tối thiểu (ví dụ 4.5), hoặc null.
10. Follower tối thiểu (followerToiThieu): Số người theo dõi tối thiểu dạng số nguyên (ví dụ 100000), hoặc null.`;

    const prompt = `HÃY PHÂN TÍCH BRIEF CHIẾN DỊCH SAU ĐÂY:\n"""\n${moTa.trim()}\n"""\n\nTrả về kết quả dưới định dạng JSON đúng schema.`;

    const response = await callAiWithRetry(() => aiClient!.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [prompt],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tenChienDich: {
              type: Type.STRING,
              description: 'Tên chiến dịch hoặc thương hiệu/sản phẩm (hoặc null nếu không có)',
            },
            linhVuc: {
              type: Type.STRING,
              description: 'Lĩnh vực phù hợp nhất (hoặc null)',
            },
            nenTang: {
              type: Type.STRING,
              description: 'TikTok, YouTube, Facebook, Instagram hoặc null',
            },
            soLuongKol: {
              type: Type.INTEGER,
              description: 'Số lượng KOL cần tìm (hoặc null)',
            },
            mucTieu: {
              type: Type.STRING,
              description: 'Mục tiêu chiến dịch (hoặc null)',
            },
            nganSachTong: {
              type: Type.NUMBER,
              description: 'Ngân sách tổng toàn bộ chiến dịch tính bằng VND (hoặc null)',
            },
            nganSachMoiKol: {
              type: Type.NUMBER,
              description: 'Ngân sách tối đa cho mỗi KOL tính bằng VND (hoặc null)',
            },
            engagementToiThieu: {
              type: Type.NUMBER,
              description: 'Tỷ lệ tương tác tối thiểu (%) hoặc null',
            },
            followerToiThieu: {
              type: Type.NUMBER,
              description: 'Lượng follower tối thiểu của KOL (hoặc null)',
            },
            hangMucMoiKol: {
              type: Type.ARRAY,
              description: 'Danh sách các hạng mục mỗi KOL làm (nếu brief nói rõ mỗi KOL làm gì)',
              items: {
                type: Type.OBJECT,
                properties: {
                  format: {
                    type: Type.STRING,
                    description: 'post, video, shorts, livestream, thamDuSuKien, sdha',
                  },
                  soLuong: {
                    type: Type.INTEGER,
                    description: 'Số lượng cho format này',
                  },
                },
                required: ['format', 'soLuong'],
              },
            },
            hangMucTongCampaign: {
              type: Type.ARRAY,
              description: 'Danh sách các hạng mục tính cho toàn bộ chiến dịch',
              items: {
                type: Type.OBJECT,
                properties: {
                  format: {
                    type: Type.STRING,
                    description: 'post, video, shorts, livestream, thamDuSuKien, sdha',
                  },
                  soLuong: {
                    type: Type.INTEGER,
                    description: 'Số lượng cho format này',
                  },
                },
                required: ['format', 'soLuong'],
              },
            },
          },
        },
      },
    }));

    const outputText = response.text || '{}';
    let parsedData: any = {};
    try {
      parsedData = JSON.parse(outputText);
    } catch {
      const cleanJson = outputText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleanJson);
    }

    const validFormats = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];
    const validPlatforms = ['TikTok', 'YouTube', 'Facebook', 'Instagram'];

    // Sanitization
    const sanitizeHangMuc = (arr: any) => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((item: any) => item && validFormats.includes(item.format) && Number(item.soLuong) > 0)
        .map((item: any) => ({
          format: item.format,
          soLuong: Math.max(1, Math.round(Number(item.soLuong))),
        }));
    };

    const sanitizedResult = {
      tenChienDich: parsedData.tenChienDich ? String(parsedData.tenChienDich).trim() : null,
      linhVuc: parsedData.linhVuc ? String(parsedData.linhVuc).trim() : null,
      nenTang: validPlatforms.includes(parsedData.nenTang) ? parsedData.nenTang : null,
      soLuongKol: parsedData.soLuongKol && Number(parsedData.soLuongKol) > 0 ? Math.round(Number(parsedData.soLuongKol)) : null,
      mucTieu: parsedData.mucTieu ? String(parsedData.mucTieu).trim() : null,
      nganSachTong: parsedData.nganSachTong && Number(parsedData.nganSachTong) > 0 ? Number(parsedData.nganSachTong) : null,
      nganSachMoiKol: parsedData.nganSachMoiKol && Number(parsedData.nganSachMoiKol) > 0 ? Number(parsedData.nganSachMoiKol) : null,
      engagementToiThieu: parsedData.engagementToiThieu && Number(parsedData.engagementToiThieu) > 0 ? Number(parsedData.engagementToiThieu) : null,
      followerToiThieu: parsedData.followerToiThieu && Number(parsedData.followerToiThieu) > 0 ? Number(parsedData.followerToiThieu) : null,
      hangMucMoiKol: sanitizeHangMuc(parsedData.hangMucMoiKol),
      hangMucTongCampaign: sanitizeHangMuc(parsedData.hangMucTongCampaign),
    };

    // Các hạng mục nêu rõ theo tổng campaign phải được giữ đúng tổng.
    const explicitTasks = [...moTa.matchAll(/(\d+)\s*(video\s+review|clip\s+ngắn|video\s+ngắn)/giu)].map(m => ({
      format: /ngắn/iu.test(m[2]) ? 'shorts' : 'video', soLuong: Number(m[1]),
    }));
    if (explicitTasks.length && /tổng\s*(?:cộng)?/iu.test(moTa) && !/mỗi\s*(?:KOL|người|bạn)\s*làm/iu.test(moTa)) {
      sanitizedResult.hangMucTongCampaign = explicitTasks;
      sanitizedResult.hangMucMoiKol = [];
    }
    const explicitCategory = moTa.match(/(?:mảng|lĩnh vực)\s*(ẩm thực|làm đẹp|công nghệ|thời trang|du lịch|giáo dục|giải trí)/iu);
    if (explicitCategory) {
      const category = explicitCategory[1].toLocaleLowerCase('vi-VN');
      sanitizedResult.linhVuc = category[0].toLocaleUpperCase('vi-VN') + category.slice(1);
    }

    // Đối chiếu các số được ghi rõ trong brief, không tự suy ra ngân sách.
    const explicitCount = moTa.match(/(?:chọn|cần|tìm)\s*(\d+)\s*KOL/iu);
    if (explicitCount) sanitizedResult.soLuongKol = Number(explicitCount[1]);
    const budgetAmount = (match: RegExpMatchArray | null) => match
      ? Math.round(Number(match[1].replace(',', '.')) * (/tỷ|tỉ/iu.test(match[2]) ? 1_000_000_000 : 1_000_000)) : null;
    const totalBudget = moTa.match(/ngân sách\s+(?:(?:tổng|toàn|cả)\s+(?:chiến dịch|campaign)?)[^\d.;:]{0,30}(\d+(?:[.,]\d+)?)\s*(triệu|tr|tỷ|tỉ)/iu);
    const perBudget = moTa.match(/ngân sách[^\d.;:]{0,30}(\d+(?:[.,]\d+)?)\s*(triệu|tr|tỷ|tỉ)\s*(?:mỗi|\/)\s*KOL/iu);
    if (totalBudget) sanitizedResult.nganSachTong = budgetAmount(totalBudget);
    else if (perBudget) sanitizedResult.nganSachTong = null;
    if (perBudget) sanitizedResult.nganSachMoiKol = budgetAmount(perBudget);
    else if (totalBudget) sanitizedResult.nganSachMoiKol = null;

    return res.json({
      success: true,
      data: sanitizedResult,
    });
  } catch (err: any) {
    console.warn('Yêu cầu AI thất bại', { tamThoi: isTemporaryAiError(err) });
    return res.json({
      success: false,
      useFallback: true,
      message: aiFailureMessage(err),
    });
  }
});

// ----------------------------------------------------------------------------
// API: Proxy tải dữ liệu Google Sheet CSV (Chỉ chấp nhận Google Sheet hợp lệ)
// ----------------------------------------------------------------------------
app.get('/api/sheets/fetch-csv', async (req, res) => {
  try {
    const rawSheetId = req.query.sheetId as string | undefined;
    const directUrl = req.query.url as string | undefined;

    let targetSheetId: string | null = null;

    if (rawSheetId && typeof rawSheetId === 'string' && rawSheetId.trim()) {
      const trimmed = rawSheetId.trim();
      // Google Sheet ID thường có từ 10 đến 120 ký tự gồm chữ, số, gạch ngang, gạch dưới
      if (/^[a-zA-Z0-9-_]{10,120}$/.test(trimmed)) {
        targetSheetId = trimmed;
      } else {
        return res.status(400).json({
          error: 'Mã Google Sheet (sheetId) không đúng định dạng hợp lệ.',
        });
      }
    } else if (directUrl && typeof directUrl === 'string' && directUrl.trim()) {
      try {
        const parsed = new URL(directUrl.trim());
        // URL phải có giao thức https và tên miền chính xác docs.google.com
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'docs.google.com') {
          return res.status(400).json({
            error: 'URL không hợp lệ. Chỉ chấp nhận đường liên kết Google Sheet từ https://docs.google.com.',
          });
        }
        // Đường dẫn phải có dạng /spreadsheets/d/{id}
        const match = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{10,120})/);
        if (!match || !match[1]) {
          return res.status(400).json({
            error: 'Đường dẫn URL không đúng định dạng bảng tính Google Sheet (/spreadsheets/d/{id}).',
          });
        }
        targetSheetId = match[1];
      } catch {
        return res.status(400).json({
          error: 'URL Google Sheet không hợp lệ hoặc sai định dạng.',
        });
      }
    } else {
      return res.status(400).json({
        error: 'Thiếu tham số sheetId hoặc URL Google Sheet hợp lệ.',
      });
    }

    if (!targetSheetId) {
      return res.status(400).json({
        error: 'Không thể xác định mã Google Sheet từ dữ liệu cung cấp.',
      });
    }

    // Tự dựng link export của Google Sheet, TUYỆT ĐỐI không tải URL gốc
    const targetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(targetSheetId)}/export?format=csv`;

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
        message: 'Vui lòng cung cấp mảng dữ liệu các dòng đầu của bảng tính.',
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

    const response = await callAiWithRetry(() => aiClient!.models.generateContent({
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
    }));

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
    console.warn('Yêu cầu AI thất bại', { tamThoi: isTemporaryAiError(err) });
    return res.json({
      success: false,
      useFallback: true,
      message: aiFailureMessage(err),
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
