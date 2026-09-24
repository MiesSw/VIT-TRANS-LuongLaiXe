-- =============================================================================
-- Hệ thống lương lái xe VIT TRANS — Setup cho Supabase (database THẬT)
-- =============================================================================
-- Khác với schema.sql (có kèm dữ liệu MẪU để tham khảo/test cục bộ), file
-- này CHỈ tạo bảng + bật RLS — KHÔNG chèn dữ liệu mẫu giả, vì đây sẽ là
-- database dùng thật, không muốn lẫn "Nguyễn Văn Bình"/"GHN" giả vào dữ
-- liệu công ty. Dữ liệu thật sẽ nhập trực tiếp qua app sau khi kết nối xong.
--
-- CÁCH DÙNG: mở Supabase Dashboard → SQL Editor → dán TOÀN BỘ file này →
-- Run. Chạy 1 lần duy nhất (chạy lại lần 2 sẽ báo lỗi "table already
-- exists" vì chưa có DROP TABLE — nếu cần làm lại từ đầu, tự xoá bảng cũ
-- trước hoặc báo tôi).
--
-- BẢO MẬT (đọc trước khi chạy): mọi bảng bên dưới đều bật Row Level
-- Security (RLS), chỉ cho phép đọc/ghi khi request kèm đúng header
-- "x-app-secret" — app.js đã tự gắn header này vào mọi request tới
-- Supabase. Đây là mức bảo vệ TẠM THỜI (không phải đăng nhập từng người
-- dùng thật) — ai có được cả 3 thứ (URL Supabase, anon key, VÀ đúng giá
-- trị secret) thì vẫn đọc/sửa được hết dữ liệu. Đủ để tránh việc chỉ cần
-- lộ anon key (vốn nằm công khai trong mọi app Supabase) là đọc/sửa được
-- ngay — nhưng KHÔNG thay thế được hệ thống đăng nhập thật nếu sau này cần
-- phân quyền theo từng người dùng.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- KHÁCH HÀNG — mỗi khách hàng một cách tính lương chuyến (calc_method)
-- -----------------------------------------------------------------------------
CREATE TABLE customers (
  code                    VARCHAR(20)   PRIMARY KEY,
  name                    TEXT          NOT NULL,
  calc_method             VARCHAR(20)   NOT NULL
                            CHECK (calc_method IN ('route','km','fixed','tripPlusExtras')),
  loading_price           NUMERIC(14,2),
  surge_inner_amount      NUMERIC(14,2),
  surge_outer_flat_amount NUMERIC(14,2),
  surge_outer_km_cap      NUMERIC(10,2),
  long_haul_up_to_5       NUMERIC(14,2),
  long_haul_up_to_8       NUMERIC(14,2),
  long_haul_up_to_15      NUMERIC(14,2),
  km_regions              JSONB
);

-- -----------------------------------------------------------------------------
-- XE — "id" là khoá chính ổn định; "plate" (biển số) có UNIQUE riêng vì có
-- thể đổi được (tính năng sửa BKS cascade sang trips/fuel_logs/drivers.plate).
-- Tạo TRƯỚC bảng "drivers" vì drivers.plate tham chiếu tới vehicles.plate.
-- -----------------------------------------------------------------------------
CREATE TABLE vehicles (
  id               SERIAL        PRIMARY KEY,
  plate            VARCHAR(20)   NOT NULL UNIQUE,
  capacity         NUMERIC(6,2),
  vehicle_type     VARCHAR(50),
  ownership        VARCHAR(30),
  home_project     VARCHAR(20)   REFERENCES customers(code) ON UPDATE CASCADE ON DELETE SET NULL,
  status           VARCHAR(20),
  fuel_management  VARCHAR(20)   NOT NULL DEFAULT 'unmanaged',
  fuel_norm        NUMERIC(8,2)
);

-- -----------------------------------------------------------------------------
-- LÁI XE — "plate" là xe lái xe này ĐANG CHỌN phụ trách (đúng 1 xe/lái xe).
-- Nhiều lái xe có thể cùng chọn 1 biển số (dùng chung xe theo ca) — chiều
-- gán nằm ở đây (drivers.plate), KHÔNG phải ở vehicles như bản trước.
-- -----------------------------------------------------------------------------
CREATE TABLE drivers (
  code                VARCHAR(20)  PRIMARY KEY,
  name                TEXT         NOT NULL,
  phone               VARCHAR(20),
  driver_type         VARCHAR(20),
  status              VARCHAR(20),
  has_fixed_salary    BOOLEAN      NOT NULL DEFAULT false,
  fixed_salary_amount NUMERIC(14,2),
  seniority_allowance NUMERIC(14,2),
  plate               VARCHAR(20)  REFERENCES vehicles(plate) ON UPDATE CASCADE ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- BẢNG GIÁ THEO TUYẾN
-- -----------------------------------------------------------------------------
CREATE TABLE routes (
  id               SERIAL        PRIMARY KEY,
  project          VARCHAR(20)   NOT NULL REFERENCES customers(code) ON UPDATE CASCADE,
  route_name       TEXT,
  route            VARCHAR(200)  NOT NULL,
  price            NUMERIC(14,2) NOT NULL,
  surcharge_price  NUMERIC(14,2),
  UNIQUE (project, route)
);

-- -----------------------------------------------------------------------------
-- LOẠI PHỤ CẤP
-- -----------------------------------------------------------------------------
CREATE TABLE allowance_types (
  id            TEXT          PRIMARY KEY,
  name          TEXT          NOT NULL,
  unit          VARCHAR(30)   NOT NULL,
  min_days      INTEGER,
  standard_days INTEGER,
  rates         JSONB         NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE allowance_configs (
  id                TEXT          PRIMARY KEY,
  target_type       VARCHAR(10)   NOT NULL DEFAULT 'driver',
  target_id         VARCHAR(20)   NOT NULL REFERENCES drivers(code) ON UPDATE CASCADE ON DELETE CASCADE,
  allowance_type_id TEXT          NOT NULL REFERENCES allowance_types(id) ON DELETE CASCADE,
  UNIQUE (target_type, target_id, allowance_type_id)
);

CREATE TABLE allowance_usage (
  id                TEXT          PRIMARY KEY,
  target_type       VARCHAR(10)   NOT NULL DEFAULT 'driver',
  target_id         VARCHAR(20)   NOT NULL REFERENCES drivers(code) ON UPDATE CASCADE ON DELETE CASCADE,
  allowance_type_id TEXT          NOT NULL REFERENCES allowance_types(id) ON DELETE CASCADE,
  period            CHAR(7)       NOT NULL,
  quantity          NUMERIC(10,2) NOT NULL DEFAULT 0,
  UNIQUE (target_type, target_id, allowance_type_id, period)
);

-- -----------------------------------------------------------------------------
-- CHUYẾN ĐI
-- -----------------------------------------------------------------------------
CREATE TABLE trips (
  id            TEXT          PRIMARY KEY,
  date          DATE          NOT NULL,
  trip_code     VARCHAR(20),
  driver_code   VARCHAR(20)   NOT NULL REFERENCES drivers(code) ON UPDATE CASCADE,
  plate         VARCHAR(20)   NOT NULL REFERENCES vehicles(plate) ON UPDATE CASCADE,
  project       VARCHAR(20)   NOT NULL REFERENCES customers(code) ON UPDATE CASCADE,
  route         VARCHAR(200)  NOT NULL DEFAULT '',
  origin        TEXT          NOT NULL DEFAULT '',
  destination   TEXT          NOT NULL DEFAULT '',
  km            NUMERIC(10,2),
  km_region     VARCHAR(50)   NOT NULL DEFAULT '',
  surge_zone    VARCHAR(10)   CHECK (surge_zone IN ('inner','outer')),
  loading_count INTEGER       NOT NULL DEFAULT 0,
  point_count   INTEGER,
  trip_type     VARCHAR(10)   NOT NULL DEFAULT 'normal'
                  CHECK (trip_type IN ('normal','surge','return','standby','point','off')),
  revenue       NUMERIC(14,2) NOT NULL DEFAULT 0,
  status        VARCHAR(20)   NOT NULL DEFAULT 'Hoàn thành'
);
CREATE INDEX idx_trips_driver_date ON trips(driver_code, date);
CREATE INDEX idx_trips_plate       ON trips(plate);
CREATE INDEX idx_trips_project     ON trips(project);

-- -----------------------------------------------------------------------------
-- KHẤU TRỪ
-- -----------------------------------------------------------------------------
CREATE TABLE deductions (
  id          TEXT          PRIMARY KEY,
  date        DATE          NOT NULL,
  driver_code VARCHAR(20)   NOT NULL REFERENCES drivers(code) ON UPDATE CASCADE,
  type        VARCHAR(30)   NOT NULL,
  amount      NUMERIC(14,2) NOT NULL,
  reason      TEXT
);
CREATE INDEX idx_deductions_driver_date ON deductions(driver_code, date);

-- -----------------------------------------------------------------------------
-- NHIÊN LIỆU
-- -----------------------------------------------------------------------------
CREATE TABLE fuel_logs (
  id           TEXT          PRIMARY KEY,
  plate        VARCHAR(20)   NOT NULL REFERENCES vehicles(plate) ON UPDATE CASCADE,
  period       CHAR(7)       NOT NULL,
  odo_start    NUMERIC(10,2),
  odo_end      NUMERIC(10,2),
  stock_start  NUMERIC(10,2),
  purchased    NUMERIC(10,2),
  stock_end    NUMERIC(10,2),
  UNIQUE (plate, period)
);

CREATE TABLE fuel_prices (
  id     TEXT          PRIMARY KEY,
  period CHAR(7)       NOT NULL UNIQUE,
  price  NUMERIC(10,2) NOT NULL
);

-- =============================================================================
-- ROW LEVEL SECURITY — chặn mọi truy cập trừ khi request kèm đúng header
-- "x-app-secret" (PostgREST đưa toàn bộ header của request vào GUC
-- "request.headers" dạng JSON, đọc được qua current_setting). Áp dụng đồng
-- loạt cho cả 11 bảng bằng 1 vòng lặp cho gọn.
-- =============================================================================
DO $$
DECLARE
  tbl text;
  app_secret text := 'hJBS2VJVRGLHnY20_noLzOUUaOPso2BH';
BEGIN
  FOREACH tbl IN ARRAY ARRAY['customers','drivers','vehicles','routes',
    'allowance_types','allowance_configs','allowance_usage','trips',
    'deductions','fuel_logs','fuel_prices']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS app_secret_access ON %I;', tbl);
    EXECUTE format(
      'CREATE POLICY app_secret_access ON %I FOR ALL '
      || 'USING (current_setting(''request.headers'', true)::json->>''x-app-secret'' = %L) '
      || 'WITH CHECK (current_setting(''request.headers'', true)::json->>''x-app-secret'' = %L);',
      tbl, app_secret, app_secret
    );
  END LOOP;
END $$;

COMMIT;
