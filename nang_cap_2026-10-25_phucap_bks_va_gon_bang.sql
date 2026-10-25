-- =============================================================================
-- NÂNG CẤP DATABASE SUPABASE — bản app.js ngày 25/10/2026
-- =============================================================================
-- Bản app.js này thêm cột MỚI cho bảng "Loại phụ cấp":
--   plates_by_project JSONB — "BKS áp dụng" riêng theo từng dự án, hiện ở
--   Cấu hình › Phụ cấp › Sửa, cạnh cột "Đơn giá" trong bảng "Đơn giá theo
--   từng dự án". Để trống thì dự án đó áp dụng cho MỌI xe chạy dự án (giữ
--   đúng hành vi cũ) — chỉ chọn vài BKS thì CHỈ những xe đó mới được tính
--   phụ cấp này. Chỉ áp dụng cho các đơn vị tính 1 số/dự án (Cố định theo
--   kỳ, Theo chuyến, Theo ngày công, Theo lần phát sinh, Vượt công tối
--   thiểu, Theo tỷ lệ ngày công, Theo giờ/lần phát sinh mỗi kỳ) — "Theo tải
--   trọng xe"/"theo km × tải trọng" không có cột này vì đã tự giới hạn theo
--   tải trọng xe.
--
-- CÁCH DÙNG: Supabase Dashboard → SQL Editor → dán TOÀN BỘ file này → Run.
-- Chạy lại lần 2 cũng không lỗi, không mất dữ liệu (chỉ thêm cột, không
-- xoá bảng/cột nào). Không chạy file này thì mọi loại phụ cấp vẫn tính
-- đúng như cũ (áp dụng cho mọi xe), chỉ là chưa lọc được theo BKS.
-- =============================================================================

BEGIN;

ALTER TABLE allowance_types
  ADD COLUMN IF NOT EXISTS plates_by_project JSONB;

COMMIT;

-- Báo PostgREST (API của Supabase) đọc lại cấu trúc bảng ngay, không phải chờ.
NOTIFY pgrst, 'reload schema';
