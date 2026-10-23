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
-- Security (RLS), chỉ cho phép đọc/ghi khi request có phiên đăng nhập
-- Supabase Auth hợp lệ (auth.uid() khác NULL) — app.js bắt đăng nhập
-- email/mật khẩu trước khi gọi bất kỳ request nào. TẠM THỜI mọi tài khoản
-- đã đăng nhập đều có toàn quyền đọc/ghi/xoá như nhau (chưa phân quyền chi
-- tiết theo vai trò) — xem bảng "profiles" bên dưới để tạo tài khoản admin
-- đầu tiên và mục "Đăng nhập & phân quyền người dùng" trong README.md.
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
  -- Lương trực (khách Theo tuyến) — 3 cột riêng, không dùng chung với Phụ cấp đường dài
  standby_up_to_5         NUMERIC(14,2),
  standby_up_to_8         NUMERIC(14,2),
  standby_up_to_15        NUMERIC(14,2),
  -- Khách Theo km: cộng Phụ cấp đường dài cho mỗi ngày chạy trọn khách này
  long_haul_full_day      BOOLEAN,
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
-- LƯƠNG THEO TUYẾN
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

-- -----------------------------------------------------------------------------
-- CHỐT KỲ — mỗi kỳ đã chốt 1 dòng; "rows" là bản chụp bảng lương lúc chốt.
-- -----------------------------------------------------------------------------
CREATE TABLE period_locks (
  id         TEXT         PRIMARY KEY,
  period     CHAR(7)      NOT NULL UNIQUE,
  locked_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  locked_by  TEXT,
  rows       JSONB        NOT NULL DEFAULT '[]'::jsonb
);

-- -----------------------------------------------------------------------------
-- HỒ SƠ NGƯỜI DÙNG — 1-1 với auth.users (bảng có sẵn của Supabase Auth, chỉ
-- đọc chứ không tự tạo/sửa cấu trúc được). role='admin' có toàn quyền quản
-- lý tài khoản khác (xem/đổi quyền, khoá tài khoản) qua màn hình "Người
-- dùng" trong app; role='user' là nhân viên thường. Tài khoản MỚI đăng nhập
-- lần đầu (admin tạo qua Supabase Dashboard → Authentication → Add user) tự
-- có 1 dòng ở đây với role='user' nhờ trigger bên dưới.
-- -----------------------------------------------------------------------------
CREATE TABLE profiles (
  id         UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT         NOT NULL,
  full_name  TEXT,
  role       VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  is_active  BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- SECURITY DEFINER để tự bỏ qua RLS của chính bảng "profiles" khi tra cứu
-- bên trong hàm này — nếu không sẽ đệ quy vô hạn (policy của profiles lại
-- gọi is_admin(), is_admin() lại đọc profiles bị chính policy đó chặn).
CREATE FUNCTION is_admin() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin' AND is_active
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- Ai đã đăng nhập cũng xem được danh sách người dùng (chỉ email/quyền, không
-- nhạy cảm) nhưng CHỈ admin mới sửa được (đổi quyền/khoá tài khoản) — kể cả
-- tự sửa hồ sơ chính mình cũng bị chặn nếu không phải admin.
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY profiles_update_admin_only ON profiles FOR UPDATE
  USING (is_admin()) WITH CHECK (is_admin());

-- =============================================================================
-- ROW LEVEL SECURITY (11 bảng nghiệp vụ) — chặn mọi truy cập trừ khi request
-- có phiên đăng nhập Supabase Auth hợp lệ (auth.uid() khác NULL). TẠM THỜI
-- mọi tài khoản đã đăng nhập đều có toàn quyền như nhau — sau này muốn phân
-- quyền chi tiết hơn theo profiles.role thì chỉ cần sửa lại policy ở đây,
-- KHÔNG cần đổi gì bên app.js. Áp dụng đồng loạt bằng 1 vòng lặp cho gọn.
-- =============================================================================
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['customers','drivers','vehicles','routes',
    'allowance_types','allowance_configs','allowance_usage','trips',
    'deductions','fuel_logs','fuel_prices']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS app_secret_access ON %I;', tbl);
    EXECUTE format(
      'CREATE POLICY authenticated_full_access ON %I FOR ALL '
      || 'USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);',
      tbl
    );
  END LOOP;
END $$;

-- Chốt kỳ: ai đã đăng nhập cũng xem và chốt được, chỉ admin mới mở chốt (xoá).
ALTER TABLE period_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY period_locks_select ON period_locks FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY period_locks_insert ON period_locks FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY period_locks_delete_admin ON period_locks FOR DELETE
  USING (is_admin());

COMMIT;

-- Sau khi chạy xong file này: tạo tài khoản admin đầu tiên qua Supabase
-- Dashboard → Authentication → Add user (nhớ tick "Auto Confirm User"), rồi
-- chạy RIÊNG dòng dưới đây (sửa đúng email) để gán quyền admin cho tài
-- khoản đó — trước đó không ai có quyền admin nên không ai tự gán được:
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@vittrans.com';
