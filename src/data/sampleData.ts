/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KolProfile } from '../types/kol';

export const INITIAL_SAMPLE_KOLS: KolProfile[] = [
  // 1. Nguyễn Hoàng Long (Long Chun) - Ẩm thực, Giải trí
  {
    id: 'kol-sample-1',
    ten: 'Nguyễn Hoàng Long (Long Chun)',
    anhDaiDien: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-1-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@longchun94',
        soFollower: 3200000,
      },
      {
        id: 'soc-1-2',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/longchun.official',
        soFollower: 850000,
      },
      {
        id: 'soc-1-3',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@LongChunOfficial',
        soFollower: 450000,
      },
    ],
    engagementRate: 6.8,
    linhVuc: ['Ẩm thực', 'Giải trí', 'Lifestyle'],
    reviewSoBo: 'Content hài hước, duyên dáng, gần gũi với giới trẻ Gen Z và dân văn phòng. Tương tác comment cực tốt, độ phủ sóng viral cao. Rất hợp các chiến dịch F&B, chuỗi nhà hàng, FMCG.',
    bangGia: {
      post: 12000000,
      video: 28000000,
      shorts: 18000000,
      livestream: 25000000,
      thamDuSuKien: 20000000,
      sdha: 15000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Chị Mai (Quản lý trực tiếp)',
      soDienThoai: '0912 345 678',
      emailZalo: 'booking.longchun@agency.vn (Zalo: 0912345678)',
      ghiChu: 'Cần gửi brief trước 5 ngày làm việc. Không nhận các sản phẩm tài chính hoặc game cá cược.',
    },
    lichSuHopTac: [
      {
        id: 'collab-1-1',
        tenChienDich: 'ShopeeFood Siêu Tiệc 11.11',
        thoiGian: '2025-11-10',
        formatDaLam: 'Video ngắn TikTok + Story Facebook',
        chiPhiThucTe: 20000000,
        ketQuaLink: 'https://tiktok.com/@longchun94/video/1',
        danhGia: 5,
        nhanXet: 'Đạt 1.4M views, vượt KPI cam kết 180%, lượng click link bio rất cao.',
      },
      {
        id: 'collab-1-2',
        tenChienDich: 'Khai trương Nhà Hàng Lẩu Haidilao Landmark',
        thoiGian: '2025-08-15',
        formatDaLam: 'Tham dự sự kiện + Video review dài',
        chiPhiThucTe: 45000000,
        ketQuaLink: 'https://youtube.com/watch?v=sample1',
        danhGia: 5,
        nhanXet: 'Đúng giờ, phối hợp nhiệt tình cùng ekip, video dựng hài hước, khách đến quán tăng đột biến.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'KOL top-tier về độ chuyển đổi đơn F&B và tạo hiệu ứng truyền thông tự nhiên.',
    },
    isSample: true,
    ngayTao: '2026-01-10T08:00:00.000Z',
    ngayCapNhat: '2026-02-14T09:30:00.000Z',
  },

  // 2. Trần Mai Anh (Mai Anh Skincare) - Làm đẹp, Thời trang
  {
    id: 'kol-sample-2',
    ten: 'Trần Mai Anh (Mai Anh Skincare)',
    anhDaiDien: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-2-1',
        tenNenTang: 'Instagram',
        linkProfile: 'https://instagram.com/maianh.skin',
        soFollower: 420000,
      },
      {
        id: 'soc-2-2',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@maianhskincare',
        soFollower: 890000,
      },
      {
        id: 'soc-2-3',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/maianh.beautyblog',
        soFollower: 210000,
      },
    ],
    engagementRate: 5.4,
    linhVuc: ['Làm đẹp', 'Thời trang', 'Mẹ & bé'],
    reviewSoBo: 'Chuyên gia review mỹ phẩm thành phần khoa học, hình ảnh chỉn chu sang trọng, tệp người theo dõi là nữ giới từ 20-35 tuổi có thu nhập khá và thói quen chăm sóc da kỹ lưỡng.',
    bangGia: {
      post: 9000000,
      video: 22000000,
      shorts: 14000000,
      livestream: 18000000,
      thamDuSuKien: 15000000,
      sdha: 12000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Mai Anh (KOL trực tiếp)',
      soDienThoai: '0988 776 554',
      emailZalo: 'maianh.work@gmail.com',
      ghiChu: 'Yêu cầu gửi mẫu sản phẩm test trước tối thiểu 7 ngày để đảm bảo an toàn cho da.',
    },
    lichSuHopTac: [
      {
        id: 'collab-2-1',
        tenChienDich: 'Ra mắt Serum Vitamin C L\'Oreal Paris',
        thoiGian: '2025-10-05',
        formatDaLam: 'Reels Instagram + Video TikTok 60s',
        chiPhiThucTe: 23000000,
        ketQuaLink: 'https://instagram.com/p/sample2',
        danhGia: 5,
        nhanXet: 'Hình ảnh góc quay chuẩn studio, giải thích thành phần rõ ràng, bán hết sạch 500 combo quà tặng.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Tín nhiệm cao trong cộng đồng làm đẹp, bài viết có chiều sâu chuyên môn.',
    },
    isSample: true,
    ngayTao: '2026-01-12T10:00:00.000Z',
    ngayCapNhat: '2026-02-18T14:20:00.000Z',
  },

  // 3. Lê Quốc Bảo (Bảo Tech Review) - Công nghệ, Gaming
  {
    id: 'kol-sample-3',
    ten: 'Lê Quốc Bảo (Bảo Tech Review)',
    anhDaiDien: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-3-1',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@baotechvn',
        soFollower: 1100000,
      },
      {
        id: 'soc-3-2',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@baotech_review',
        soFollower: 650000,
      },
      {
        id: 'soc-3-3',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/baotechreview.page',
        soFollower: 300000,
      },
    ],
    engagementRate: 4.2,
    linhVuc: ['Công nghệ', 'Gaming', 'Giải trí'],
    reviewSoBo: 'Chuyên đánh giá smartphone, laptop, phụ kiện công nghệ, setup góc làm việc. Giọng nói truyền cảm, am hiểu kỹ thuật sâu, dựng phim hiện đại sắc nét.',
    bangGia: {
      post: 10000000,
      video: 32000000,
      shorts: 16000000,
      livestream: 20000000,
      thamDuSuKien: 18000000,
      sdha: 20000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Anh Tuấn (Trợ lý booking)',
      soDienThoai: '0903 112 233',
      emailZalo: 'tuan.booking@baotech.com (Zalo: 0903112233)',
      ghiChu: 'Cung cấp sản phẩm thử nghiệm kèm máy đối chứng để so sánh khách quan.',
    },
    lichSuHopTac: [
      {
        id: 'collab-3-1',
        tenChienDich: 'Đánh giá Laptop Gaming ASUS ROG Zephyrus',
        thoiGian: '2025-09-20',
        formatDaLam: 'Video YouTube 12 phút + Shorts test game',
        chiPhiThucTe: 35000000,
        ketQuaLink: 'https://youtube.com/watch?v=sample3',
        danhGia: 4,
        nhanXet: 'Nội dung kỹ thuật rất sâu, cộng đồng công nghệ bàn luận sôi nổi, chốt được nhiều đơn pre-order.',
      },
    ],
    danhGiaHieuQua: {
      diem: 4,
      nhanXet: 'Uy tín cao với đối tượng nam giới mê đồ công nghệ, trung thực và chi tiết.',
    },
    isSample: true,
    ngayTao: '2026-01-15T09:15:00.000Z',
    ngayCapNhat: '2026-02-20T11:00:00.000Z',
  },

  // 4. Hoàng Thu Thảo (Thảo Đi Đâu) - Du lịch, Lifestyle
  {
    id: 'kol-sample-4',
    ten: 'Hoàng Thu Thảo (Thảo Đi Đâu)',
    anhDaiDien: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-4-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@thaodidau_travel',
        soFollower: 1400000,
      },
      {
        id: 'soc-4-2',
        tenNenTang: 'Instagram',
        linkProfile: 'https://instagram.com/thaodidau',
        soFollower: 680000,
      },
      {
        id: 'soc-4-3',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@thaodidautravel',
        soFollower: 320000,
      },
    ],
    engagementRate: 5.9,
    linhVuc: ['Du lịch', 'Lifestyle', 'Ẩm thực'],
    reviewSoBo: 'Chuyên về du lịch trải nghiệm, khám phá các điểm đến mới lạ và ẩm thực địa phương. Phong cách nhẹ nhàng, màu sắc phim thơ mộng, đối tượng là người thích du lịch nghỉ dưỡng và phượt trẻ.',
    bangGia: {
      post: 11000000,
      video: 26000000,
      shorts: 15000000,
      livestream: 19000000,
      thamDuSuKien: 17000000,
      sdha: 14000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Thu Thảo',
      soDienThoai: '0979 555 444',
      emailZalo: 'thaodidau.collab@gmail.com',
      ghiChu: 'Chi phí chưa bao gồm vé máy bay và khách sạn khi quay ngoại tỉnh.',
    },
    lichSuHopTac: [
      {
        id: 'collab-4-1',
        tenChienDich: 'Khám phá Mùa Thu Tây Bắc cùng Traveloka',
        thoiGian: '2025-10-18',
        formatDaLam: 'Series 3 TikTok + 1 Post Album Instagram',
        chiPhiThucTe: 45000000,
        ketQuaLink: 'https://tiktok.com/@thaodidau_travel/video/1',
        danhGia: 5,
        nhanXet: 'Hình ảnh tuyệt đẹp, viral tab Thịnh hành TikTok 3 ngày liền, voucher đặt phòng hết sạch.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Visual ấn tượng, phù hợp quảng bá khu nghỉ dưỡng cao cấp, vé máy bay và ứng dụng du lịch.',
    },
    isSample: true,
    ngayTao: '2026-01-20T14:00:00.000Z',
    ngayCapNhat: '2026-02-25T16:45:00.000Z',
  },

  // 5. Đặng Minh Quân (Quân Fitness Coach) - Sức khỏe & Gym
  {
    id: 'kol-sample-5',
    ten: 'Đặng Minh Quân (Quân Fitness Coach)',
    anhDaiDien: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-5-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@quanfitness_coach',
        soFollower: 540000,
      },
      {
        id: 'soc-5-2',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/quanfitcoach.vn',
        soFollower: 280000,
      },
      {
        id: 'soc-5-3',
        tenNenTang: 'Instagram',
        linkProfile: 'https://instagram.com/quan.coachfit',
        soFollower: 160000,
      },
    ],
    engagementRate: 7.1,
    linhVuc: ['Sức khỏe & Gym', 'Lifestyle', 'Tài chính'],
    reviewSoBo: 'Huấn luyện viên thể hình cá nhân, chia sẻ thực đơn ăn sạch Eat Clean, bài tập tăng cơ giảm mỡ và phong cách sống kỷ luật. Tỷ lệ tương tác rất cao, cộng đồng theo dõi trung thành và chịu chi cho thực phẩm bổ sung, đồ thể thao.',
    bangGia: {
      post: 7500000,
      video: 18000000,
      shorts: 11000000,
      livestream: 14000000,
      thamDuSuKien: 12000000,
      sdha: 9000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Minh Quân',
      soDienThoai: '0938 999 888',
      emailZalo: 'quanfit.coach@gmail.com (Zalo: 0938999888)',
      ghiChu: 'Chỉ nhận quảng cáo sản phẩm có giấy phép chứng nhận an toàn thực phẩm của Bộ Y Tế.',
    },
    lichSuHopTac: [
      {
        id: 'collab-5-1',
        tenChienDich: 'Quảng bá Đạm Whey Protein Thực Vật Gymstore',
        thoiGian: '2025-11-25',
        formatDaLam: 'Video hướng dẫn pha sinh tố + 1 bài viết Facebook',
        chiPhiThucTe: 19000000,
        ketQuaLink: 'https://tiktok.com/@quanfitness_coach/video/1',
        danhGia: 5,
        nhanXet: 'Người xem tin tưởng, tỷ lệ chuyển đổi mua hàng cao, hoàn thành đúng hạn cam kết.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Rất chuyên nghiệp, giữ gìn uy tín cá nhân, chuyển đổi đơn hàng thiết thực.',
    },
    isSample: true,
    ngayTao: '2026-02-01T11:20:00.000Z',
    ngayCapNhat: '2026-03-01T08:10:00.000Z',
  },

  // 6. Vũ Thanh Vân (Vân Mẹ Bé) - Mẹ & bé, Gia đình, Ẩm thực
  {
    id: 'kol-sample-6',
    ten: 'Vũ Thanh Vân (Vân Mẹ Bé)',
    anhDaiDien: 'https://images.unsplash.com/photo-1548142813-c348350df52b?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-6-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@vanmebe_family',
        soFollower: 780000,
      },
      {
        id: 'soc-6-2',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/thanhvan.babycare',
        soFollower: 420000,
      },
      {
        id: 'soc-6-3',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@VanMeBeOfficial',
        soFollower: 150000,
      },
    ],
    engagementRate: 4.6,
    linhVuc: ['Mẹ & bé', 'Ẩm thực', 'Lifestyle'],
    reviewSoBo: 'Mẹ bỉm sữa 2 con chia sẻ thực đơn ăn dặm, kinh nghiệm chăm con khoa học và mẹo vặt gia đình. Giọng nói ấm áp, tệp follower là các bà mẹ trẻ từ 22-35 tuổi quan tâm đồ gia dụng, sữa và tã bỉm.',
    bangGia: {
      post: 7000000,
      video: 16000000,
      shorts: 9000000,
      livestream: 14000000,
      thamDuSuKien: 12000000,
      sdha: 8000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Thanh Vân',
      soDienThoai: '0934 112 998',
      emailZalo: 'vanmebe.booking@gmail.com',
      ghiChu: 'Chỉ nhận sản phẩm mẹ và bé có xuất xứ rõ ràng, kiểm định chất lượng.',
    },
    lichSuHopTac: [
      {
        id: 'collab-6-1',
        tenChienDich: 'Ra mắt Nồi Nấu Cháo Chậm Bear Mini',
        thoiGian: '2025-10-12',
        formatDaLam: 'Video TikTok 60s hướng dẫn nấu cháo chim bồ câu',
        chiPhiThucTe: 10000000,
        ketQuaLink: 'https://tiktok.com/@vanmebe_family/video/1',
        danhGia: 5,
        nhanXet: 'Nội dung chân thực, các mẹ hỏi mua nườm nượp, cạn kho 300 chiếc sau 2 ngày.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Độ uy tín rất cao với các mẹ bỉm, tương tác tự nhiên và thiện cảm.',
    },
    isSample: true,
    ngayTao: '2026-02-05T09:00:00.000Z',
    ngayCapNhat: '2026-03-02T10:00:00.000Z',
  },

  // 7. Phan Đình Tùng (Tùng Shark Tài Chính) - Tài chính, Giáo dục (Thiếu giá SDHA để test chưa có giá)
  {
    id: 'kol-sample-7',
    ten: 'Phan Đình Tùng (Tùng Shark Tài Chính)',
    anhDaiDien: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-7-1',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@tungshark_taichinh',
        soFollower: 650000,
      },
      {
        id: 'soc-7-2',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@tungshark.finance',
        soFollower: 420000,
      },
      {
        id: 'soc-7-3',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/phandinhtung.invest',
        soFollower: 280000,
      },
    ],
    engagementRate: 3.2,
    linhVuc: ['Tài chính', 'Giáo dục', 'Công nghệ'],
    reviewSoBo: 'Chuyên gia tư vấn tài chính cá nhân, quản lý dòng tiền, đầu tư chứng khoán và bất động sản an toàn. Tệp khán giả trưởng thành, trí thức, dân kinh doanh có thu nhập cao.',
    bangGia: {
      post: 9000000,
      video: 25000000,
      shorts: 12000000,
      livestream: 18000000,
      thamDuSuKien: 16000000,
      sdha: null, // Cố tình để trống SDHA để test bộ lọc chưa có giá
    },
    lienHe: {
      tenNguoiLienHe: 'Anh Hoàng (Trợ lý pháp lý)',
      soDienThoai: '0908 665 443',
      emailZalo: 'contact@tungshark.vn (Zalo: 0908665443)',
      ghiChu: 'Không nhận các dự án tiền ảo rác, cho vay nặng lãi hoặc sàn nhị phân BO.',
    },
    lichSuHopTac: [
      {
        id: 'collab-7-1',
        tenChienDich: 'Giới thiệu Ứng Dụng Tích Lũy Finhay 2.0',
        thoiGian: '2025-09-14',
        formatDaLam: 'Video YouTube 15 phút phân tích quản lý tài chính',
        chiPhiThucTe: 26000000,
        ketQuaLink: 'https://youtube.com/watch?v=sample7',
        danhGia: 4,
        nhanXet: 'Lập luận chặt chẽ, người xem tải app mở tài khoản rất chất lượng.',
      },
    ],
    danhGiaHieuQua: {
      diem: 4,
      nhanXet: 'Hợp các nhãn hàng ngân hàng, fintech, ứng dụng bảo hiểm và quản lý đầu tư.',
    },
    isSample: true,
    ngayTao: '2026-02-08T14:10:00.000Z',
    ngayCapNhat: '2026-03-03T11:20:00.000Z',
  },

  // 8. Nguyễn Thùy Linh (Linh Chuu Fashion) - Thời trang, Làm đẹp
  {
    id: 'kol-sample-8',
    ten: 'Nguyễn Thùy Linh (Linh Chuu Fashion)',
    anhDaiDien: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-8-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@linhchuu.outfit',
        soFollower: 2100000,
      },
      {
        id: 'soc-8-2',
        tenNenTang: 'Instagram',
        linkProfile: 'https://instagram.com/linhchuu_official',
        soFollower: 950000,
      },
    ],
    engagementRate: 6.2,
    linhVuc: ['Thời trang', 'Làm đẹp', 'Lifestyle'],
    reviewSoBo: 'Fashionista hàng đầu giới trẻ, phong cách phối đồ biến hóa từ street style đến haute couture sang trọng. Thường xuyên tham gia tuần lễ thời trang và hợp tác các local brand đình đám.',
    bangGia: {
      post: 18000000,
      video: 35000000,
      shorts: 22000000,
      livestream: 30000000,
      thamDuSuKien: 25000000,
      sdha: 20000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Trần Vũ (Manager)',
      soDienThoai: '0978 123 999',
      emailZalo: 'linhchuu.mgmt@agency.com',
      ghiChu: 'Cần duyệt trang phục và moodboard chụp trước 1 tuần.',
    },
    lichSuHopTac: [
      {
        id: 'collab-8-1',
        tenChienDich: 'Bộ Sưu Tập Mùa Đông IVY moda',
        thoiGian: '2025-11-01',
        formatDaLam: 'Lookbook Instagram + 2 Video biến hình TikTok',
        chiPhiThucTe: 55000000,
        ketQuaLink: 'https://tiktok.com/@linhchuu.outfit/video/1',
        danhGia: 5,
        nhanXet: 'Visual đỉnh cao, trang phục cháy hàng trên kênh online sau 1 tuần ra mắt.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'KOL số 1 về gu thời trang và kích thích mua sắm hàng hiệu, local brand cao cấp.',
    },
    isSample: true,
    ngayTao: '2026-02-10T10:00:00.000Z',
    ngayCapNhat: '2026-03-04T15:30:00.000Z',
  },

  // 9. Bùi Đức Anh (Thầy Anh IELTS) - Giáo dục, Lifestyle (Thiếu giá Event & SDHA)
  {
    id: 'kol-sample-9',
    ten: 'Bùi Đức Anh (Thầy Anh IELTS)',
    anhDaiDien: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-9-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@thayanhietls',
        soFollower: 1800000,
      },
      {
        id: 'soc-9-2',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/ducanh.ielts85',
        soFollower: 920000,
      },
      {
        id: 'soc-9-3',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@ThayAnhIELTSOfficial',
        soFollower: 480000,
      },
    ],
    engagementRate: 5.1,
    linhVuc: ['Giáo dục', 'Lifestyle'],
    reviewSoBo: 'Giáo viên tiếng Anh 8.5 IELTS với cách dạy hài hước, thực tế, phát âm chuẩn bản xứ. Tệp người theo dõi là học sinh, sinh viên và người đi làm muốn nâng cao trình độ ngoại ngữ.',
    bangGia: {
      post: 8000000,
      video: 20000000,
      shorts: 11000000,
      livestream: 15000000,
      thamDuSuKien: null, // Cố tình để trống thamDuSuKien
      sdha: null, // Cố tình để trống SDHA
    },
    lienHe: {
      tenNguoiLienHe: 'Đức Anh',
      soDienThoai: '0915 222 333',
      emailZalo: 'thayanhietls@gmail.com (Zalo: 0915222333)',
      ghiChu: 'Chỉ nhận quảng bá app học tập, sách ngoại ngữ, khóa học uy tín.',
    },
    lichSuHopTac: [
      {
        id: 'collab-9-1',
        tenChienDich: 'Quảng bá App Học Từ Vựng MochiMochi',
        thoiGian: '2025-08-25',
        formatDaLam: 'Video TikTok 60s hướng dẫn học 50 từ vựng mỗi ngày',
        chiPhiThucTe: 12000000,
        ketQuaLink: 'https://tiktok.com/@thayanhietls/video/1',
        danhGia: 5,
        nhanXet: 'Lượng click mã giảm giá đạt kỷ lục tháng, chuyển đổi người dùng trả phí rất cao.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Hình ảnh tri thức, tích cực, cực kỳ thích hợp cho các thương hiệu EdTech.',
    },
    isSample: true,
    ngayTao: '2026-02-12T08:30:00.000Z',
    ngayCapNhat: '2026-03-05T09:15:00.000Z',
  },

  // 10. Lê Ngọc Trâm (Trâm Anh Bếp Nhà) - Ẩm thực, Mẹ & bé
  {
    id: 'kol-sample-10',
    ten: 'Lê Ngọc Trâm (Trâm Anh Bếp Nhà)',
    anhDaiDien: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-10-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@tramanh_bepnha',
        soFollower: 620000,
      },
      {
        id: 'soc-10-2',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/tramanh.cooking',
        soFollower: 340000,
      },
    ],
    engagementRate: 4.9,
    linhVuc: ['Ẩm thực', 'Mẹ & bé', 'Lifestyle'],
    reviewSoBo: 'Chuyên nấu các bữa cơm gia đình thuần Việt, công thức đơn giản, trang trí mâm cơm bắt mắt, đồ gia dụng nhà bếp xinh xắn. Khán giả là các chị em nội trợ và giới trẻ thích nấu ăn tại nhà.',
    bangGia: {
      post: 5000000,
      video: 14000000,
      shorts: 7500000,
      livestream: 10000000,
      thamDuSuKien: 9000000,
      sdha: 6000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Ngọc Trâm',
      soDienThoai: '0983 456 789',
      emailZalo: 'bepnhatramanh@gmail.com',
      ghiChu: 'Gửi nguyên liệu gia vị hoặc thiết bị nhà bếp trước 4 ngày.',
    },
    lichSuHopTac: [
      {
        id: 'collab-10-1',
        tenChienDich: 'Nước Mắm Chinsu Cá Cơm Biển Sâu',
        thoiGian: '2025-10-30',
        formatDaLam: 'Video nấu món thịt kho tàu chuẩn vị Tết',
        chiPhiThucTe: 15000000,
        ketQuaLink: 'https://tiktok.com/@tramanh_bepnha/video/1',
        danhGia: 5,
        nhanXet: 'Món ăn trông ngon mắt, lồng ghép sản phẩm tự nhiên, người xem khen ngợi nhiều.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Chi phí hợp lý, hiệu quả chuyển đổi đơn hàng gia vị và đồ bếp rất ổn định.',
    },
    isSample: true,
    ngayTao: '2026-02-15T11:00:00.000Z',
    ngayCapNhat: '2026-03-06T14:40:00.000Z',
  },

  // 11. Võ Hoài Nam (Nam Phượt Thủ) - Du lịch, Nhiếp ảnh (Thiếu giá livestream vì không nhận live)
  {
    id: 'kol-sample-11',
    ten: 'Võ Hoài Nam (Nam Phượt Thủ)',
    anhDaiDien: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-11-1',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@namphuotthu_travel',
        soFollower: 1300000,
      },
      {
        id: 'soc-11-2',
        tenNenTang: 'Instagram',
        linkProfile: 'https://instagram.com/nam.adventure',
        soFollower: 510000,
      },
      {
        id: 'soc-11-3',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/namphuottravel',
        soFollower: 320000,
      },
    ],
    engagementRate: 4.1,
    linhVuc: ['Du lịch', 'Nhiếp ảnh', 'Lifestyle'],
    reviewSoBo: 'Chuyên phượt xe máy, cắm trại dã ngoại, leo núi và khám phá những vùng đất hoang sơ kỳ vĩ. Kỹ năng quay flycam và dựng phim chuẩn điện ảnh tài liệu.',
    bangGia: {
      post: 12000000,
      video: 32000000,
      shorts: 16000000,
      livestream: null, // Không nhận livestream
      thamDuSuKien: 20000000,
      sdha: 15000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Hoài Nam',
      soDienThoai: '0909 333 444',
      emailZalo: 'namphuot.work@gmail.com',
      ghiChu: 'Thường đi rừng núi, vui lòng liên hệ qua email nếu điện thoại mất sóng.',
    },
    lichSuHopTac: [
      {
        id: 'collab-11-1',
        tenChienDich: 'Trải nghiệm Xe Bán Tải Ford Ranger Stormtrak',
        thoiGian: '2025-07-15',
        formatDaLam: 'Phim ngắn 15 phút cung đường Tà Năng Phan Dũng',
        chiPhiThucTe: 60000000,
        ketQuaLink: 'https://youtube.com/watch?v=sample11',
        danhGia: 5,
        nhanXet: 'Chất lượng video xuất sắc như phim tài liệu, khách hàng sử dụng làm clip viral.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Lựa chọn số 1 cho các nhãn hàng dã ngoại, xe cộ, đồ thể thao outdoor và du lịch sinh thái.',
    },
    isSample: true,
    ngayTao: '2026-02-18T16:00:00.000Z',
    ngayCapNhat: '2026-03-07T10:15:00.000Z',
  },

  // 12. Đỗ Hoàng Yến (Yến Xôi Comedy) - Mega KOL 5M followers (Giải trí, Lifestyle)
  {
    id: 'kol-sample-12',
    ten: 'Đỗ Hoàng Yến (Yến Xôi Comedy)',
    anhDaiDien: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-12-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@yenxoi_official',
        soFollower: 4800000,
      },
      {
        id: 'soc-12-2',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/yenxoi.actress',
        soFollower: 1600000,
      },
      {
        id: 'soc-12-3',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@YenXoiChannel',
        soFollower: 980000,
      },
    ],
    engagementRate: 7.8,
    linhVuc: ['Giải trí', 'Lifestyle', 'Thời trang'],
    reviewSoBo: 'Diễn viên hài kịch và hot TikToker hàng đầu với gần 5 triệu người theo dõi. Các video tình huống công sở và gia đình luôn đạt hàng triệu view trong 24 giờ. Rất được các nhãn hàng lớn săn đón.',
    bangGia: {
      post: 25000000,
      video: 58000000,
      shorts: 36000000,
      livestream: 45000000,
      thamDuSuKien: 40000000,
      sdha: 35000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Anh Quyết (Giám đốc Agency đại diện)',
      soDienThoai: '0918 888 777',
      emailZalo: 'booking@yenxoimedia.vn (Zalo: 0918888777)',
      ghiChu: 'Cần gửi kịch bản trước 10 ngày để đội ngũ biên kịch duyệt và chỉnh sửa phù hợp hình ảnh.',
    },
    lichSuHopTac: [
      {
        id: 'collab-12-1',
        tenChienDich: 'Chiến dịch Tết Mirinda Cười Thả Ga',
        thoiGian: '2025-12-20',
        formatDaLam: '2 Video sitcom TikTok + 1 Livestream mở hộp quà Tết',
        chiPhiThucTe: 95000000,
        ketQuaLink: 'https://tiktok.com/@yenxoi_official/video/1',
        danhGia: 5,
        nhanXet: 'Đạt hơn 6.5 triệu views trên TikTok, lọt top trending, chỉ số thảo luận mạng xã hội bùng nổ.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Mega Influencer độ nhận diện quốc dân, thích hợp cho các chiến dịch quy mô lớn của tập đoàn.',
    },
    isSample: true,
    ngayTao: '2026-02-20T10:00:00.000Z',
    ngayCapNhat: '2026-03-08T16:00:00.000Z',
  },

  // 13. Trịnh Khánh Vy (Vy Makeup Lab) - Làm đẹp, Thời trang (Micro KOL)
  {
    id: 'kol-sample-13',
    ten: 'Trịnh Khánh Vy (Vy Makeup Lab)',
    anhDaiDien: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-13-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@vymakeuplab',
        soFollower: 310000,
      },
      {
        id: 'soc-13-2',
        tenNenTang: 'Instagram',
        linkProfile: 'https://instagram.com/vy.makeuplab',
        soFollower: 190000,
      },
    ],
    engagementRate: 5.7,
    linhVuc: ['Làm đẹp', 'Thời trang'],
    reviewSoBo: 'Chuyên viên trang điểm chuyên nghiệp, hướng dẫn kỹ thuật kẻ mắt, đánh nền mỏng nhẹ và review son môi giá học sinh sinh viên. Phong cách ngọt ngào, review chi tiết từng tông da.',
    bangGia: {
      post: 3500000,
      video: 8500000,
      shorts: 4500000,
      livestream: 7000000,
      thamDuSuKien: 6000000,
      sdha: 4000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Khánh Vy',
      soDienThoai: '0966 554 433',
      emailZalo: 'vymakeup.collab@gmail.com',
      ghiChu: 'Hỗ trợ quay chụp tại studio riêng với ánh sáng chuyên dụng.',
    },
    lichSuHopTac: [
      {
        id: 'collab-13-1',
        tenChienDich: 'Ra mắt Son Kem Lì Romand Zero Velvet',
        thoiGian: '2025-11-15',
        formatDaLam: 'Video swatch 5 màu son trên TikTok',
        chiPhiThucTe: 6000000,
        ketQuaLink: 'https://tiktok.com/@vymakeuplab/video/1',
        danhGia: 5,
        nhanXet: 'Màu son lên chuẩn, người xem khen ngợi cách đánh son, đơn hàng mã son 02 bán sạch.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Micro-influencer chi phí cực kỳ tiết kiệm, độ tương tác và chuyển đổi đơn hàng son môi cao.',
    },
    isSample: true,
    ngayTao: '2026-02-22T08:00:00.000Z',
    ngayCapNhat: '2026-03-09T13:20:00.000Z',
  },

  // 14. Hà Tuấn Khang (Khang Review Xe) - Công nghệ, Xe cộ
  {
    id: 'kol-sample-14',
    ten: 'Hà Tuấn Khang (Khang Review Xe)',
    anhDaiDien: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-14-1',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@khangreviewxe',
        soFollower: 890000,
      },
      {
        id: 'soc-14-2',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/tuankhang.autocar',
        soFollower: 450000,
      },
      {
        id: 'soc-14-3',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@khangauto_car',
        soFollower: 520000,
      },
    ],
    engagementRate: 3.8,
    linhVuc: ['Công nghệ', 'Lifestyle'],
    reviewSoBo: 'Chuyên gia đánh giá ô tô, xe máy điện, đồ chơi phụ kiện xe hơi và trải nghiệm công nghệ an toàn. Giọng điệu sắc bén, thẳng thắn, không ngại chỉ ra nhược điểm của xe.',
    bangGia: {
      post: 15000000,
      video: 42000000,
      shorts: 20000000,
      livestream: 22000000,
      thamDuSuKien: 25000000,
      sdha: 22000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Tuấn Khang',
      soDienThoai: '0913 777 888',
      emailZalo: 'khangauto@gmail.com (Zalo: 0913777888)',
      ghiChu: 'Yêu cầu xe lái thử đầy đủ bảo hiểm và giấy tờ lưu hành hợp lệ.',
    },
    lichSuHopTac: [
      {
        id: 'collab-14-1',
        tenChienDich: 'Trải nghiệm Xe Điện VinFast VF6 Eco',
        thoiGian: '2025-10-22',
        formatDaLam: 'Video YouTube 18 phút + 2 clip ngắn TikTok',
        chiPhiThucTe: 45000000,
        ketQuaLink: 'https://youtube.com/watch?v=sample14',
        danhGia: 4,
        nhanXet: 'Bài đánh giá khách quan, được chia sẻ trên các diễn đàn Otofun và Otosaigon rất nhiều.',
      },
    ],
    danhGiaHieuQua: {
      diem: 4,
      nhanXet: 'Rất uy tín trong giới mê xe hơi và phụ kiện công nghệ cho tài xế.',
    },
    isSample: true,
    ngayTao: '2026-02-24T14:30:00.000Z',
    ngayCapNhat: '2026-03-10T11:00:00.000Z',
  },

  // 15. Dương Mỹ Duyên (Duyên Yoga & Thiền) - Nano KOL (Followers 75K - 180K, Giá video 5tr)
  {
    id: 'kol-sample-15',
    ten: 'Dương Mỹ Duyên (Duyên Yoga & Thiền)',
    anhDaiDien: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-15-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@duyenyoga_mind',
        soFollower: 180000,
      },
      {
        id: 'soc-15-2',
        tenNenTang: 'Instagram',
        linkProfile: 'https://instagram.com/myduyen.yogalife',
        soFollower: 120000,
      },
      {
        id: 'soc-15-3',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/duyenyoga.coach',
        soFollower: 75000,
      },
    ],
    engagementRate: 6.9,
    linhVuc: ['Sức khỏe & Gym', 'Lifestyle', 'Giáo dục'],
    reviewSoBo: 'Huấn luyện viên Yoga trị liệu và hướng dẫn thiền định buổi sáng. Không khí video an yên, thanh lọc tâm hồn, người theo dõi có độ trung thành cực cao và quan tâm lối sống lành mạnh xanh sạch.',
    bangGia: {
      post: 2000000,
      video: 5000000,
      shorts: 2800000,
      livestream: 4000000,
      thamDuSuKien: 4500000,
      sdha: 3000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Mỹ Duyên',
      soDienThoai: '0977 111 222',
      emailZalo: 'myduyen.yoga@gmail.com',
      ghiChu: 'Phù hợp các sản phẩm trà thảo mộc, tinh dầu, thảm tập, thực phẩm hữu cơ.',
    },
    lichSuHopTac: [
      {
        id: 'collab-15-1',
        tenChienDich: 'Giới thiệu Trà Thảo Mộc Ngủ Ngon Ladophar',
        thoiGian: '2025-11-28',
        formatDaLam: 'Video TikTok bài tập thở và uống trà trước khi ngủ',
        chiPhiThucTe: 4000000,
        ketQuaLink: 'https://tiktok.com/@duyenyoga_mind/video/1',
        danhGia: 5,
        nhanXet: 'Người xem phản hồi rất thích sự nhẹ nhàng, không bị cảm giác quảng cáo lộ liễu.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Nano KOL giá cực kỳ mềm, tương tác cao, tệp follower chất lượng cao cho dòng sản phẩm chăm sóc sức khỏe.',
    },
    isSample: true,
    ngayTao: '2026-02-26T09:15:00.000Z',
    ngayCapNhat: '2026-03-11T15:20:00.000Z',
  },

  // 16. Lâm Nhật Huy (Huy Coder Dạo) - Công nghệ, Giáo dục (Thiếu livestream vì không live)
  {
    id: 'kol-sample-16',
    ten: 'Lâm Nhật Huy (Huy Coder Dạo)',
    anhDaiDien: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-16-1',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@huycoderdao',
        soFollower: 320000,
      },
      {
        id: 'soc-16-2',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@huycoder_tech',
        soFollower: 240000,
      },
      {
        id: 'soc-16-3',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/lamnhathuy.dev',
        soFollower: 180000,
      },
    ],
    engagementRate: 4.4,
    linhVuc: ['Công nghệ', 'Giáo dục', 'Tài chính'],
    reviewSoBo: 'Lập trình viên kỳ cựu chia sẻ kinh nghiệm học code, công nghệ AI mới, mẹo dùng phím tắt và làm việc từ xa. Tệp khán giả là dân IT, lập trình viên, kỹ sư phần mềm có sức mua đồ công nghệ cao.',
    bangGia: {
      post: 5000000,
      video: 12000000,
      shorts: 6000000,
      livestream: null, // Không livestream
      thamDuSuKien: 10000000,
      sdha: 7000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Nhật Huy',
      soDienThoai: '0944 667 889',
      emailZalo: 'huycoder.collab@gmail.com',
      ghiChu: 'Chỉ nhận sản phẩm màn hình máy tính, bàn phím cơ, ghế công thái học, dịch vụ hosting cloud.',
    },
    lichSuHopTac: [
      {
        id: 'collab-16-1',
        tenChienDich: 'Quảng bá Ghế Công Thái Học Epione Easy Chair',
        thoiGian: '2025-09-08',
        formatDaLam: 'Video review góc làm việc tại nhà',
        chiPhiThucTe: 14000000,
        ketQuaLink: 'https://youtube.com/watch?v=sample16',
        danhGia: 5,
        nhanXet: 'Dân IT khen ngợi phần trải nghiệm thực tế sau 3 tháng sử dụng, bán được 80 chiếc ghế.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Tín nhiệm tuyệt đối trong cộng đồng lập trình viên và giới công nghệ văn phòng.',
    },
    isSample: true,
    ngayTao: '2026-02-28T13:00:00.000Z',
    ngayCapNhat: '2026-03-12T10:00:00.000Z',
  },

  // 17. Chu Phương Nga (Nga Mầm Non & Nuôi Con) - Mẹ & bé, Giáo dục
  {
    id: 'kol-sample-17',
    ten: 'Chu Phương Nga (Nga Mầm Non & Nuôi Con)',
    anhDaiDien: 'https://images.unsplash.com/photo-1548142813-c348350df52b?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-17-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@ngamamnon_family',
        soFollower: 490000,
      },
      {
        id: 'soc-17-2',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/phuongnga.mamnon',
        soFollower: 310000,
      },
    ],
    engagementRate: 5.3,
    linhVuc: ['Mẹ & bé', 'Giáo dục'],
    reviewSoBo: 'Cô giáo mầm non chia sẻ phương pháp giáo dục sớm Montessori, đồ chơi kích thích trí tuệ và xử lý khủng hoảng tuổi lên 3. Cách nói chuyện tâm lý, nhẹ nhàng, phụ huynh tin tưởng.',
    bangGia: {
      post: 4500000,
      video: 11000000,
      shorts: 6000000,
      livestream: 8500000,
      thamDuSuKien: 8000000,
      sdha: 5000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Phương Nga',
      soDienThoai: '0982 334 556',
      emailZalo: 'ngamamnon.booking@gmail.com',
      ghiChu: 'Không nhận sữa công thức thay thế sữa mẹ dưới 24 tháng tuổi.',
    },
    lichSuHopTac: [
      {
        id: 'collab-17-1',
        tenChienDich: 'Giới thiệu Bộ Sách Tương Tác Chiếu Bóng Đinh Tị',
        thoiGian: '2025-10-10',
        formatDaLam: 'Video kể chuyện đêm trước khi đi ngủ cùng bé',
        chiPhiThucTe: 7500000,
        ketQuaLink: 'https://tiktok.com/@ngamamnon_family/video/1',
        danhGia: 5,
        nhanXet: 'Hình ảnh ấm áp, phụ huynh xem xong đặt mua sách tặng con rất nhiều.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Rất thích hợp cho các nhãn hàng sách thiếu nhi, đồ chơi giáo dục và thời trang trẻ em.',
    },
    isSample: true,
    ngayTao: '2026-03-01T15:20:00.000Z',
    ngayCapNhat: '2026-03-13T09:30:00.000Z',
  },

  // 18. Trương Minh Hiếu (Hiếu Esport Gamer) - Gaming, Công nghệ, Giải trí
  {
    id: 'kol-sample-18',
    ten: 'Trương Minh Hiếu (Hiếu Esport Gamer)',
    anhDaiDien: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-18-1',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@hieuesport_gaming',
        soFollower: 1700000,
      },
      {
        id: 'soc-18-2',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@hieugamer.live',
        soFollower: 1200000,
      },
      {
        id: 'soc-18-3',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/truongminhhieu.esport',
        soFollower: 850000,
      },
    ],
    engagementRate: 6.4,
    linhVuc: ['Gaming', 'Công nghệ', 'Giải trí'],
    reviewSoBo: 'Streamer game Liên Quân Mobile và PUBG Mobile có lượng người xem trực tiếp hàng đầu Việt Nam. Khả năng giao lưu duyên dáng, kỹ năng chơi game đỉnh cao, tệp fan trung thành từ 15-28 tuổi.',
    bangGia: {
      post: 14000000,
      video: 38000000,
      shorts: 20000000,
      livestream: 28000000,
      thamDuSuKien: 22000000,
      sdha: 18000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Anh Phong (Quản lý team)',
      soDienThoai: '0937 889 900',
      emailZalo: 'hieuesport.booking@gamestudio.vn',
      ghiChu: 'Có thể lồng ghép chơi game test máy hoặc giải đấu giao lưu với fan.',
    },
    lichSuHopTac: [
      {
        id: 'collab-18-1',
        tenChienDich: 'Livestream Thi Đấu Game Phone ROG Phone 8',
        thoiGian: '2025-11-20',
        formatDaLam: '2 Buổi livestream 2h + 1 Video review hiệu năng',
        chiPhiThucTe: 70000000,
        ketQuaLink: 'https://youtube.com/watch?v=sample18',
        danhGia: 5,
        nhanXet: 'Lượt xem đồng thời đỉnh điểm đạt 42.000 CCU, cộng đồng game thủ bàn luận rất sôi nổi.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Hiệu quả truyền thông số 1 cho các nhãn hàng điện thoại chơi game, tai nghe, nước tăng lực và game phát hành mới.',
    },
    isSample: true,
    ngayTao: '2026-03-03T10:00:00.000Z',
    ngayCapNhat: '2026-03-14T11:00:00.000Z',
  },

  // 19. Cao Thùy Trang (Trang Vintage Outfit) - Thời trang, Làm đẹp
  {
    id: 'kol-sample-19',
    ten: 'Cao Thùy Trang (Trang Vintage Outfit)',
    anhDaiDien: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-19-1',
        tenNenTang: 'Instagram',
        linkProfile: 'https://instagram.com/trang.vintageoutfit',
        soFollower: 640000,
      },
      {
        id: 'soc-19-2',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@trangvintage_daily',
        soFollower: 820000,
      },
    ],
    engagementRate: 6.0,
    linhVuc: ['Thời trang', 'Làm đẹp', 'Lifestyle'],
    reviewSoBo: 'Chuyên phong cách thời trang cổ điển Vintage và Y2K, phối màu độc đáo, chụp ảnh film phong cách hoài niệm. Rất hợp các thương hiệu phụ kiện, túi xách, đồng hồ và giày dép.',
    bangGia: {
      post: 8000000,
      video: 18000000,
      shorts: 9500000,
      livestream: 12000000,
      thamDuSuKien: 12000000,
      sdha: 9000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Thùy Trang',
      soDienThoai: '0981 223 344',
      emailZalo: 'trangvintage.collab@gmail.com',
      ghiChu: 'Tone màu ảnh chụp mang chất hoài niệm, gửi trang phục trước 5 ngày.',
    },
    lichSuHopTac: [
      {
        id: 'collab-19-1',
        tenChienDich: 'Ra mắt Túi Xách Vải Canvas Jamlos Heritage',
        thoiGian: '2025-10-15',
        formatDaLam: '1 Bộ ảnh Instagram 10 tấm + 1 Video mix & match',
        chiPhiThucTe: 15000000,
        ketQuaLink: 'https://instagram.com/p/sample19',
        danhGia: 5,
        nhanXet: 'Bộ ảnh đạt hơn 35.000 lượt lưu (save), mẫu túi canvas bán hết trong 3 ngày.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'Gu thẩm mỹ tinh tế, tạo ra các hình ảnh lookbook chất lượng như tạp chí thời trang.',
    },
    isSample: true,
    ngayTao: '2026-03-05T09:00:00.000Z',
    ngayCapNhat: '2026-03-15T14:10:00.000Z',
  },

  // 20. Tô Văn Hùng (Bác Sĩ Hùng Dinh Dưỡng) - Sức khỏe & Gym, Ẩm thực, Giáo dục
  {
    id: 'kol-sample-20',
    ten: 'Tô Văn Hùng (Bác Sĩ Hùng Dinh Dưỡng)',
    anhDaiDien: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80',
    nenTang: [
      {
        id: 'soc-20-1',
        tenNenTang: 'TikTok',
        linkProfile: 'https://tiktok.com/@bacsihung_dinhduong',
        soFollower: 950000,
      },
      {
        id: 'soc-20-2',
        tenNenTang: 'Facebook',
        linkProfile: 'https://facebook.com/drhung.nutrition',
        soFollower: 360000,
      },
      {
        id: 'soc-20-3',
        tenNenTang: 'YouTube',
        linkProfile: 'https://youtube.com/@BacSiHungNutrition',
        soFollower: 410000,
      },
    ],
    engagementRate: 7.2,
    linhVuc: ['Sức khỏe & Gym', 'Ẩm thực', 'Giáo dục'],
    reviewSoBo: 'Bác sĩ chuyên khoa dinh dưỡng giải thích khoa học về calorie, thực phẩm chức năng, bệnh tiểu đường và chế độ ăn giảm cân an toàn. Phong thái chuẩn mực y khoa, người xem tuyệt đối tin tưởng.',
    bangGia: {
      post: 9000000,
      video: 22000000,
      shorts: 12000000,
      livestream: 16000000,
      thamDuSuKien: 15000000,
      sdha: 12000000,
    },
    lienHe: {
      tenNguoiLienHe: 'Trợ lý Y khoa Minh Nguyệt',
      soDienThoai: '0904 556 778',
      emailZalo: 'drhung.nutrition@gmail.com (Zalo: 0904556778)',
      ghiChu: 'Chỉ nhận các nhãn hàng sữa hạt, yến mạch, thực phẩm hữu cơ và TPCN có chứng nhận GMP Bộ Y Tế.',
    },
    lichSuHopTac: [
      {
        id: 'collab-20-1',
        tenChienDich: 'Tuyên truyền Dinh Dưỡng Sữa Hạt Hạnh Nhân 137 Degrees',
        thoiGian: '2025-11-12',
        formatDaLam: 'Video phân tích bảng thành phần dinh dưỡng trên TikTok',
        chiPhiThucTe: 20000000,
        ketQuaLink: 'https://tiktok.com/@bacsihung_dinhduong/video/1',
        danhGia: 5,
        nhanXet: 'Giải thích chuyên môn thuyết phục, xóa bỏ định kiến đường sữa, doanh số tăng 200% tại các chuỗi siêu thị.',
      },
    ],
    danhGiaHieuQua: {
      diem: 5,
      nhanXet: 'KOL y khoa hàng đầu, tạo dựng niềm tin vững chắc cho sản phẩm dinh dưỡng và sức khỏe.',
    },
    isSample: true,
    ngayTao: '2026-03-07T11:00:00.000Z',
    ngayCapNhat: '2026-03-16T08:30:00.000Z',
  },
];
