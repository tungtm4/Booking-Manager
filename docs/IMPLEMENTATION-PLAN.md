# Kế hoạch triển khai tiếp theo

## Đã hoàn thành ở bước thiết kế

Đặc tả dữ liệu, công thức P&L, quyền và migration nằm trong PROJECT-PNL-AND-ACCESS.md. Các mục “mặc định đề xuất” cần được duyệt trước khi áp dụng lên người dùng thật.

## Đợt 1 — Mô hình tài chính dùng chung

Tạo kiểu dữ liệu dự án, phiên bản báo giá và hạng mục mua/bán. Viết bộ tính tiền dùng chung có test, tách khỏi UI. Bổ sung tính giá null/0, fee, discount, chi phí nội bộ và baseline. Chưa đổi dữ liệu người dùng tự động.

## Đợt 2 — Database và xác thực

Chọn nơi triển khai; dịch vụ đăng nhập; database; tạo môi trường dev riêng. Tạo schema/migration, tổ chức, tài khoản và thành viên dự án. Đăng nhập/đăng xuất, mời thành viên, vô hiệu hóa tài khoản. Khóa dịch vụ chỉ đặt ở server. Kiểm thử quyền trực tiếp qua API trước khi mở cho nhóm.

## Đợt 3 — Chuyển KOL và báo giá lên server

Đưa CRUD KOL/giá, import và báo giá qua API. Thực thi quyền theo tổ chức và dự án. Chuyển localStorage qua staging có xác nhận, giữ bản sao gốc. Chống ghi đè đồng thời bằng version.

## Đợt 4 — UI nghiệp vụ và P&L

Danh sách dự án, báo giá nội bộ mua/bán, phí, bản xuất khách, duyệt, P&L ba giai đoạn. Tối ưu bố cục desktop trước, rồi tablet/mobile. Quyền quyết định trường nào được tải và hiển thị.

## Đợt 5 — Nghiệm thu với nhóm

Tài khoản từng vai trò; dự án có dữ liệu mẫu; kịch bản import, sửa giá, báo khách, phát sinh và quyết toán. Xác nhận sao lưu/khôi phục và nhật ký trước khi dùng dữ liệu thật.

## Các quyết định cần trước đợt 2

- Người nào được xem P&L và giá mua? Đã chốt Booking/Account gộp; nhiều người Booking cùng dự án.
- Đã chốt email và mật khẩu. Ai là Admin đầu tiên?
- Nơi deploy hiện tại hoặc mong muốn, tài khoản dịch vụ sẵn có; chưa chọn gói trả phí.
- Duyệt báo giá bắt buộc hay theo hạn mức? Ngưỡng margin duyệt ngoại lệ?
- Đã xác nhận chiết khấu được trừ trước khi tính agency fee.
