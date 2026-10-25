-- =============================================================================
-- NÂNG CẤP DATABASE SUPABASE — bản app.js ngày 23/10/2026
-- =============================================================================
-- Bản app.js này đổi tên cách tính lương chuyến "Theo chuyến + bốc xếp"
-- (tripPlusExtras) thành "Theo chuyến" — VẪN LÀ 1 CÁCH TÍNH RIÊNG, khác
-- "Theo tuyến" (chỉ khác tên gọi, cách tính giống nhau: tra đúng bảng
-- "Lương theo tuyến"). KHÔNG đổi calc_method của khách hàng nào (SGW, BHX
-- vẫn giữ nguyên "tripPlusExtras").
--
-- Thay đổi duy nhất: bỏ hẳn đơn giá bốc xếp riêng trên hồ sơ khách hàng và
-- ô "Số lượt bốc xếp" trên từng chuyến. Bốc xếp (nếu khách hàng có) giờ
-- tính qua Cấu hình › Phụ cấp (xem loại "Bốc xếp" mẫu có sẵn trong app,
-- unit "Theo chuyến") như mọi phụ cấp khác, không cộng thẳng vào Lương
-- chuyến nữa.
--
-- ⚠️ QUAN TRỌNG — ẢNH HƯỞNG LƯƠNG: sau khi chạy file này, các chuyến đã ghi
-- "Số lượt bốc xếp" sẽ KHÔNG còn được cộng thêm khoản bốc xếp vào Lương
-- chuyến nữa (app bản mới không tính khoản này theo cách cũ nữa). Khoản
-- bốc xếp của các kỳ CHƯA CHỐT sẽ giảm nếu chưa cấu hình Phụ cấp "Bốc xếp"
-- thay thế cho các khách hàng này — hãy vào Cấu hình › Phụ cấp, đặt đơn
-- giá bốc xếp cho từng khách hàng (SGW/BHX) TRƯỚC khi chạy file này, nếu
-- muốn giữ nguyên tổng lương các kỳ chưa chốt. Các kỳ ĐÃ CHỐT không bị ảnh
-- hưởng (Bảng lương đọc bản đã lưu lúc chốt).
--
-- CÁCH DÙNG: Supabase Dashboard → SQL Editor → dán TOÀN BỘ file này → Run.
-- Chạy lại lần 2 cũng không lỗi (chỉ update, không xoá bảng/cột nào).
-- =============================================================================

BEGIN;

-- Đơn giá bốc xếp cũ trên hồ sơ khách hàng không còn dùng nữa — xoá cho
-- khỏi để lại số liệu gây nhầm khi xem trực tiếp trong Supabase.
UPDATE customers SET loading_price = NULL
WHERE loading_price IS NOT NULL;

-- Số lượt bốc xếp đã ghi trên các chuyến cũ không còn ảnh hưởng tới lương
-- (app bản mới không đọc cột này nữa) — đặt về 0 cho khỏi để lại số liệu
-- gây nhầm khi xem trực tiếp trong Supabase. Dữ liệu các kỳ ĐÃ CHỐT không
-- bị ảnh hưởng vì Bảng lương đọc bản chụp đã lưu trong "period_locks",
-- không đọc lại từ bảng "trips" này.
UPDATE trips SET loading_count = 0
WHERE loading_count IS NOT NULL AND loading_count <> 0;

COMMIT;

-- Báo PostgREST (API của Supabase) đọc lại cấu trúc bảng ngay, không phải chờ.
NOTIFY pgrst, 'reload schema';
