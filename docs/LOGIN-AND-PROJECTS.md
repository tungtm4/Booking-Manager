# Đăng nhập và quản lý dự án — bản local

## Đã triển khai

- Email/mật khẩu, mật khẩu băm bằng scrypt với salt riêng.
- Phiên đăng nhập bằng cookie HttpOnly, SameSite Strict, hết hạn 8 giờ; production yêu cầu HTTPS để dùng Secure cookie.
- Không đăng ký công khai. Lần đầu người vận hành dùng mã trong `.local/setup-code.txt` để tạo Admin. Sau đó endpoint khởi tạo bị khóa.
- Admin tạo nhiều tài khoản Admin hoặc thành viên. Thành viên phải đổi mật khẩu cấp ban đầu trước khi sử dụng.
- Admin tạo dự án; dự án có nhiều Admin/PM/Booking và nhiều phân công trên mỗi thành viên.
- PM chỉ xem dự án được giao; được thêm Booking, không được cấp PM/Admin. Admin công ty xem toàn bộ.
- Khóa/mở tài khoản, hủy phiên khi khóa; bảo vệ Admin cuối cùng. Gỡ thành viên là ngừng tham gia, không xóa tài khoản.
- Đổi mật khẩu kết thúc các phiên hiện tại. Rate limit đăng nhập sai theo IP: 10 lần/15 phút, lưu trong tiến trình.
- Dữ liệu tài khoản/dự án lưu SQLite tại `.local/workspace.sqlite`; file khóa/mã/database không đưa vào Git. Cần Node.js 24+.
- Nhật ký backend ghi tạo tài khoản, đăng nhập, đổi mật khẩu, tạo dự án và phân công/gỡ thành viên. Chưa có UI đọc nhật ký.

## Cách bắt đầu

1. Chạy app, mở http://localhost:3002.
2. Mở `.local/setup-code.txt` bằng trình soạn thảo và sao chép mã vào form khởi tạo. Không chia sẻ mã.
3. Tự nhập tên/email và mật khẩu tối thiểu 12 ký tự để tạo Admin đầu tiên, sau đó đăng nhập.
4. Mở Tài khoản, tạo thành viên; trong Dự án tạo project rồi phân công theo email.

## Giới hạn giai đoạn này

KOL và báo giá cũ còn ở localStorage, chưa có projectId hoặc schema giá mua/bán mới. Chỉ Admin được vào module cũ; mọi endpoint AI/Sheet cũ cũng yêu cầu Admin đăng nhập. Không cho PM/Booking dùng dữ liệu cũ để tránh lộ dữ liệu giữa dự án.

Đăng nhập KHÔNG biến dữ liệu KOL cũ thành dữ liệu server. Bước tiếp theo là migration KOL/SOW, giao diện nội bộ mua/bán, quyền trường và P&L. Hợp đồng/lịch thanh toán mới có phân công/quyền nền tảng, chưa có màn nghiệp vụ.

SQLite phù hợp chạy thử một server có ổ đĩa lưu bền. Chưa triển khai cloud hay chọn gói trả phí. Trước khi vận hành công khai cần quy trình phục hồi mật khẩu/email, TLS, sao lưu database, cấu hình reverse proxy và rate limit dùng chung nếu chạy nhiều tiến trình. Chưa có quên mật khẩu qua email.

## Kiểm tra

`pnpm test` hoặc `npm test` chạy bộ test nền tảng, lưu trữ, AI và tích hợp auth/dự án. Kiểm thử dùng database trong bộ nhớ, không sửa tài khoản thật.

Bản preview tại cổng 3003 trong quá trình kiểm thử chỉ dùng tài khoản giả và database trong bộ nhớ; không phải nơi nhập dữ liệu thật.

## Cập nhật đối chiếu flow ngày 22/10/2026

Mã local hiện đã nối phần báo giá mới theo dự án (server/projectQuotes.ts, ProjectQuotesPanel.tsx): phương án, phiên bản, giá mua/bán, duyệt, baseline và bản khách. Chưa kiểm chứng vận hành trong lượt cập nhật tài liệu này. Giới hạn localStorage ở trên áp dụng cho KOL/SOW legacy, không phải mọi báo giá mới.

Flow mục tiêu mới nhất nằm ở bản tổng hợp đầu PROJECT-TO-QUOTE-FLOW.md: brief chung → danh sách KOL sơ bộ không giới hạn theo brief → Booking xác nhận giá → PM tick chọn lập phương án → duyệt/chốt FINAL → thực hiện. Không coi flow mới đã được triển khai chỉ vì đã có module báo giá local.
