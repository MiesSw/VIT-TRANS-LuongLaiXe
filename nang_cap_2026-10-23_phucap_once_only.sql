-- =============================================================================
-- NÂNG CẤP DATABASE SUPABASE — bản app.js ngày 23/10/2026
-- =============================================================================
-- Bản app.js này thêm 1 ô tích MỚI cho loại phụ cấp tính "Tự động theo dự
-- án — nhận trọn khi VƯỢT số ngày công tối thiểu" (perPeriodMinDays):
-- "Chỉ tính 1 lần/kỳ dù lái xe chạy nhiều dự án đều đủ điều kiện" (cột
-- once_only) — áp dụng cho "Phụ cấp điện thoại" (lái xe chỉ có 1 số điện
-- thoại, chạy 2 dự án đều đủ ngày công thì cũng chỉ nhận 1 lần, không nhân
-- đôi). Mặc định tắt (NULL/false) — các loại phụ cấp khác cùng đơn vị tính
-- này vẫn tính như cũ (mỗi dự án đủ điều kiện một lần) trừ khi bạn chủ động
-- tích ô mới này ở Cấu hình › Phụ cấp › Sửa.
--
-- CÁCH DÙNG: Supabase Dashboard → SQL Editor → dán TOÀN BỘ file này → Run.
-- Chạy lại lần 2 cũng không lỗi, không mất dữ liệu (chỉ thêm cột, không
-- xoá bảng/cột nào).
-- =============================================================================

BEGIN;

ALTER TABLE allowance_types
  ADD COLUMN IF NOT EXISTS once_only BOOLEAN;

-- Tự bật sẵn cho "Phụ cấp điện thoại" nếu đã có loại này (khớp theo tên,
-- không khớp được theo id vì mỗi database tự đặt id riêng) — chạy lại
-- không lỗi, không ghi đè nếu bạn đã tự tắt lại sau khi chạy lần đầu.
UPDATE allowance_types SET once_only = true
WHERE unit = 'perPeriodMinDays' AND name ILIKE '%điện thoại%' AND once_only IS NULL;

COMMIT;

-- Báo PostgREST (API của Supabase) đọc lại cấu trúc bảng ngay, không phải chờ.
NOTIFY pgrst, 'reload schema';
