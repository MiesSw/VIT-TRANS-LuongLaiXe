-- =============================================================================
-- NÂNG CẤP DATABASE SUPABASE — bản app.js ngày 28/10/2026
-- =============================================================================
-- Bản app.js này thêm chức năng "Xuất bảng công lái xe" (Bảng lương › nút
-- tài liệu) và màn hình Cấu hình › "Mẫu bảng công" — kéo thả từng khoản
-- lương/phụ cấp vào đúng cột của file bảng công. Cách xếp cột được lưu
-- CHUNG cho mọi tài khoản trong bảng MỚI dưới đây (1 dòng duy nhất, id =
-- 'bangcong', cột "mapping" là JSON {"<khoản>": "<cột>"}).
--
-- Chưa chạy file này thì app vẫn chạy và vẫn xuất bảng công được bình
-- thường — chỉ là cách xếp cột tạm lưu trên từng máy (màn hình Mẫu bảng
-- công sẽ báo cần chạy file này).
--
-- CÁCH DÙNG: Supabase Dashboard → SQL Editor → dán TOÀN BỘ file này → Run.
-- Chạy lại lần 2 cũng không lỗi, không mất dữ liệu (chỉ thêm bảng mới,
-- không đụng tới bảng/cột nào đang có). Database cài MỚI từ
-- supabase_setup.sql bản ngày 28/10/2026 thì KHÔNG cần chạy file này.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS export_settings (
  id          TEXT         PRIMARY KEY,
  mapping     JSONB        NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by  TEXT
);

-- Giống các bảng nghiệp vụ khác: ai đã đăng nhập cũng xem/sửa được.
ALTER TABLE export_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_full_access ON export_settings;
CREATE POLICY authenticated_full_access ON export_settings FOR ALL
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;

-- Báo PostgREST (API của Supabase) đọc lại cấu trúc bảng ngay, không phải chờ.
NOTIFY pgrst, 'reload schema';
