# Đặc tả dự án, báo giá, P&L và quyền truy cập

Ngày: 22/10/2026. Phạm vi bản đầu: một công ty; nhiều người dùng; dữ liệu dự án dùng chung theo quyền. Tài liệu thiết kế, chưa phải tính năng đã chạy.

## 1. Các quyết định đã được người dùng xác nhận

- Giá KOL trong danh bạ là giá đầu vào.
- Mỗi dòng công việc có giá đầu vào và giá báo khách riêng; chênh lệch nằm trên từng dòng.
- Agency fee tính trên tổng giá bán của tất cả hạng mục sau chiết khấu, trước thuế.
- P&L gồm chi phí KOL và chi phí trực tiếp như buzz, seeding, sản xuất, đi lại nếu có. Chưa phân bổ lương hoặc chi phí chung.

## 2. Mặc định đề xuất, cần duyệt trước khi áp dụng quyền thật

- Vai trò đã chốt: Admin, PM, Booking. Booking và Account được gộp; một dự án có nhiều Admin, nhiều PM, nhiều Booking. Phân công giá/hồ sơ/creator-support là trách nhiệm, không phải vai trò mới.
- Đã chốt: Booking chỉ xem giá đầu vào trong dự án được giao, không xem/sửa giá bán hoặc P&L. PM xem toàn bộ dự án được giao; Admin công ty xem toàn bộ.
- Đã xác nhận: agency fee tính trên tổng hạng mục sau chiết khấu và trước thuế.
- Không mở đăng ký tự do. Admin mời người dùng, cấp vai trò, phân công dự án.
- Người gửi duyệt không tự duyệt báo giá của mình; Admin được duyệt ngoại lệ và ghi lý do.
- Ngưỡng lợi nhuận tối thiểu chưa đặt mặc định; cấu hình sau. Chỉ cảnh báo lỗ, không tự sửa giá.
- Local đã dùng email/mật khẩu và SQLite. Chưa chọn hosting/cloud hoặc gói dịch vụ trả phí.

## 3. Đối chiếu ứng dụng hiện tại

- KolProfile.bangGia: giữ làm bảng giá tham khảo đầu vào; thêm lịch sử giá và người phụ trách.
- SowLineItem.donGia đang là đơn giá duy nhất. Khi nâng cấp phải tách giá mua/giá bán, không mặc nhiên coi toàn bộ báo giá cũ có P&L hợp lệ.
- SowQuote đang chưa có projectId, chủ sở hữu, phiên bản, trạng thái duyệt, agency fee tách biệt.
- StorageService dùng localStorage. Server đã có đăng nhập và dự án local; KOL/SOW legacy vẫn tách khỏi phần báo giá mới theo dự án.

## 4. Các thực thể dữ liệu

| Thực thể | Trường chính và quy tắc |
|---|---|
| Organization | id, tên, tiền tệ VND, cấu hình phí/thuế mặc định |
| User / Membership | Đăng nhập email/mật khẩu, password_hash chỉ lưu phía server; userId, organizationId, tên, email, vai trò, trạng thái hoạt động |
| Project | id, organizationId, mã, tên, khách hàng, quản lý, ngày bắt đầu/kết thúc, trạng thái |
| ProjectMember | projectId, userId, vai trò dự án, quyền bổ sung được cấp rõ |
| KolProfile | dữ liệu hiện tại + organizationId, ownerId, version, archivedAt |
| KolPriceHistory | kolId, format, giá cũ/mới, nguồn, người cập nhật, thời điểm |
| QuoteVersion | projectId, quoteGroupId, số phiên bản, người tạo, trạng thái, agencyFee, discount, thuế, version chống ghi đè |
| QuoteItem | quoteVersionId, phase/pillar, loại chi phí, kolId hoặc nhà cung cấp, mô tả, format/nền tảng, số lượng, buyUnitPrice, sellUnitPrice, included |
| CostActual | projectId, quoteItemId tùy chọn, loại chi phí, giá trị, trạng thái dự kiến/đã cam kết/đã phát sinh, ngày, chứng từ tham chiếu |
| QuoteApproval | quoteVersionId, người gửi/duyệt, quyết định, ghi chú, thời điểm |
| AuditEvent | người thực hiện, tổ chức/dự án, hành động, bản ghi, thay đổi, thời điểm; không lưu khóa API |

Giá chưa biết dùng null; giá 0 dùng cho khoản miễn phí hoặc không thu khách có chủ đích. Không coi null là 0 để tuyên bố P&L hoàn chỉnh. Số lượng phải dương; dòng dự phòng chưa chọn dùng included=false, không cộng vào tổng. Cho phép cùng KOL có nhiều format/phase. Hai dòng được phân biệt bằng itemId, không chỉ bằng kolId.

Giá mua/bán trong báo giá là bản chụp tại thời điểm lập. Giá danh bạ thay đổi không tự sửa báo giá. Lưu nguồn giá và trạng thái đã xác nhận. Người dùng chủ động cập nhật giá khi đang ở bản nháp.

## 5. Công thức thống nhất

- Tiền đầu vào dòng = làm tròn VND(số lượng × đơn giá đầu vào).
- Tiền báo khách dòng = làm tròn VND(số lượng × đơn giá báo khách).
- Chênh lệch dòng = tiền báo khách dòng − tiền đầu vào dòng.
- Tổng hạng mục S = tổng tiền báo khách các dòng included.
- Chiết khấu D: cố định hoặc %, không âm và không lớn hơn S.
- Cơ sở fee B = S − D (đã xác nhận).
- Agency fee F = làm tròn VND(B × tỷ lệ fee) hoặc số tiền cố định; chỉ dùng một chế độ tại một thời điểm.
- Doanh thu trước thuế R = B + F.
- Tổng chi phí trực tiếp C = đầu vào KOL + đầu vào các hạng mục khác + chi phí nội bộ phát sinh chưa nằm trong các dòng.
- Lợi nhuận dự án P = R − C.
- Biên lợi nhuận = P/R; nếu R=0, hiển thị “Không áp dụng”.
- Thuế được tính riêng theo cấu hình được duyệt, không hardcode mức 8%. Không coi thuế thu khách là lợi nhuận. Quy tắc thuế/chi phí thuế không được khấu trừ cần người phụ trách kế toán xác nhận trước khi triển khai.
- Tổng khách thanh toán = doanh thu trước thuế + thuế tính trên báo giá.
- Chi phí actual gắn dòng là giá trị thay thế dự kiến của dòng khi xem thực tế, không cộng cả actual và dự kiến vào cùng một tổng.
- Nếu thiếu chi phí actual, P&L thực tế hiển thị “Chưa đủ dữ liệu”; có thể hiển thị forecast riêng nhưng phải ghi rõ chi phí còn dùng ước tính.

Ví dụ nghiệm thu: KOL mua 20 triệu/bán 25 triệu; seeding mua 5 triệu/bán 7 triệu. S=32 triệu, D=0, fee 12%=3,84 triệu. R=35,84 triệu, C=25 triệu, P=10,84 triệu, biên=30,2455%. Chi phí phát sinh nội bộ 2 triệu không thu khách làm C=27 triệu, P=8,84 triệu. Không tính lặp 2 triệu khi gắn chứng từ vào dòng đã có chi phí.

## 6. Quyền truy cập

| Quyền | Admin công ty | PM/Admin dự án | Booking |
|---|---|---|---|
| Phạm vi | Toàn công ty | Dự án được giao | Dự án được giao |
| Giá đầu vào | Có | Có | Có |
| Giá báo khách / P&L | Có | Có | Không |
| Creator, hợp đồng, lịch thanh toán | Có | Có | Trong dự án được giao |
| Thành viên dự án | Có | Có, không tự cấp quyền nhạy cảm cho Booking | Không |
| Tài khoản toàn công ty / restore backup | Có | Không | Không |

Admin công ty có quyền xem mọi dự án dù không cần gắn thành viên. Không giới hạn số Admin công ty hoặc thành viên mỗi vai trò trong dự án. Admin dự án (nếu được gắn vai trò này) chỉ quản lý dự án được giao, không trở thành Admin công ty.

Biên tập để phase sau. Chuẩn bị contentWorkflowEnabled theo dự án; tiến độ nội dung tách hợp đồng và thanh toán. Khi triển khai sẽ theo từng deliverable, không chỉ theo KOL.

Server xác thực cả quyền hành động và quyền đối với dự án/bản ghi. Không chỉ ẩn cột ở UI. Người thiếu quyền buyPrice/P&L không nhận trường đó trong API, export, log phản hồi hay dữ liệu AI. Đề xuất KOL theo giá mua cũng phải tuân theo quyền; không để lời giải thích AI/điểm ngân sách lộ giá mua.

Chưa có cơ chế nhận diện người dùng thì không bật dữ liệu tài chính dùng chung công khai. Không tạo tài khoản Admin mặc định với mật khẩu cố định.

## 7. Luồng báo giá và màn hình

- Nháp → Chờ duyệt → Đã duyệt → Đã gửi khách. Nhánh trả lại: Cần chỉnh sửa → Nháp.
- Chỉ nháp/cần chỉnh sửa được sửa; thay đổi bản đã duyệt tạo phiên bản mới và cần duyệt lại.
- Một phiên bản được chọn làm baseline đã chốt của dự án. Không cộng các phương án/phiên bản báo giá thành doanh thu nhiều lần.
- Báo giá nội bộ: phần hạng mục mua/bán, tổng phí/thuế, P&L, cảnh báo thiếu giá/lỗ, lịch sử duyệt.
- Bản khách: danh sách trường cho phép gồm tên công việc, số lượng, giá bán, phí, chiết khấu, thuế, điều khoản. Không xuất giá mua, margin, liên hệ thương lượng hoặc ghi chú nội bộ.
- P&L dự án: dự kiến / đã chốt / actual; chi phí trực tiếp theo nhóm; chênh lệch; mức độ đủ dữ liệu. Theo dõi công nợ/thu chi tiền là giai đoạn sau.

## 8. Chuyển dữ liệu cũ

1. Xuất backup local trước; thêm schemaVersion cho dữ liệu mới.
2. Nhập vào khu vực staging, gắn tổ chức và dự án, giữ id gốc để chống nhập trùng.
3. Giá donGia báo giá cũ giữ là giá bán đã ghi; đầu vào cũ đánh dấu chưa xác nhận. Không dùng giá hiện tại của KOL để bịa lịch sử chi phí.
4. phuPhi cũ giữ thành khoản thu cố định legacy; không tự biến thành agency fee theo %.
5. Báo giá cũ là legacy chưa có baseline P&L; yêu cầu xác nhận trước khi dùng để báo lợi nhuận.
6. Kiểm tra số lượng/tổng tiền, duyệt migration rồi mới công bố dữ liệu dùng chung. Không xóa localStorage ngay.

## 9. Tiêu chí nghiệm thu

- Tính đúng ví dụ mục 5; kiểm tra fee/discount/rounding/null/0 và chi phí chỉ nội bộ.
- Không đổi báo giá khi cập nhật giá danh bạ.
- Không tính actual/dự kiến hai lần; không cộng hai phiên bản báo giá.
- API và export không lộ giá mua/P&L cho người không có quyền.
- Chặn truy cập dự án khác dù sửa id trực tiếp; tài khoản bị khóa không dùng phiên cũ.
- Người tự gửi không tự duyệt trừ ngoại lệ Admin có audit.
- Dữ liệu cũ giữ tổng tiền và không được gán lợi nhuận giả.

## 10. Trạng thái triển khai nền tảng ngày 22/10/2026

Đã có src/domain/projects.ts (quy tắc quyền), src/domain/projectFinance.ts (bộ tính P&L trước thuế), database/migrations/001_project_access.sql (schema local) và tests/project-foundation.test.ts. Đăng nhập/dự án đã nối API/UI local. Mã local cũng đã có server/projectQuotes.ts và ProjectQuotesPanel.tsx cho phương án, phiên bản và baseline; đây là đối chiếu mã, chưa kiểm chứng vận hành trong lượt cập nhật này. KOL/SOW legacy chưa chuyển khỏi localStorage. Flow brief chung và Booking xác nhận giá trước khi PM lập phương án là mục tiêu tiếp theo.

Dự án có nhiều phương án KOL song song; mỗi phương án có nhiều phiên bản báo giá. Chỉ phương án/phiên bản đã chốt dùng làm baseline P&L dự án. Xem PROJECT-TO-QUOTE-FLOW.md để theo dõi sơ đồ và dashboard.

## 11. Flow hiện hành và thực thể bổ sung

Áp dụng bản tổng hợp đầu PROJECT-TO-QUOTE-FLOW.md: Project → brief/tiêu chí/danh sách KOL sơ bộ chung → Booking xác nhận giá → PM lập phương án → phiên bản → một FINAL/baseline. Không dùng số KOL trong brief để giới hạn kết quả tìm kiếm.

Thiết kế cần thể hiện ProjectBrief, ProjectCandidate (trạng thái giá, nguồn, thời điểm xác nhận), ProjectOption (projectId), QuoteVersion (optionId) và ProjectBaseline (projectId, quoteVersionId). Đây là quan hệ mục tiêu, không tuyên bố toàn bộ bảng đã tồn tại. Chưa chốt khóa cứng tạo phương án khi giá chưa xác nhận.
