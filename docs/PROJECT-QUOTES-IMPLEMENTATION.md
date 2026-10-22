# Dự án → Phương án → Báo giá & P&L: bản triển khai local

## Đã có

- Tạo dự án có khách hàng và tên chiến dịch; chỉnh thông tin trong dự án. Dự án cũ giữ nguyên, cần bổ sung các trường còn thiếu trước khi tạo phương án.
- Hai tab trong dự án: Phương án & Báo giá; Thành viên & Phân công.
- Nhiều phương án KOL độc lập; mỗi phương án có nhiều phiên bản. Đặt tên và brief riêng khi tạo phương án.
- Hạng mục KOL/buzz/seeding/sản xuất/khác: phase, mô tả SOW, số lượng, giá mua và giá bán. Dòng chưa chọn không cộng tiền; null là chưa có giá; 0 là giá bằng 0 có chủ đích.
- PM/Admin nhập hai giá và phí; Booking chỉ cập nhật giá mua trên dòng có sẵn. Booking không nhận giá bán, chiết khấu, agency fee, thuế, doanh thu hoặc P&L qua API.
- Lưu dữ liệu báo giá vào SQLite theo project; optimistic revision chống ghi đè từ hai người. Danh bạ hoặc SOW legacy không thay đổi tự động.
- Chiết khấu trước agency fee; thuế cấu hình riêng. P&L dự kiến từng phương án; phần tổng dự án chỉ lấy một baseline đã chốt, không cộng A+B.
- Luồng nháp → chờ duyệt → đã duyệt hoặc trả chỉnh sửa. Bản đã duyệt không sửa trực tiếp, tạo phiên bản mới. Admin/PM xác nhận khách chọn để đặt baseline.
- Bản xem trước báo khách lấy dữ liệu theo allowlist riêng không có giá mua/P&L. Chưa có file PDF dành riêng cho báo giá dự án.
- Admin có thể chọn SOW legacy trong trình duyệt và sao chép các dòng vào bản nháp hiện tại, phải lưu rõ. Giữ donGia legacy là giá bán; giá mua để null chờ xác nhận; không tự chuyển chiết khấu/phụ phí cũ thành fee mới.

## Chưa có trong đợt này

- AI brief và đề xuất/chọn KOL từ thư viện chung chưa được chuyển vào phương án. Hiện nhập SOW thủ công hoặc lấy dòng từ bản cũ bằng Admin. Không gọi phần này là đã chuyển xong toàn bộ workflow.
- Chưa sửa brief/tên phương án sau khi tạo; chưa có sao chép phương án A thành B (chỉ nhân bản phiên bản trong cùng phương án).
- Chưa triển khai dashboard toàn công ty, chi phí thực tế, hợp đồng, công nợ/lịch thanh toán hoặc biên tập.
- Chưa có quy tắc cấm tự duyệt hoặc hạn mức duyệt nhiều tầng; đợt này Admin/PM có thể gửi và duyệt trong dự án được giao. Quy tắc này phải được chốt trước vận hành có kiểm soát duyệt độc lập.
- Chưa phát hành public, chưa push GitHub đợt này.

## Kiểm tra

35 test đạt trên bản cuối; kiểm thử API dự án/báo giá riêng dùng DB trong bộ nhớ. Các test kiểm tra chặn Booking giá bán và cập nhật trái quyền, dự án khác không truy cập, revision conflict, dữ liệu sai, phiên bản bất biến, fee sau chiết khấu, bản khách không có cost và baseline đơn nhất.

UI thử với dự án giả trong bộ nhớ: A mua 25 triệu/bán 32 triệu + fee12% => doanh thu35,84 triệu/lợi nhuận10,84 triệu. B mua15 triệu/bán22 triệu +fee12% => doanh thu24,64 triệu/lợi nhuận9,64 triệu. Chuyển B không đổi tổng baseline A; lưu và reload vẫn mở lại đúng dữ liệu.

Môi trường thật localhost:3002 chỉ được bổ sung bảng/cột, không tạo dự án mẫu hay sửa dự án người dùng trong kiểm thử. Lưu bền trong .local/workspace.sqlite, vẫn giữ localStorage cũ.

Đã tách tên cookie theo workspace để phiên preview không ghi đè phiên thật, và chuyển về đăng nhập khi API trả 401. Khi cập nhật từ cookie cũ, cần đăng nhập lại một lần; không đổi mật khẩu hay xóa dữ liệu.
