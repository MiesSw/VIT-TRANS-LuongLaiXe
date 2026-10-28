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

## Nâng cấp ngày 22/10/2026 (rà soát thao tác & câu chữ)

**Database Supabase đang chạy thật: chạy `nang_cap_2026-10_chot_ky.sql`
trong Supabase › SQL Editor TRƯỚC khi dùng app.js mới** (thêm 3 cột Lương
trực riêng, cột "Phụ cấp đường dài theo ngày", bảng `period_locks` cho Chốt
kỳ; chạy lại không lỗi, không mất dữ liệu). Chưa chạy thì lưu khách hàng và
Chốt kỳ sẽ báo "Database chưa được nâng cấp". Cài mới từ đầu thì chỉ cần
`supabase_setup.sql` (đã gộp sẵn).

Thay đổi chính: Chốt kỳ / Mở chốt kỳ (admin) ở Bảng lương; ô chọn có gõ tìm
không còn lưu nhầm giá trị cũ khi bấm Lưu ngay; nhập Excel chặn chuyến trùng,
Loại chuyến gõ sai, thiếu Số km; cảnh báo theo đúng kỳ đang xem; Lương trực
tách 3 ô riêng; Phụ cấp đường dài theo ngày thành tuỳ chọn của khách hàng (không
gắn cứng NTF); mốc tải trọng thống nhất "đến X tấn"; nhiên liệu tự lấy đầu kỳ
từ cuối kỳ trước; Hướng dẫn viết lại dạng gập/mở. Cách tính tiền các khoản
khác giữ nguyên.

## Nâng cấp ngày 23/10/2026 (đổi tên "Theo chuyến + bốc xếp" → "Theo chuyến")

Cách tính lương chuyến trước đây tên "Theo chuyến + bốc xếp" (khách SGW,
BHX) đổi tên thành **"Theo chuyến"** — vẫn là 1 lựa chọn RIÊNG, khác "Theo
tuyến" (2 khách hàng gọi khác nhau), nhưng cách tính giống nhau (tra đúng
bảng "Lương theo tuyến"). Khác biệt duy nhất: bỏ hẳn đơn giá bốc xếp riêng
trên hồ sơ khách hàng và ô "Số lượt bốc xếp" trên từng chuyến — bốc xếp
(nếu khách hàng có) giờ tính qua Cấu hình › Phụ cấp (loại "Bốc xếp" mẫu có
sẵn, unit "Theo chuyến") như mọi phụ cấp khác, không cộng thẳng vào Lương
chuyến nữa.

**Database Supabase đang chạy thật: chạy `nang_cap_2026-10-23_gop_bocxep.sql`
trong Supabase › SQL Editor** — xoá đơn giá bốc xếp cũ trên hồ sơ khách
hàng và số lượt bốc xếp cũ trên các chuyến (không còn dùng tới); KHÔNG đổi
cách tính của khách hàng nào (SGW/BHX vẫn giữ nguyên là "Theo chuyến",
không chuyển sang "Theo tuyến cố định").

⚠️ **Trước khi chạy file đó**, nếu muốn giữ nguyên tổng lương của các kỳ
**chưa chốt**: vào Cấu hình › Phụ cấp, đặt đơn giá bốc xếp cho SGW/BHX
(thay cho đơn giá bốc xếp cũ trên hồ sơ khách hàng) — vì sau khi chạy file
nâng cấp, các chuyến cũ có ghi "Số lượt bốc xếp" sẽ không còn tự cộng
khoản này vào Lương chuyến. Các kỳ **đã chốt** không bị ảnh hưởng (Bảng
lương đọc đúng bản đã lưu lúc chốt, không tính lại).

## Nâng cấp ngày 28/10/2026 (Xuất bảng công lái xe + Mẫu bảng công)

**Xuất bảng công lái xe** (Bảng lương › nút tài liệu): file Excel theo đúng
mẫu bảng công của công ty, **mỗi lái xe 1 sheet đặt theo họ tên** (xuất các
lái xe đang hiện theo bộ lọc Bảng lương — lọc 1 lái xe thì ra file riêng
người đó). Mỗi sheet gồm:

- Bảng theo ngày, mỗi chuyến ở Lịch lái xe 1 dòng: Ngày, BKS, Lái xe, Trạng
  thái (loại chuyến), Dự án (mã khách hàng), Tuyến (= **Tên tuyến** ở Lương
  theo tuyến; riêng NTF luôn ghi "Kho Nutifood Hưng Yên"), Chi tiết (tuyến
  đường; khách theo km ghi điểm đến; ngày Trực/Nghỉ ghi "Trực"/"Nghỉ"), Km,
  rồi 9 cột tiền: Lương cơ bản/Lương trực, Lương chuyến, Lương điểm, Tiền
  ăn, Bốc xếp, Bốc xếp thuê, Chờ giờ, Ăn đêm, Hỗ trợ qua đêm. Dòng "Cộng theo
  ngày" ở cuối bảng.
- Dưới bảng, mỗi khoản chỉ có 1 lần trong kỳ ghi 1 dòng: Phụ cấp điện thoại,
  Thâm niên, Khoán chi phí bảo quản xe, Tiền gửi xe, Thưởng giới thiệu lái
  xe, Truy thu/Truy lĩnh, Vé gửi xe, Dầu chạy tiết kiệm; các khoản chưa xếp
  cột nào ghi thành dòng "Phụ cấp khác: …".
- Dòng **TỔNG LƯƠNG** cuối cùng = đúng "Tổng thu nhập" của lái xe đó ở Bảng
  lương (chưa trừ Khấu trừ). Kỳ đã chốt lấy đúng số đã chốt.

**Cấu hình › Mẫu bảng công**: kéo thả từng khoản (Lương chuyến, Lương cứng
theo ngày, Lương trực, Phụ cấp rớt điểm, Phụ cấp thâm niên, Thưởng/phạt
nhiên liệu… và từng Loại phụ cấp ở Cấu hình › Phụ cấp) vào đúng cột muốn
ghi. Nhiều khoản cùng 1 cột thì cộng lại (VD "Phụ cấp ăn" + "Phụ cấp ăn NTF"
cùng vào cột Tiền ăn). Khoản chưa từng kéo tự gợi ý cột theo tên (có chữ
"ăn" → Tiền ăn, "bốc xếp thuê" → Bốc xếp thuê, "điện thoại" → Phụ cấp điện
thoại…). Khoản cả kỳ (VD phụ cấp cố định theo kỳ) mà xếp vào cột theo ngày
thì ghi ở chuyến đầu tiên của dự án đó.

File Excel xuất bằng thư viện ExcelJS (tải từ cdnjs khi bấm xuất lần đầu)
để giữ được font Times New Roman, viền ô, chữ đậm, dòng TỔNG LƯƠNG nền vàng
như file mẫu — máy cần có mạng lúc xuất.

**Database Supabase đang chạy thật: chạy `nang_cap_2026-10-28_mau_bang_cong.sql`
trong Supabase › SQL Editor** — thêm bảng `export_settings` để lưu cách xếp
cột dùng chung cho mọi tài khoản (chạy lại không lỗi, không đụng dữ liệu
cũ). Chưa chạy thì vẫn xuất bảng công được, chỉ là cách xếp cột tạm lưu
riêng trên từng máy.

## Sao lưu dữ liệu

Vào **Hướng dẫn** → **Sao lưu dữ liệu** → **Tải file sao lưu (.json)** sau
mỗi kỳ chốt lương. Bản chạy offline (mở trực tiếp file) xoá dữ liệu duyệt
web là mất hết, nên cần tải file sao lưu định kỳ; bản chạy qua claude.ai vẫn
nên tải để giữ thêm 1 bản ngoài hệ thống.

## Tổng quan chức năng

**Cấu hình** (làm một lần, sửa khi chính sách đổi): Khách hàng (mỗi khách
hàng một cách tính lương chuyến — Theo tuyến cố định / Theo chuyến / Theo
km / Lương cứng), Lái xe, Xe, Lương theo tuyến, Phụ cấp (đơn
giá riêng theo từng dự án, nhiều kiểu tính khác nhau).

**Vận hành** (hằng ngày): Lịch lái xe (nhập chuyến), Khấu trừ, Nhiên liệu
(xe khoán dầu), Chấm công phụ cấp. Đều hỗ trợ nhập hàng loạt từ Excel (tải
mẫu → điền → nhập lại).

**Chốt lương**: Bảng lương theo kỳ — mỗi lái xe một dòng, bấm vào xem chi
tiết từng khoản (Lương cố định / Lương chuyến + Tăng cường / Phụ cấp /
Thưởng-phạt nhiên liệu / Khấu trừ), Chốt kỳ (giữ nguyên số đã chốt, khoá sửa
dữ liệu kỳ đó), xuất Excel hoặc CSV.

Chi tiết đầy đủ và các quy tắc tính (công thức, mốc tải trọng, ngày công
chuẩn…) xem trong mục **Hướng dẫn** của chính app — đó là nguồn tài liệu
chuẩn, README này chỉ tóm tắt để biết đường vào.

## Kiến trúc dữ liệu (app.js)

Toàn bộ trạng thái nằm trong một object `state` toàn cục, gồm các mảng:
`drivers`, `vehicles`, `routes`, `customers`, `allowanceTypes`,
`allowanceConfigs`, `allowanceUsage`, `trips`, `deductions`, `fuelLogs`,
`fuelPrices`, `periodLocks`. Lớp `db` trừu tượng hoá nơi lưu (claude.ai db thật,
`makeSupabaseDb()` nói chuyện với Postgres qua REST API của Supabase, hoặc
`makeLocalDb()` giả lập cùng API bằng `localStorage`) nên phần còn lại của
app không cần biết đang chạy ở chế độ nào. Vẽ lại giao diện qua
`scheduleRender()`/`render()`, không dùng framework nào.

## Về schema.sql / supabase_setup.sql

Các file SQL định nghĩa schema Postgres khớp 1-1 với các collection trong
`state`, khác mục đích:
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

## Mã nguồn mở + tự cập nhật bản mới từ GitHub

Repo GitHub của app này (`MiesSw/VIT-TRANS-LuongLaiXe`) đang để **Public**
(công khai) — ai cũng xem/tải được, đúng tinh thần "mã nguồn mở". Nhờ vậy
người dùng cuối có thể tải app về dùng **mà không cần cài Python hay Git gì
cả**, và được tự động báo khi có bản mới.

### Người dùng cuối (tải về dùng lần đầu)

1. Vào tab **Releases** của repo trên GitHub (cột bên phải trang repo, hoặc
   `github.com/MiesSw/VIT-TRANS-LuongLaiXe/releases`).
2. Ở bản mới nhất, tải file **`VIT-TRANS-LuongLaiXe-full.zip`**.
3. Giải nén ra 1 thư mục bất kỳ, bấm đúp file **`VIT-TRANS-LuongLaiXe.exe`**
   bên trong để mở app. Không cần cài thêm gì.

Lần đầu mở, Windows có thể hiện cảnh báo "Windows protected your PC" (vì
file .exe chưa có chữ ký số trả phí) — bấm **More info → Run anyway** là mở
được bình thường, chỉ hỏi 1 lần.

### Cách app tự báo/cập nhật

Mỗi khi mở app (và mỗi 10 phút trong lúc đang mở), app tự hỏi GitHub xem có
bản phát hành mới hơn không. Nếu có, hiện 1 **thanh báo** ở đầu trang kèm
nút **"Cập nhật ngay"** — bấm vào đó, app tự tải đúng bản mới nhất về, thay
vào các file `index.html`/`app.js`/`styles.css`... trong thư mục đang chạy,
rồi tự tải lại trang. Không cần tải lại từ đầu, không cần Git.

Dữ liệu lương (ngày công, chuyến, lương...) không nằm trong các file này nên
**không bị ảnh hưởng** khi cập nhật — nó nằm ở `localStorage` trình duyệt
hoặc Supabase tuỳ chế độ đang chạy.

### Phía người duy trì code (đẩy bản mới lên)

Chỉ cần sửa `index.html`/`app.js`/`styles.css`..., rồi `commit` + `push` lên
nhánh `main` như bình thường (qua VS Code: Source Control → Commit → Sync
Changes). Không cần tự đóng gói .exe hay tự đăng Release — một quy trình tự
động trên GitHub (`.github/workflows/release.yml`, chạy bằng **GitHub
Actions**, miễn phí) sẽ tự:

1. Đóng gói `server.py` thành file `VIT-TRANS-LuongLaiXe.exe`.
2. Gom các file giao diện lại thành `app-content.zip` (dùng cho bản cập
   nhật) và `VIT-TRANS-LuongLaiXe-full.zip` (dùng cho người tải lần đầu).
3. Đăng cả 2 lên mục **Releases** của repo, đánh số phiên bản tự tăng dần
   (`v1`, `v2`, `v3`...).

Xem tiến trình đóng gói ở tab **Actions** trên trang GitHub của repo — mỗi
lần push sẽ có 1 lượt chạy mới, mất khoảng 1–2 phút.

### Chạy từ code gốc để tự kiểm tra trước khi đẩy lên (tuỳ chọn, dành cho
### người sửa code)

Có thể bấm đúp `Mo_ung_dung.bat` để mở app qua `server.py` ngay trên máy
đang sửa code (máy đó cần có sẵn Python) — dùng để tự xem thử trước khi
`commit`/`push`, không bắt buộc với người dùng cuối.
