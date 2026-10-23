-- =============================================================================
-- NÂNG CẤP DATABASE SUPABASE — bản app.js ngày 22/10/2026
-- =============================================================================
-- Bản app.js này cần thêm vào database đang chạy thật:
--   1. 3 cột "Lương trực" RIÊNG cho khách hàng Theo tuyến (trước đây Lương
--      trực dùng chung 3 cột long_haul_up_to_* với Phụ cấp đường dài).
--   2. Cột long_haul_full_day: khách Theo km nào được cộng Phụ cấp đường dài
--      cho mỗi ngày chạy trọn khách đó (trước đây gắn cứng mã NTF trong code).
--   3. Bảng period_locks cho chức năng "Chốt kỳ".
--
-- CÁCH DÙNG: Supabase Dashboard → SQL Editor → dán TOÀN BỘ file này → Run.
-- Chạy file này TRƯỚC khi dùng app.js mới. Chạy lại lần 2 cũng không lỗi,
-- không mất dữ liệu (chỉ thêm, không xoá bảng/cột nào).
-- Database cài MỚI từ supabase_setup.sql bản ngày 22/10/2026 thì KHÔNG cần
-- chạy file này (đã gộp sẵn).
-- =============================================================================

BEGIN;

-- 1 + 2. Cột mới của khách hàng ------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS standby_up_to_5    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS standby_up_to_8    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS standby_up_to_15   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS long_haul_full_day BOOLEAN;

-- Chuyển Lương trực đang nằm ở 3 cột Phụ cấp đường dài sang 3 cột riêng —
-- CHỈ khách hàng Theo tuyến (calc_method = 'route'), chỉ khi chưa chuyển.
-- Số tiền giữ nguyên, lương tính ra không đổi.
UPDATE customers SET
  standby_up_to_5  = long_haul_up_to_5,
  standby_up_to_8  = long_haul_up_to_8,
  standby_up_to_15 = long_haul_up_to_15,
  long_haul_up_to_5 = NULL, long_haul_up_to_8 = NULL, long_haul_up_to_15 = NULL
WHERE calc_method = 'route'
  AND standby_up_to_5 IS NULL AND standby_up_to_8 IS NULL AND standby_up_to_15 IS NULL
  AND (long_haul_up_to_5 IS NOT NULL OR long_haul_up_to_8 IS NOT NULL OR long_haul_up_to_15 IS NOT NULL);

-- Giữ đúng cách tính cũ: NTF được cộng Phụ cấp đường dài theo ngày chạy trọn.
UPDATE customers SET long_haul_full_day = true
WHERE code = 'NTF' AND long_haul_full_day IS NULL;

-- 3. Bảng Chốt kỳ --------------------------------------------------------------
-- Mỗi kỳ đã chốt 1 dòng; "rows" là bản chụp bảng lương lúc chốt (JSON).
CREATE TABLE IF NOT EXISTS period_locks (
  id         TEXT         PRIMARY KEY,
  period     CHAR(7)      NOT NULL UNIQUE,
  locked_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  locked_by  TEXT,
  rows       JSONB        NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE period_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS period_locks_select ON period_locks;
DROP POLICY IF EXISTS period_locks_insert ON period_locks;
DROP POLICY IF EXISTS period_locks_delete_admin ON period_locks;
-- Ai đã đăng nhập cũng xem và CHỐT được kỳ…
CREATE POLICY period_locks_select ON period_locks FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY period_locks_insert ON period_locks FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
-- …nhưng chỉ admin mới MỞ CHỐT (xoá dòng) được. Không cho sửa bản đã chốt.
CREATE POLICY period_locks_delete_admin ON period_locks FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND is_active));

COMMIT;

-- Báo PostgREST (API của Supabase) đọc lại cấu trúc bảng ngay, không phải chờ.
NOTIFY pgrst, 'reload schema';
