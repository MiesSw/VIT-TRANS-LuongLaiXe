# Hệ thống lương lái xe VIT TRANS

Web app tính lương lái xe: lương chuyến, lương tăng cường, phụ cấp, thưởng/phạt
nhiên liệu, khấu trừ — theo kỳ lương tháng dương lịch (mùng 1 → cuối tháng).
Chạy hoàn toàn phía trình duyệt, không cần cài đặt hay build gì.

## Chạy thử

Mở thẳng `index.html` bằng trình duyệt (double-click hoặc kéo vào tab mới).
Không cần server, không cần `npm install`.

- **Mở qua claude.ai** (Artifact): tự nhận biết và dùng dữ liệu dùng chung
  của công ty trên claude.ai (nhiều người xem cùng số liệu).
- **Mở trực tiếp file, đã cấu hình Supabase** (`SUPABASE_URL`/
  `SUPABASE_ANON_KEY` trong app.js khác rỗng): dùng chung dữ liệu thật trên
  Supabase (Postgres), **bắt đăng nhập email/mật khẩu** trước khi vào app —
  xem mục "Đăng nhập & phân quyền người dùng" dưới.
- **Mở trực tiếp file, chưa cấu hình Supabase**: dữ liệu lưu trong
  `localStorage` của trình duyệt máy đang mở, có sẵn dữ liệu mẫu ở lần chạy
  đầu để dùng thử ngay — chỉ máy đó thấy, không dùng chung được, không cần
  đăng nhập.

Chấm than nhỏ ở góc dưới thanh bên (chấm xanh/vàng) cho biết đang ở chế độ
nào. Vào mục **Hướng dẫn** trong app để xem hướng dẫn sử dụng đầy đủ và các
quy tắc tính lương đang áp dụng.

## Cấu trúc thư mục

```
index.html          Khung trang, chỉ load styles.css + app.js
styles.css          Toàn bộ giao diện (theme sáng/tối tự theo hệ điều hành)
app.js              Toàn bộ logic — 1 file duy nhất, không chia module
schema.sql          Schema PostgreSQL + dữ liệu MẪU (tham khảo/test cục bộ)
supabase_setup.sql  Schema PostgreSQL (không kèm dữ liệu mẫu) + RLS + đăng
                    nhập — chạy file này trong SQL Editor của Supabase khi
                    CÀI MỚI (database trống)
auth_migration.sql  Chỉ phần đăng nhập (RLS + bảng "profiles") — chạy file
                    này thay vì supabase_setup.sql khi NÂNG CẤP database
                    Supabase đang chạy thật (đã có dữ liệu)
```

Không có build tool, không có framework, không có `package.json` — thuần
HTML/CSS/JS, chạy được ngay khi mở file.

## Sao lưu dữ liệu

Vào **Hướng dẫn** → **Sao lưu dữ liệu** → **Tải file sao lưu (.json)** sau
mỗi kỳ chốt lương. Bản chạy offline (mở trực tiếp file) xoá dữ liệu duyệt
web là mất hết, nên cần tải file sao lưu định kỳ; bản chạy qua claude.ai vẫn
nên tải để giữ thêm 1 bản ngoài hệ thống.

## Tổng quan chức năng

**Cấu hình** (làm một lần, sửa khi chính sách đổi): Khách hàng (mỗi khách
hàng một cách tính lương chuyến — Theo tuyến / Theo km / Lương cứng cho lái
xe / Theo chuyến + bốc xếp), Lái xe, Xe, Bảng giá theo tuyến, Phụ cấp (đơn
giá riêng theo từng dự án, nhiều kiểu tính khác nhau).

**Vận hành** (hằng ngày): Lịch lái xe (nhập chuyến), Khấu trừ, Nhiên liệu
(xe khoán dầu), Chấm công phụ cấp. Đều hỗ trợ nhập hàng loạt từ Excel (tải
mẫu → điền → nhập lại).

**Chốt lương**: Bảng lương theo kỳ — mỗi lái xe một dòng, bấm vào xem chi
tiết từng khoản (Lương cố định / Lương chuyến + Tăng cường / Phụ cấp /
Thưởng-phạt nhiên liệu / Khấu trừ), xuất Excel hoặc CSV.

Chi tiết đầy đủ và các quy tắc tính (công thức, mốc tải trọng, ngày công
chuẩn…) xem trong mục **Hướng dẫn** của chính app — đó là nguồn tài liệu
chuẩn, README này chỉ tóm tắt để biết đường vào.

## Kiến trúc dữ liệu (app.js)

Toàn bộ trạng thái nằm trong một object `state` toàn cục, gồm các mảng:
`drivers`, `vehicles`, `routes`, `customers`, `allowanceTypes`,
`allowanceConfigs`, `allowanceUsage`, `trips`, `deductions`, `fuelLogs`,
`fuelPrices`. Lớp `db` trừu tượng hoá nơi lưu (claude.ai db thật,
`makeSupabaseDb()` nói chuyện với Postgres qua REST API của Supabase, hoặc
`makeLocalDb()` giả lập cùng API bằng `localStorage`) nên phần còn lại của
app không cần biết đang chạy ở chế độ nào. Vẽ lại giao diện qua
`scheduleRender()`/`render()`, không dùng framework nào.

## Về schema.sql / supabase_setup.sql

Hai file SQL cùng định nghĩa 1 schema Postgres giống nhau (10 bảng, khớp
1-1 với các collection trong `state`), khác mục đích:
- `schema.sql`: kèm dữ liệu MẪU (từ `SEED_DATA` trong app.js) — dùng để
  tham khảo cấu trúc hoặc test trên 1 Postgres cục bộ, KHÔNG dùng cho
  Supabase thật (sẽ lẫn dữ liệu giả vào dữ liệu công ty).
- `supabase_setup.sql`: KHÔNG có dữ liệu mẫu, có thêm khối bật Row Level
  Security (RLS) cho cả 10 bảng — đây là file cần dán vào **Supabase
  Dashboard → SQL Editor → Run** để tạo database thật.

App đã nối thẳng vào Supabase qua REST API (PostgREST) bằng 2 hằng số ở đầu
`makeSupabaseDb()` trong app.js: `SUPABASE_URL`, `SUPABASE_ANON_KEY` — không
cần backend riêng. Đặt cả 2 thành chuỗi rỗng để tắt hẳn, quay lại chạy
offline bằng `localStorage`.

## Đăng nhập & phân quyền người dùng

Khi chạy qua Supabase thật, app bắt đăng nhập email/mật khẩu (Supabase Auth)
trước khi cho vào — không còn dùng chung 1 "mật khẩu app" cho mọi người như
bản cũ (`x-app-secret`). Mỗi người 1 tài khoản riêng, Row Level Security
(RLS) trên Postgres chỉ cho phép đọc/ghi khi có phiên đăng nhập hợp lệ
(`auth.uid()` khác NULL) — xem `auth_migration.sql`/`supabase_setup.sql`.

**Tạo tài khoản mới** (chỉ admin làm, KHÔNG có nút "Đăng ký" trong app — tạo
tài khoản cần khoá bí mật của Supabase, không thể làm an toàn từ trình
duyệt): Supabase Dashboard → **Authentication → Add user**, nhập email +
mật khẩu, nhớ tick **Auto Confirm User**. Tài khoản đó đăng nhập lần đầu là
dùng được ngay, tự xuất hiện trong màn hình **Người dùng** của app (mục Cấu
hình, chỉ admin thấy) với quyền "Nhân viên".

**Tạo tài khoản admin đầu tiên**: sau khi tạo tài khoản như trên, vào SQL
Editor chạy:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'admin@vittrans.com';
```
(trước bước này chưa ai có quyền admin nên không ai tự gán được qua app).
Từ tài khoản admin đó, vào màn hình **Người dùng** để đổi quyền/khoá các
tài khoản khác — không cần đụng SQL nữa cho các lần sau.

**Tạm thời**: mọi tài khoản đã đăng nhập (dù quyền "Nhân viên" hay "Admin")
đều có toàn quyền đọc/ghi/xoá dữ liệu như nhau — riêng màn hình **Người
dùng** (đổi quyền, khoá tài khoản) thì chỉ admin vào được/sửa được. Muốn
phân quyền chi tiết hơn theo từng màn hình sau này thì sửa lại các policy
RLS trong Supabase (dựa vào `profiles.role`), không cần đổi gì bên app.js.

**Cài đặt lần đầu vào database trống**: `supabase_setup.sql` đã gộp sẵn phần
đăng nhập này, chạy 1 file là đủ. **Nâng cấp database đang chạy thật** (đã
có dữ liệu, đang dùng `x-app-secret` cũ): chạy `auth_migration.sql` thay vì
chạy lại `supabase_setup.sql` (sẽ báo lỗi trùng bảng).
