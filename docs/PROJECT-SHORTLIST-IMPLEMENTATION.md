# Brief chung, danh sách KOL sơ bộ và phương án

## Cập nhật mới: thẻ KOL và bỏ ER

- Thẻ dùng chung cho thư viện và danh sách sơ bộ: lĩnh vực, kênh/follower, lý do theo tiêu chí hồ sơ, ghi chú và sáu ô giá đầu vào.
- Brief lưu hạng mục, số lượng và phạm vi tổng chiến dịch / mỗi KOL. Làm nổi bật giá liên quan; không tự chia tổng SOW cho từng người.
- Booking cập nhật/xác nhận giá từ từng ô; PM chọn KOL vào phương án. Chưa tích hợp AI đánh giá ngữ nghĩa vào dự án.
- Bỏ ER khỏi giao diện, import mới, lọc và chấm điểm toàn app. Trường cũ chỉ giữ tương thích backup; minEr cũ bị bỏ qua. Thuật toán legacy còn ba nhóm điểm, tối đa 80; thẻ dự án dùng tiêu chí đạt/chưa đạt.
- Trước khi người dùng yêu cầu dừng kiểm thử: 42/42 ca đạt, TypeScript/build đạt; đã kiểm tra giao diện bằng dữ liệu thử riêng cho Admin và Booking.

Đợt triển khai này sửa luồng chức năng, chưa chuyển AI khỏi module cũ.

## Cách dùng

1. Mở dự án → **Brief & Danh sách KOL**. PM/Admin nhập brief chung, duyệt các tiêu chí lĩnh vực, từ khóa nội dung hồ sơ, nền tảng, follower, ER. Nhập số KOL mục tiêu và ngân sách để đối chiếu, không giới hạn số kết quả.
2. Admin có thể nhập KOL thật từ trình duyệt vào thư viện chung. Không lấy dữ liệu mẫu, không ghi đè mã KOL đã có, không xóa localStorage. Mỗi lô tối đa 500 nhưng nhập nhiều lô; danh sách kết quả không bị cắt Top N. Có thể thêm hồ sơ mới trực tiếp.
3. Chọn các hồ sơ phù hợp đưa vào danh sách sơ bộ dùng chung trong dự án. Booking và PM nhìn cùng danh sách, không phải tạo phương án trước.
4. Booking chọn từng hạng mục, cập nhật giá, nguồn và bấm **Xác nhận giá**. Có giá thư viện chưa được coi là xác nhận. Trống = thiếu giá; 0 = miễn phí. Ngày xác nhận do server ghi; đổi giá hoặc lưu chưa xác nhận sẽ bỏ xác nhận cũ.
5. PM tự tạo A/B/C ở tab báo giá. Về danh sách chung, tích KOL, chọn bản nháp phương án, hạng mục và số lượng / KOL. Chỉ lấy hạng mục có giá đã xác nhận. Một KOL có thể xuất hiện trong nhiều phương án; không thêm trùng cùng KOL + format trong một phiên bản. Thêm lần lượt các format; sửa số lượng từng dòng trong báo giá. Không tự chia đều 10 video / 15 shorts cho 4 KOL.
6. PM nhập giá bán từng dòng. Số KOL độc lập, số đơn vị hạng mục, ngân sách được đối chiếu theo từng phương án; hiện ngân sách so với tổng sau thuế và có nhãn rõ. Chưa đủ giá sẽ không kết luận trong/vượt ngân sách. Agency fee sau chiết khấu, trước thuế giữ nguyên.
7. Giá lấy từ danh sách là snapshot: cập nhật giá chung không tự đổi báo giá. PM có thể bấm **Lấy lại giá KOL đã xác nhận vào bản nháp** để cập nhật toàn bộ giá liên kết, giữ giá bán/số lượng. Bản đã gửi/duyệt cần tạo phiên bản mới trước. Khi khách chọn, chốt một phiên bản đã duyệt như luồng trước.

## Dữ liệu và quyền

- SQLite chung: `kol_catalog` theo công ty, `project_briefs` và `project_shortlist` theo dự án. Không tự di chuyển/xóa dữ liệu cũ hoặc phương án cũ.
- Brief chung lưu một bản được duyệt với revision. Các lần đổi brief không xóa danh sách sơ bộ đã chọn trước đó; danh sách là danh sách đã giữ lại để nhóm kiểm tra.
- Kết quả phù hợp hiện lọc nội dung hồ sơ theo tiêu chí thủ công đã duyệt, chưa phân tích ngữ nghĩa toàn brief. Tích hợp AI vào dự án là bước kế tiếp.
- Booking được xem/cập nhật giá đầu vào, không nhận giá bán, fee, chiết khấu, tổng bán hay P&L từ API phương án. Booking không tạo phương án hoặc đưa KOL vào phương án.
- Giá xác nhận trong dự án không tự ghi ngược vào thư viện gốc; hồ sơ đang dùng trong dự án là bản sao thời điểm thêm. Chưa có màn chỉnh sửa/xóa thư viện chung hoặc tự đồng bộ hồ sơ sau khi sửa ở module cũ.
- Báo giá nhập thủ công/legacy vẫn giữ khả năng sửa giá đầu vào như trước; dòng liên kết danh sách chung bị khóa giá snapshot và chỉ PM lấy lại bằng thao tác riêng.
- Các API ghi brief/giá/báo giá có revision chống ghi đè; yêu cầu chuyển nhiều dòng được kiểm tra toàn bộ trước khi ghi; chặn chéo dự án/công ty, giá âm và tổng tiền quá lớn.
- Backup JSON của module cũ chỉ gồm dữ liệu cũ; chưa phải backup SQLite của workspace.

## Kiểm chứng

- Bộ kiểm thử 38 ca: thêm kiểm thử danh sách vượt số mục tiêu, xác nhận giá, giá 0/thiếu, A/B dùng chung KOL, chặn trùng, snapshot giá, lấy lại giá có chủ đích, quyền Booking, chéo dự án, revision và chuyển nguyên tử, tổng tiền vượt phạm vi.
- TypeScript và build production qua. Vite còn cảnh báo kích thước bundle và cấu hình `__dirname` có từ trước.
- Kiểm tra giao diện bằng DB trong bộ nhớ: brief mục tiêu 4 KOL vẫn trả 6 kết quả, xác nhận giá 12.000.000 rồi đưa 3 video vào A; PM bán 18.000.000/video, fee 10% → trước thuế 59.400.000, đầu vào 36.000.000, lợi nhuận 23.400.000. Dữ liệu thật không bị thay đổi bởi ca thử.
