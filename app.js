/* =========================================================================
   VIT TRANS — HỆ THỐNG TÍNH LƯƠNG LÁI XE
   Toàn bộ số tiền đều tra từ các bảng cấu hình (mỗi Khách hàng một cách tính
   lương chuyến — theo tuyến / theo km / lương cứng / theo chuyến + bốc xếp —
   cùng bảng đơn giá Khách hàng+Tuyến, phụ cấp theo lái xe, phụ cấp rớt điểm
   theo tải trọng xe áp dụng chung mọi khách hàng) — không hard-code trong code.
   Lưu trữ chạy được ở 2 chế độ, tự nhận biết:
     - Mở qua claude.ai  -> dữ liệu dùng chung, nhiều người thấy cùng số liệu.
     - Mở file trực tiếp -> lưu trong localStorage của trình duyệt đang mở.
   ========================================================================= */

/* ---------------------------- Danh mục dùng chung ---------------------------- */
const DRIVER_TYPES   = ['Chính thức','Thời vụ','Thử việc'];
const DRIVER_STATUS  = ['Đang làm việc','Tạm nghỉ','Đã nghỉ việc'];
const STATUS_RESIGNED = 'Đã nghỉ việc';
const VEHICLE_TYPES_HINT = ['Xe tải thùng','Xe đầu kéo','Xe ben','Xe container','Xe bồn'];
const OWNERSHIP_OPTS = ['Xe công ty','Xe thuê ngoài','Xe hợp tác'];
const VEHICLE_STATUS = ['Đang hoạt động','Bảo dưỡng','Ngừng chạy'];
// Xe "không khoán": cấp dầu theo thực tế, không thưởng/phạt nhiên liệu (công ty
// chỉ theo dõi km và nổ máy/nghỉ ngơi ngoài hệ thống này). Xe "khoán dầu": mỗi
// kỳ chấm km công tơ mét + tồn/đổ dầu ở mục Nhiên liệu để tự tính thưởng/phạt.
const FUEL_MANAGED = 'khoan';
const FUEL_UNMANAGED = 'khongkhoan';
const FUEL_MANAGEMENT_OPTS = [
  {v:FUEL_UNMANAGED, l:'Không khoán (cấp dầu theo thực tế)'},
  {v:FUEL_MANAGED,   l:'Khoán dầu (tự tính thưởng/phạt tiết kiệm)'},
];
// Chuyến "Huỷ" không tính lương — không còn ô chọn trạng thái trên form nữa
// (chuyến nhập sai thì xoá luôn), hằng số này chỉ còn để đọc đúng dữ liệu cũ.
const TRIP_CANCELLED = 'Huỷ';
// Loại chuyến: "Chuyến" dùng đơn giá thường của Khách hàng + Tuyến, "Tăng
// cường" dùng đơn giá/số tiền tăng cường riêng. "Trả hàng" và "Trực" LUÔN 0đ
// (xem tripUnitPrice/ZERO_REVENUE_TRIP_TYPES) — chỉ khác lý do: "Trả hàng"
// dùng để ghi lịch ngày hôm sau đi trả nốt hàng của chuyến lấy hàng hôm
// trước mà không kịp giao trong ngày (lương km/tuyến của lô hàng đó đã tính
// đủ ở chuyến "Chuyến" gốc rồi); "Trực" dùng để ghi ngày xe không chạy
// chuyến nào cả (trực chờ). Cả 2 đều không tính thêm tiền chuyến, chỉ cộng
// thêm 1 ngày công cho Lương cố định (nếu lái xe có Lương cố định). Riêng
// "Nghỉ" khác hẳn: xe không hoạt động và KHÔNG tính bất cứ khoản gì liên
// quan lương — kể cả ngày công cho Lương cố định (xem tripDaysCount) và số
// chuyến cho phụ cấp "Theo chuyến" (xem calcPhuCap) — chỉ để ghi nhận lịch
// xe nghỉ, không như Trực/Trả hàng vẫn được cộng 1 ngày công.
const TRIP_TYPES = [
  {v:'normal',  l:'Chuyến'},
  {v:'surge',   l:'Tăng cường'},
  {v:'return',  l:'Trả hàng'},
  {v:'standby', l:'Trực'},
  {v:'point',   l:'Trả điểm'},
  {v:'off',     l:'Nghỉ'},
];
const ZERO_REVENUE_TRIP_TYPES = ['return', 'standby', 'point', 'off'];
// Dữ liệu cũ chỉ có isSurge (boolean); chưa có tripType thì suy ra từ đó.
function tripTypeOf(t){ return t.tripType || (t.isSurge ? 'surge' : 'normal'); }
function isSurgeTrip(t){ return tripTypeOf(t) === 'surge'; }
function isOffTrip(t){ return tripTypeOf(t) === 'off'; }
// "Trả hàng"/"Trực"/"Trả điểm" — chuyến luôn 0đ, chỉ cộng ngày công cho Lương
// cố định. Riêng "Trả điểm" dùng để ghi 1 điểm giao thêm của đúng chuyến
// "Chuyến" cùng ngày/xe/khách hàng đứng trước nó (khi 1 lần chạy có nhiều
// điểm giao mà muốn hiện MỖI điểm là 1 dòng riêng trên Lịch lái xe thay vì
// gộp vào ô "Số điểm giao" của dòng "Chuyến" chính) — không cần Số km. Phụ
// cấp rớt điểm của cả lượt chạy được tính GỘP theo ngày/khách hàng, ghi theo
// 1 trong 2 cách đều ra tiền đúng (xem calcPointDropGroups — lấy giá trị lớn
// hơn giữa 2 cách, không cộng trùng cả 2 nếu ghi cả 2): (a) điền thẳng TỔNG
// số điểm vào ô "Số điểm giao" của dòng "Chuyến" chính (điểm đầu không
// tính, VD lượt có 4 điểm thì điền 4, tính tiền 3 điểm); hoặc (b) thêm mỗi
// điểm thêm 1 dòng "Trả điểm" riêng (không cần điền "Số điểm giao" ở các
// dòng này — mỗi dòng "Trả điểm" tự tính đúng 1 điểm, xem tripDroppedPoints)
// — lượt 4 điểm thì thêm 3 dòng "Trả điểm" đi kèm dòng "Chuyến" chính.
function isZeroRevenueTrip(t){ return ZERO_REVENUE_TRIP_TYPES.includes(tripTypeOf(t)); }
function tripTypeLabel(v){ return (TRIP_TYPES.find(x=>x.v===v)||{}).l || v; }
function tripTypeBadge(t){
  const type = tripTypeOf(t);
  const cls = type==='surge' ? 'pink' : type==='return' ? 'yellow' : type==='standby' ? 'neutral' : type==='point' ? 'good' : type==='off' ? 'outline' : 'blue';
  return `<span class="badge ${cls}">${esc(tripTypeLabel(type))}</span>`;
}
const DEDUCTION_TYPES= ['Tạm ứng','Phạt vi phạm','Bồi thường','Khác'];
// Mọi đơn vị đều áp dụng tự động theo dự án gốc của xe lái xe phụ trách —
// không cần gán riêng, chỉ cần dự án đó có đơn giá trong bảng của loại phụ
// cấp (xem calcPhuCap).
const ALLOWANCE_UNITS= [
  {v:'perPeriod', l:'Cố định theo kỳ'},
  {v:'perTrip',   l:'Theo chuyến (mọi chuyến được tính lương)'},
  {v:'perDay',    l:'Theo ngày công (tự động đếm ngày có chuyến)'},
  {v:'perOccurrence', l:'Theo lần phát sinh (nhập số lần mỗi kỳ)'},
  {v:'perPeriodMinDays', l:'Tự động theo dự án — đủ ngày công tối thiểu mới nhận trọn'},
  {v:'perProratedMonth', l:'Tự động theo dự án — theo tỷ lệ ngày công / công chuẩn'},
  {v:'perPeriodByCapacity', l:'Tự động theo dự án + tải trọng xe'},
  {v:'perTripByKmCapacity', l:'Tự động theo dự án — mỗi chuyến theo km × tải trọng xe'},
  {v:'perOccurrenceByProject', l:'Tự động theo dự án — nhập số giờ/lần phát sinh mỗi kỳ'},
];
function unitLabel(v){
  if(v==='perPoint') return 'Theo điểm rớt (tự động)';
  if(v==='perLongHaul') return 'Theo chuyến đường dài (tự động)';
  return (ALLOWANCE_UNITS.find(u=>u.v===v)||{}).l || v;
}
// Các mốc tải trọng dùng chung cho mọi loại phụ cấp tính theo tải trọng xe
// (đúng khớp mới có đơn giá — không suy rộng thành khoảng như Phụ cấp rớt điểm).
const CAPACITY_TIERS = [1.9, 5, 8, 15];
// Đơn giá của một loại phụ cấp áp dụng cho dự án (+ tải trọng xe nếu có) —
// dự án chưa cấu hình đơn giá riêng thì trả về null (không áp dụng, 0đ).
function allowanceRateFor(type, project, capacity){
  if(!type || !type.rates) return null;
  const entry = type.rates[project];
  if(entry==null) return null;
  if(type.unit==='perPeriodByCapacity'){
    if(capacity==null || !entry[capacity]) return null;
    return safeNum(entry[capacity]);
  }
  return safeNum(entry);
}
// Phụ cấp "mỗi chuyến theo km × tải trọng xe" (vd Phụ cấp ăn của NTF) — mỗi
// dự án có 1 bảng bậc thang km × tải trọng RIÊNG (rates[project] = {tiers,
// brackets}, đúng cấu trúc như 1 khu vực của khách hàng "Theo km" — xem
// kmBracketFor/kmTierIndexFor), tính cho TỪNG CHUYẾN của dự án đó trong kỳ
// rồi cộng lại — không phải 1 số cố định theo cả kỳ như các đơn vị tự động
// khác, vì mỗi chuyến có thể đi số km khác nhau. CHỈ áp dụng cho chuyến
// Loại "Chuyến" (normal) — Tăng cường/Trả hàng/Trực/Trả điểm đều không tính
// khoản này (theo đúng yêu cầu riêng cho Phụ cấp ăn Nutifood). Chuyến chạy
// đúng 1 Tuyến đường đã cấu hình giá cố định (vd "Trung chuyển kho
// nutifood" của NTF — xem findRoute/tripBasePrice) cũng KHÔNG tính khoản
// này dù có ghi Số km, vì đó là chuyến nội bộ giữa 2 kho, không phải chuyến
// giao hàng tính theo km thực tế.
function tripAllowanceByKmCapacity(at, trip){
  if(tripTypeOf(trip) !== 'normal') return 0;
  if(trip.route && findRoute(trip.project, trip.route)) return 0;
  const table = at.rates ? at.rates[trip.project] : null;
  if(!table) return 0;
  if(trip.km===null || trip.km===undefined || trip.km==='') return 0;
  const veh = vehicleByPlate(trip.plate);
  const capacity = veh ? veh.capacity : null;
  if(capacity==null) return 0;
  const tierIndex = kmTierIndexFor(table, capacity);
  if(tierIndex===-1) return 0;
  const bracket = kmBracketFor(table, safeNum(trip.km));
  if(!bracket || !bracket.rates) return 0;
  const rate = bracket.rates[tierIndex];
  return (rate==null || rate==='') ? 0 : safeNum(rate);
}
// "Theo ngày công" tự động đếm từ Chuyến đi (không cần nhập tay); chỉ
// "Theo lần phát sinh" mới cần chấm công tay mỗi kỳ.
function unitNeedsManualUsage(v){ return v==='perOccurrence' || v==='perOccurrenceByProject'; }

/* Mỗi khách hàng có một cách tính lương chuyến riêng. "route" và "km" dùng
   đơn giá tra theo Khách hàng (+ Tuyến với "route"); "fixed" nghĩa là lái xe
   ăn lương cứng nên chuyến chỉ ghi nhận vận hành, không cộng thêm lương;
   "tripPlusExtras" là lương/chuyến (tra theo Khách hàng + Tuyến) cộng thêm
   bốc xếp tính theo số lượng nhập trên từng chuyến. Phụ cấp rớt điểm (từ
   điểm giao thứ 2 trở đi, theo tải trọng xe) áp dụng chung cho MỌI khách
   hàng, không còn là đơn giá riêng theo từng khách hàng nữa — xem
   POINT_DROP_TIERS bên dưới. */
const CUSTOMER_CALC_METHODS = [
  {v:'route',          l:'Theo tuyến (đơn giá theo Khách hàng + Tuyến)'},
  {v:'km',              l:'Theo km (bậc thang km × tải trọng xe; tăng cường tính riêng theo Nội thành/Ngoại tỉnh)'},
  {v:'fixed',           l:'Lương cứng cho lái xe (chuyến không cộng thêm lương)'},
  {v:'tripPlusExtras',  l:'Theo chuyến + bốc xếp'},
];
function calcMethodLabel(v){ return (CUSTOMER_CALC_METHODS.find(m=>m.v===v)||{}).l || v; }

/* ---------------------------- Trạng thái ứng dụng ---------------------------- */
const state = {
  drivers:[], vehicles:[], routes:[], customers:[], allowanceTypes:[], allowanceConfigs:[],
  allowanceUsage:[], trips:[], deductions:[], fuelLogs:[], fuelPrices:[],
};
let db = null;                 // lớp lưu trữ (claude db hoặc localStorage)
let downloads = null;          // hộp thoại lưu file của claude.ai (nếu có)
let storageMode = 'local';     // 'cloud' | 'local' | 'fallback'
const CURRENT_SECTION_KEY = 'vittrans_current_section';
let currentSection = localStorage.getItem(CURRENT_SECTION_KEY) || 'payroll';
let appPeriod = null;          // kỳ lương dùng chung cho MỌI màn hình, dạng "YYYY-MM"
const expandedRows = new Set();
// Tick chọn hàng loạt ở "Chuyến đi" (Lịch lái xe) để xoá nhiều chuyến 1 lần
// — giữ nguyên qua các lần vẽ lại trang (đổi bộ lọc, sửa 1 chuyến khác...)
// giống cách "expandedRows" giữ trạng thái mở/đóng dòng ở Bảng lương.
const selectedTripIds = new Set();
// Modal đang mở có bảng bậc thang km × tải trọng (Sửa khách hàng / Cấu hình
// phụ cấp) đăng ký hook vào đây để cơ chế "giữ chuột ~1s để kéo đổi vị trí
// dòng/cột" dùng chung (bindKmDragReorder ở dưới) biết cách sync/đổi vị
// trí/vẽ lại đúng bản nháp đang mở — null khi không có bảng nào đang mở.
let activeKmGrid = null;
const filters = {
  payroll:{ driver:'', project:'', q:'' },
  trips:  { scope:'period', driver:'', project:'', q:'' },
  deduct: { scope:'period', driver:'', q:'' },
  routes: { project:'' },
  drivers: { q:'' },
  vehicles: { q:'' },
  customers: { q:'' },
};

/* ---------------------------- Tiện ích ---------------------------- */
function pad2(n){ return String(n).padStart(2,'0'); }
function safeNum(v){ const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function fmtMoney(n){ return Math.round(safeNum(n)).toLocaleString('vi-VN'); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Chuyển một chuỗi bất kỳ (biển số, khoá ghép...) thành id HTML an toàn, ổn định
// giữa các lần vẽ lại — dùng để giữ focus ô đang gõ khi trang render() lại.
function idSafe(s){ return String(s).replace(/[^A-Za-z0-9_-]/g, '_'); }
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
// Ngày lưu nội bộ luôn dạng YYYY-MM-DD (để so sánh/sắp xếp và cho input
// type="date"); mọi chỗ HIỂN THỊ cho người dùng đều qua hàm này để ra dd/mm/yyyy.
function fmtDate(iso){
  const m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso||'');
}
function distinct(arr){ return [...new Set(arr.filter(Boolean))]; }
// Sắp xếp theo ngày (chuỗi "YYYY-MM-DD" từ input type="date") mới nhất lên
// đầu — dùng chung cho mọi bảng liệt kê theo ngày (Chuyến đi, Khấu trừ, chi
// tiết chuyến trong Bảng lương) để đổi 1 chỗ là đổi hết.
function byDateDesc(a, b){ return String(b.date).localeCompare(String(a.date)); }

/* Kỳ lương theo THÁNG DƯƠNG LỊCH: một ngày bất kỳ thuộc kỳ mang nhãn đúng
   tháng đó, từ mùng 1 đến ngày cuối cùng của tháng. */
function getPeriod(dateStr){
  if(!dateStr) return null;
  const p = String(dateStr).split('-').map(Number);
  if(p.length<3 || !p[0]) return null;
  return p[0]+'-'+pad2(p[1]);
}
function daysInMonth(y, m){ return new Date(y, m, 0).getDate(); }
function periodBounds(period){
  const [y,m] = period.split('-').map(Number);
  const last = daysInMonth(y, m);
  return { from:`01/${pad2(m)}/${y}`, fromShort:`01/${pad2(m)}`, to:`${pad2(last)}/${pad2(m)}/${y}` };
}
function periodLabel(period){
  if(!period) return '—';
  const b = periodBounds(period);
  return `Kỳ ${b.from} – ${b.to}`;
}
function periodCaption(period){
  const b = periodBounds(period);
  return `${b.fromShort} – ${b.to}`;
}
// Chữ hiện trên ô chọn kỳ lương (thay cho input[type=month] gốc hiện tiếng
// Anh theo ngôn ngữ trình duyệt, VD "August 2026") — dạng tiếng Việt tự
// nhiên "Tháng 8 năm 2026", xem .period-display ở index.html/styles.css.
function periodLabelVi(period){
  if(!period) return '—';
  const [y,m] = period.split('-').map(Number);
  return `Tháng ${m} năm ${y}`;
}
function todayPeriod(){ return getPeriod(todayISO()); }
function shiftPeriod(period, delta){
  let [y,m] = period.split('-').map(Number); m += delta;
  while(m<1){ m+=12; y--; } while(m>12){ m-=12; y++; }
  return y+'-'+pad2(m);
}

function driverByCode(code){ return state.drivers.find(d=>d.code===code); }
function vehicleByPlate(plate){ return state.vehicles.find(v=>v.plate===plate); }
// Gán xe nằm trên hồ sơ LÁI XE (d.plate) — đúng 1 xe/lái xe. Ngược lại, 1 xe
// có thể được NHIỀU lái xe cùng chọn (dùng chung xe theo ca), nên chiều
// ngược lại (driversOfVehicle) trả về MẢNG, còn chiều này chỉ có 1 kết quả.
function vehicleOfDriver(code){
  const d = driverByCode(code);
  return d && d.plate ? vehicleByPlate(d.plate) : null;
}
function driversOfVehicle(plate){ return state.drivers.filter(d=>d.plate===plate); }
// Hiện danh sách lái xe đang chọn đúng biển số này (0, 1, hoặc nhiều lái xe
// dùng chung 1 xe theo ca) — dùng chung cho các màn hình liên quan tới xe
// (Danh sách xe, Nhiên liệu).
function vehicleDriversLabel(plate){
  const drivers = driversOfVehicle(plate);
  if(!drivers.length) return '<span class="muted">—</span>';
  return drivers.map(d=>esc(d.code)+' — '+esc(d.name)).join(', ');
}
function routesForProject(project){ return state.routes.filter(r=>r.project===project); }
function findRoute(project, route){ return state.routes.find(r=>r.project===project && r.route===route); }

// Bậc thang km × tải trọng xe cho khách hàng "Theo km" — mỗi khách hàng có
// tới 2 KHU VỰC CỐ ĐỊNH (kmRegions[], zone: 'inner'=Nội thành / 'outer'=
// Ngoại tỉnh — không còn đặt tên tuỳ ý như trước, vì trùng hẳn với "Khu vực"
// chọn trên chuyến tăng cường nên gộp làm MỘT để khỏi hỏi 2 lần cùng 1 câu),
// mỗi khu vực tự cấu hình các mốc tải trọng (tiers, thứ tự = cột) và các
// khoảng km (brackets[].kmMax = đến bao nhiêu km — để TRỐNG nghĩa là "trở
// lên, không giới hạn", dùng cho mốc cao nhất kiểu ">80km"; .rates khoá theo
// CHỈ SỐ cột chứ không theo giá trị tấn, để sửa số tấn không làm mất giá đã
// nhập), cấu hình ngay trong modal "Sửa khách hàng". Chỉ cấu hình 1 trong 2
// khu vực thì lái xe không cần chọn khu vực trên chuyến (tự dùng khu vực đó
// — xem length===1 bên dưới). Vượt mọi khoảng km đã cấu hình (khi không có
// mốc "không giới hạn"), tải trọng xe không khớp ĐÚNG mốc nào, hoặc chưa
// chọn đúng khu vực, đều coi là THIẾU ĐƠN GIÁ (không suy rộng/nội suy) để
// tránh trả sai — báo ở mục Kiểm tra dữ liệu thay vì tự đoán số tiền.
function kmRegionFor(cust, zone){
  const regions = (cust && cust.kmRegions) || [];
  if(regions.length === 1) return regions[0];
  return regions.find(r => r.zone === zone) || null;
}
function zoneLabel(zone){ return zone==='outer' ? 'Ngoại tỉnh' : zone==='inner' ? 'Nội thành' : 'chưa chọn khu vực'; }
function kmBracketFor(region, km){
  const brackets = (region && region.brackets) || [];
  const sorted = [...brackets].sort((a,b)=>{
    const av = (a.kmMax==null) ? Infinity : safeNum(a.kmMax);
    const bv = (b.kmMax==null) ? Infinity : safeNum(b.kmMax);
    return av-bv;
  });
  return sorted.find(b => b.kmMax==null || km <= safeNum(b.kmMax)) || null;
}
function kmTierIndexFor(region, capacity){
  const tiers = (region && region.tiers) || [];
  return tiers.findIndex(t => safeNum(t)===safeNum(capacity));
}
function kmBracketRateFor(cust, regionName, km, capacity){
  if(capacity==null || capacity==='') return null;
  const region = kmRegionFor(cust, regionName);
  if(!region) return null;
  const tierIndex = kmTierIndexFor(region, capacity);
  if(tierIndex===-1) return null;
  const bracket = kmBracketFor(region, km);
  if(!bracket || !bracket.rates) return null;
  const rate = bracket.rates[tierIndex];
  return (rate==null || rate==='') ? null : safeNum(rate);
}
// "Dự án" (project) trong dữ liệu chính là mã Khách hàng. Khách hàng chưa có
// cấu hình riêng (chưa vào mục "Khách hàng") vẫn liệt kê được ở đây, để không
// mất dữ liệu cũ, và mặc định coi như tính lương "Theo tuyến".
function allProjects(){
  return distinct(state.customers.map(c=>c.code)
    .concat(state.routes.map(r=>r.project))
    .concat(state.vehicles.map(v=>v.homeProject))
    .concat(state.trips.map(t=>t.project))).sort();
}
function customerByCode(code){ return state.customers.find(c=>c.code===code); }
function customerCalcMethod(code){ const c = customerByCode(code); return c ? c.calcMethod : 'route'; }
function tripsOfPeriod(period){ return state.trips.filter(t=>getPeriod(t.date)===period); }

/* =========================================================================
   CÔNG THỨC TÍNH LƯƠNG
   Quy ước: chuyến có trạng thái "Huỷ" KHÔNG được tính lương chuyến, lương
   tăng cường và không tính vào phụ cấp theo chuyến.
   ========================================================================= */

// (1) Lương cố định — khách hàng trả lương cứng thẳng cho lái xe (vd GS, SEWS),
//     cấu hình ngay trên hồ sơ Lái xe, không phụ thuộc xe nào cả. Trả theo tỷ
//     lệ ngày công thực tế / công chuẩn (26 ngày, như "Tiền ăn" perProratedMonth)
//     — nghỉ nhiều thì hưởng ít hơn mức lương cứng đã đặt, giống cách tính
//     phụ cấp "theo tỷ lệ ngày công / công chuẩn".
const FIXED_SALARY_STANDARD_DAYS = 26;
// Riêng lái xe chạy NTF (xe phụ trách có Khách hàng gốc = NTF) dùng công
// chuẩn 28 ngày thay vì 26 — theo đúng yêu cầu riêng cho dự án này. Xe đã
// "set chạy NTF" — hôm nào chỉ chạy tạm (Tăng cường) cho khách khác (VD
// BEST) thì KHÔNG được tính vào ngày công của lương cứng NTF; chỉ ngày nào
// có ít nhất 1 chuyến thật sự của NTF (Chuyến/Tăng cường/Trả hàng/Trực đều
// ghi Khách hàng = NTF) mới được tính.
const FIXED_SALARY_STANDARD_DAYS_NTF = 28;
// "Phụ cấp đường dài" theo NGÀY chạy NTF — cộng thêm vào Lương cố định một
// khoản tra theo bảng "Phụ cấp đường dài" của NTF (theo đúng tải trọng xe
// chạy ngày đó / 28 ngày, xem longHaulGroupTotal ở dưới), KHÔNG phụ thuộc
// lái xe có bật "Lương cứng" hay không vì đơn giá lấy từ cấu hình khách hàng
// NTF chứ không phải mức lương cứng của lái xe. Điều kiện kích hoạt khác
// nhau theo xe: (a) xe CÓ Khách hàng gốc = NTF thì MỌI ngày công NTF (đã
// tính ở workDays/ntfHomeDayTrips) đều được cộng; (b) xe KHÔNG có Khách hàng
// gốc = NTF nhưng có ngày được điều qua chạy RIÊNG cho NTF cả ngày (mọi
// chuyến trong ngày đó đều ghi Khách hàng = NTF, không xen lẫn khách khác,
// xem ntfOnlyDayTrips) thì chỉ những ngày đó mới được cộng.
function calcLuongCoDinh(driverCode, trips){
  const driver = driverByCode(driverCode);
  const veh = vehicleOfDriver(driverCode);
  const isNtf = !!(veh && veh.homeProject === 'NTF');
  const standardDays = isNtf ? FIXED_SALARY_STANDARD_DAYS_NTF : FIXED_SALARY_STANDARD_DAYS;
  const total = (driver && driver.hasFixedSalary) ? safeNum(driver.fixedSalaryAmount) : 0;
  const countedTrips = isNtf ? trips.filter(t=>t.project==='NTF') : trips;
  const workDays = tripDaysCount(countedTrips);
  const paidDays = Math.min(workDays, standardDays);
  const base = total ? Math.round(total * paidDays / standardDays) : 0;

  // "Phụ cấp đường dài" theo NGÀY: xe gốc NTF thì MỌI ngày công NTF (đã tính
  // vào workDays ở trên, xem ntfHomeDayTrips) đều được cộng; xe KHÔNG gốc
  // NTF thì chỉ ngày nào chạy TRỌN NGÀY riêng cho NTF mới được cộng (xem
  // ntfOnlyDayTrips) — cả 2 trường hợp cùng công thức tiền/ngày, khác điều
  // kiện kích hoạt theo đúng yêu cầu công ty. Làm tròn 1 lần trên tổng (xem
  // longHaulGroupTotal) để đủ 28 ngày ra đúng tròn mức tháng đã cấu hình.
  const ntfDayResult = longHaulGroupTotal(isNtf ? ntfHomeDayTrips(trips) : ntfOnlyDayTrips(trips), t=>{
    const cust = customerByCode('NTF');
    const veh = vehicleByPlate(t.plate);
    return cust ? longHaulMonthlyAmount(cust, veh ? veh.capacity : 0) : null;
  });
  const ntfDayQty = ntfDayResult.qty, ntfDayAmount = ntfDayResult.amount;

  if(!total && !ntfDayAmount) return { actual:0, total:0, workDays:0, standardDays, ntfDayQty:0, ntfDayAmount:0 };
  return { actual: base + ntfDayAmount, total, workDays, standardDays, ntfDayQty, ntfDayAmount };
}

// Đơn giá GỐC của một chuyến (chưa gồm bốc xếp), tuỳ theo cách tính
// lương của khách hàng (trip.project = mã khách hàng):
//   route / tripPlusExtras -> tra bảng Khách hàng + Tuyến, tăng cường dùng
//     "đơn giá tăng cường" của tuyến, để trống thì lấy đơn giá thường.
//   km      -> tra BẬC THANG theo Khu vực (trip.surgeZone: "inner"/"outer" —
//     DÙNG CHUNG đúng 1 ô "Khu vực" cho mọi loại chuyến, không hỏi riêng 2
//     lần nữa) × số km khai trên chuyến × tải trọng xe chạy chuyến đó (xem
//     kmBracketRateFor bên dưới, cấu hình ngay trong modal "Sửa khách
//     hàng"); chuyến tăng cường KHÔNG tra bậc thang đó (bậc thang dành cho
//     chuyến chính thức, số tiền lớn hơn nhiều) mà tra theo trip.surgeZone:
//     "inner" (Nội thành) trả đúng
//     "surgeInnerAmount" cố định; "outer" (Ngoại tỉnh) trả cố định
//     "surgeOuterFlatAmount" nếu số km ≤ "surgeOuterKmCap" (mặc định 200),
//     vượt ngưỡng thì tra ĐÚNG bảng bậc thang km × tải trọng xe (chuyến
//     thường) của khách hàng theo số km và tải trọng xe thực tế của chuyến.
//   fixed   -> lái xe đã ăn lương cứng theo kỳ, chuyến không cộng thêm lương.
// Trạng thái "Ngoại tỉnh × ngưỡng km" của MỘT chuyến tăng cường — dùng
// CHUNG cho tripSurgeKmPrice (tính đơn giá chuyến) và isLongHaulSurgeTrip
// (điều kiện phụ cấp đường dài) để 2 nơi không tính lệch ngưỡng nhau. Trả
// về null nếu chuyến không phải "Ngoại tỉnh" hoặc chưa nhập km.
function surgeOuterKmStatus(cust, trip){
  if((trip.surgeZone||'inner') !== 'outer') return null;
  if(trip.km === null || trip.km === undefined || trip.km === '') return null;
  const km = safeNum(trip.km);
  const cap = safeNum(cust.surgeOuterKmCap) || 200;
  return { km, cap, over: km > cap };
}
function tripSurgeKmPrice(cust, trip){
  const zone = trip.surgeZone || 'inner';
  if(zone === 'inner'){
    return (cust.surgeInnerAmount !== null && cust.surgeInnerAmount !== '' && cust.surgeInnerAmount !== undefined)
      ? safeNum(cust.surgeInnerAmount) : null;
  }
  const status = surgeOuterKmStatus(cust, trip);
  if(!status) return null;
  if(!status.over){
    return (cust.surgeOuterFlatAmount !== null && cust.surgeOuterFlatAmount !== '' && cust.surgeOuterFlatAmount !== undefined)
      ? safeNum(cust.surgeOuterFlatAmount) : null;
  }
  const veh = vehicleByPlate(trip.plate);
  return kmBracketRateFor(cust, 'outer', status.km, veh ? veh.capacity : null);
}
// Chỉ gọi cho chuyến "Chuyến"/"Tăng cường" — "Trả hàng" đã chặn về 0đ ngay
// từ tripUnitPrice, không bao giờ chạy tới hàm này.
function tripBasePrice(trip){
  const method = customerCalcMethod(trip.project);
  const surge = isSurgeTrip(trip);
  if(method === 'fixed') return 0;
  if(method === 'km'){
    const cust = customerByCode(trip.project);
    if(!cust) return null;
    if(surge) return tripSurgeKmPrice(cust, trip);
    // Khách "Theo km" có thể cấu hình RIÊNG 1 vài tuyến chạy giá cố định ở
    // "Bảng giá theo tuyến" (VD NTF có 1 tuyến cố định) — chuyến nào ghi
    // đúng Tuyến đường đã cấu hình thì ưu tiên dùng đơn giá tuyến đó, không
    // tra bậc thang km nữa; không khớp tuyến nào thì vẫn tính bậc thang km
    // như bình thường (xem routeCustomerCodes/findRoute).
    if(trip.route){
      const r = findRoute(trip.project, trip.route);
      if(r) return safeNum(r.price);
    }
    if(trip.km === null || trip.km === undefined || trip.km === '') return null;
    const veh = vehicleByPlate(trip.plate);
    return kmBracketRateFor(cust, trip.surgeZone, safeNum(trip.km), veh ? veh.capacity : null);
  }
  const r = findRoute(trip.project, trip.route);
  if(!r) return null;
  if(surge && r.surchargePrice !== undefined && r.surchargePrice !== '' && r.surchargePrice !== null){
    return safeNum(r.surchargePrice);
  }
  return safeNum(r.price);
}

// Phụ phí bốc xếp — chỉ áp dụng cho khách hàng tính "Theo chuyến + bốc xếp"
// (vd SGW, BHX), cộng thẳng vào Lương chuyến/Lương tăng cường của chuyến đó
// theo số lượt bốc xếp khai trên chuyến.
function tripExtrasAmount(trip){
  const cust = customerByCode(trip.project);
  if(!cust || cust.calcMethod !== 'tripPlusExtras') return 0;
  return safeNum(trip.loadingCount) * safeNum(cust.loadingPrice);
}
// Đơn giá đầy đủ của chuyến (gốc + phụ phí) — dùng để hiển thị và tính lương.
// (Phụ cấp rớt điểm KHÔNG nằm trong đơn giá chuyến — tính riêng ở calcPhuCap
// vì phụ thuộc tải trọng xe chạy chuyến, không phụ thuộc khách hàng.)
// "Trả hàng"/"Trực" luôn 0đ — xem ghi chú ở TRIP_TYPES. Ngày đó vẫn được
// tính là 1 ngày công riêng cho Lương cố định (xem tripDaysCount — đếm theo
// ngày, không phụ thuộc đơn giá chuyến).
function tripUnitPrice(trip){
  if(isZeroRevenueTrip(trip)) return 0;
  const base = tripBasePrice(trip);
  if(base === null) return null;
  return base + tripExtrasAmount(trip);
}

// Phụ cấp rớt điểm — áp dụng cho MỌI khách hàng có nhập "Số điểm giao" trên
// chuyến, không riêng khách hàng nào (thay thế hẳn cơ chế "đơn giá trả điểm"
// theo từng khách hàng trước đây của SGW/BHX). Điểm trả đầu tiên không tính
// rớt; từ điểm thứ 2 trở đi, mỗi điểm được cộng thêm theo tải trọng xe chạy
// chuyến đó. Các mốc tải trọng dưới đây được suy rộng thành khoảng liên tục
// (một tải trọng bất kỳ luôn tra được đơn giá — lấy mốc thấp nhất ≥ tải
// trọng xe; tải trọng vượt mốc cao nhất vẫn lấy đơn giá của mốc cao nhất) để
// không có xe nào bị bỏ sót vì không khớp đúng 3 mốc mẫu.
const POINT_DROP_TIERS = [
  { upToCapacity: 1.9, rate: 20000 },
  { upToCapacity: 5,   rate: 30000 },
  { upToCapacity: 15,  rate: 50000 },
];
function pointDropRateFor(capacity){
  const cap = safeNum(capacity);
  const tier = POINT_DROP_TIERS.find(t => cap <= t.upToCapacity);
  return tier ? tier.rate : POINT_DROP_TIERS[POINT_DROP_TIERS.length-1].rate;
}
// Số điểm được tính tiền rớt điểm của MỘT dòng chuyến, xét riêng lẻ (điểm
// giao đầu tiên không tính). Loại "Trả điểm" luôn tính đúng 1 điểm (đúng
// định nghĩa của loại này — xem TRIP_TYPES), không phụ thuộc "Số điểm giao"
// tự nhập trên chính dòng đó. Loại "Nghỉ" không tính khoản này (xe không
// hoạt động). Dùng cho preview 1 chuyến trên form; số tiền THẬT trả theo kỳ
// tính gộp theo nhóm ngày/khách hàng — xem calcPointDropGroups bên dưới (để
// không cộng trùng giữa dòng "Chuyến" chính và các dòng "Trả điểm" đi kèm).
function tripDroppedPoints(trip){
  if(isOffTrip(trip)) return 0;
  if(tripTypeOf(trip)==='point') return 1;
  return Math.max(0, safeNum(trip.pointCount) - 1);
}
function tripPointDropAmount(trip){
  const dropped = tripDroppedPoints(trip);
  if(!dropped) return 0;
  const veh = vehicleByPlate(trip.plate);
  return dropped * pointDropRateFor(veh ? veh.capacity : 0);
}
// Số điểm rớt THẬT trong kỳ, gộp theo nhóm (ngày, khách hàng) của mỗi lượt
// chạy — vì 1 lượt có thể ghi theo 1 trong 2 cách (hoặc cả 2, miễn khớp
// nhau): (a) điền thẳng TỔNG số điểm vào ô "Số điểm giao" của dòng "Chuyến"
// chính, hoặc (b) thêm mỗi điểm thêm 1 dòng "Trả điểm" riêng (không cần điền
// gì vào "Số điểm giao" của các dòng đó). Lấy giá trị LỚN HƠN giữa 2 cách
// cho mỗi nhóm — không cộng cả 2 vì cùng đại diện cho 1 số điểm rớt duy nhất
// của đúng lượt chạy đó.
function calcPointDropGroups(trips){
  const byGroup = {};
  trips.forEach(t=>{
    if(isOffTrip(t)) return;
    const key = t.date + '|' + t.project;
    (byGroup[key] = byGroup[key] || []).push(t);
  });
  const groups = [];
  Object.values(byGroup).forEach(group=>{
    const pointRows = group.filter(t=>tripTypeOf(t)==='point');
    const mainRows = group.filter(t=>tripTypeOf(t)!=='point');
    const mainDropped = mainRows.reduce((s,t)=>s + Math.max(0, safeNum(t.pointCount)-1), 0);
    const dropped = Math.max(mainDropped, pointRows.length);
    if(dropped<=0) return;
    groups.push({ trip: mainRows[0] || pointRows[0], dropped });
  });
  return groups;
}

// Phụ cấp đường dài — cấu hình RIÊNG CHO TỪNG khách hàng "Theo km" ở Cấu
// hình › Khách hàng › Sửa (3 ô "Phụ cấp đường dài theo tải trọng xe", để
// trống cả 3 = khách hàng đó không áp dụng — mặc định chỉ NTF có cấu hình).
// Tự động cộng thêm cho ngày phát sinh chuyến tăng cường Ngoại tỉnh VƯỢT
// NGƯỠNG km (xem tripSurgeKmPrice/surgeOuterKmCap): một khoản lương cứng
// tháng quy theo tải trọng xe chạy chuyến đó, chia đều cho 28 ngày công/
// tháng — cộng vào Phụ cấp, tách riêng khỏi Lương tăng cường để minh bạch
// từng khoản.
const LONG_HAUL_STANDARD_DAYS = 28;
function longHaulTiersFor(cust){
  return [
    { upToCapacity:5,  amount: cust.longHaulUpTo5 },
    { upToCapacity:8,  amount: cust.longHaulUpTo8 },
    { upToCapacity:15, amount: cust.longHaulUpTo15 },
  ].filter(t => t.amount!=null && t.amount!=='');
}
function customerHasLongHaulConfig(cust){
  return !!cust && longHaulTiersFor(cust).length>0;
}
function longHaulMonthlyAmount(cust, capacity){
  const tiers = longHaulTiersFor(cust);
  if(!tiers.length) return null;
  const cap = safeNum(capacity);
  const tier = tiers.find(t => cap <= t.upToCapacity);
  return safeNum(tier ? tier.amount : tiers[tiers.length-1].amount);
}
// Cộng dồn "Phụ cấp đường dài" cho 1 tập ngày/chuyến, làm tròn 1 LẦN trên
// tổng theo từng mức tháng (ứng với từng tải trọng xe) — KHÔNG làm tròn
// từng ngày/chuyến riêng lẻ rồi cộng, vì mức tháng chia 28 thường ra số lẻ
// (VD 6.800.000/28 ≈ 242.857, dư 0,14đ/ngày mất đi khi làm tròn); làm tròn
// từng đơn vị nhỏ rồi nhân lên sẽ lệch vài đồng so với đúng mức tháng đã
// cấu hình dù đủ tròn 28 ngày (VD ra 6.799.996đ thay vì tròn 6.800.000đ).
function longHaulGroupTotal(items, monthlyOf){
  const groups = {};
  items.forEach(item=>{
    const monthly = monthlyOf(item);
    if(!monthly) return;
    groups[monthly] = (groups[monthly]||0) + 1;
  });
  let qty = 0, amount = 0;
  Object.keys(groups).forEach(key=>{
    const monthly = Number(key), count = groups[key];
    qty += count;
    amount += Math.round(monthly * count / LONG_HAUL_STANDARD_DAYS);
  });
  return { qty, amount };
}
function isLongHaulSurgeTrip(trip){
  const cust = customerByCode(trip.project);
  if(!cust || cust.calcMethod!=='km' || !isSurgeTrip(trip)) return false;
  if(!customerHasLongHaulConfig(cust)) return false;
  const status = surgeOuterKmStatus(cust, trip);
  return !!status && status.over;
}
// Xe KHÔNG có Khách hàng gốc = NTF nhưng có ngày được điều qua chạy RIÊNG
// cho NTF cả ngày (mọi chuyến trong ngày đó đều ghi Khách hàng = NTF, không
// xen lẫn khách khác) — mỗi ngày như vậy cũng được cộng "Phụ cấp đường dài"
// y hệt công thức trên (tra theo đúng tải trọng xe chạy ngày đó / 28 ngày),
// chỉ khác điều kiện kích hoạt là theo NGÀY thay vì theo chuyến tăng cường
// vượt ngưỡng km. Trả về 1 chuyến đại diện mỗi ngày (để tra xe/tải trọng).
function ntfOnlyDayTrips(trips){
  const byDate = {};
  trips.forEach(t=>{ (byDate[t.date] = byDate[t.date] || []).push(t); });
  return Object.keys(byDate).filter(d => byDate[d].every(t=>t.project==='NTF')).map(d => byDate[d][0]);
}
// Xe CÓ Khách hàng gốc = NTF: MỌI ngày công NTF (đúng tập ngày đã tính vào
// workDays của Lương cố định ở calcLuongCoDinh — có ít nhất 1 chuyến ghi
// Khách hàng = NTF, kể cả Trực/Trả hàng/Trả điểm; "Nghỉ" không tính vì
// không phải ngày công) đều được cộng "Phụ cấp đường dài" y hệt công thức
// trên, không cần chờ có chuyến Tăng cường vượt ngưỡng km như trước — theo
// đúng yêu cầu: "cứ chạy NTF là được phụ cấp đường dài" khi NTF là khách
// hàng gốc. Trả về 1 chuyến đại diện mỗi ngày (để tra xe/tải trọng).
function ntfHomeDayTrips(trips){
  const byDate = {};
  trips.filter(t=>t.project==='NTF' && !isOffTrip(t)).forEach(t=>{ (byDate[t.date] = byDate[t.date] || []).push(t); });
  return Object.keys(byDate).map(d => byDate[d][0]);
}

// (2) Lương chuyến — cộng đơn giá các chuyến thường trong kỳ.
// (3) Lương tăng cường — cộng đơn giá các chuyến đánh dấu tăng cường, tách riêng.
function calcLuongChuyen(trips, surge){
  let total=0, missing=0;
  trips.filter(t=>isSurgeTrip(t) === surge).forEach(t=>{
    const price = tripUnitPrice(t);
    if(price===null) missing++; else total += price;
  });
  return { total, missing };
}

// Số ngày công trong kỳ = số ngày (khác nhau) mà lái xe có ít nhất 1 chuyến
// được tính lương (không tính chuyến Huỷ, không tính ngày "Nghỉ" — xe không
// hoạt động thì không phải ngày công) — lấy thẳng từ "Chuyến đi", không cần
// chấm công tay.
function tripDaysCount(trips){ return distinct(trips.filter(t=>!isOffTrip(t)).map(t=>t.date)).length; }

// "Thuộc dự án nào" (để tra đơn giá theo dự án) luôn lấy theo Khách hàng gốc
// (homeProject) của xe lái xe đang phụ trách — không phải chuyến chạy trong kỳ.
function driverHomeProject(driverCode){
  return (vehicleOfDriver(driverCode) || {}).homeProject || '';
}
function driverVehicleCapacity(driverCode){
  return (vehicleOfDriver(driverCode) || {}).capacity;
}

// (4) Phụ cấp — đơn giá nằm ở LOẠI phụ cấp, cấu hình riêng theo TỪNG DỰ ÁN
//     (mục Cấu hình › Phụ cấp) — dự án nào chưa có đơn giá thì không áp dụng.
//     MỌI loại đều áp dụng cho MỌI lái xe có dự án gốc của xe khớp bảng đơn
//     giá của loại đó, không còn bước tick gán riêng từng lái xe (đã bỏ theo
//     xác nhận thực tế: cùng dự án luôn hưởng giống nhau). Số lượng theo
//     từng đơn vị: "Cố định theo kỳ" -> 1 lần | "Theo chuyến" -> số chuyến
//     tính lương | "Theo ngày công"/"tỷ lệ ngày công" -> số ngày có chuyến
//     (tự động) | "Theo lần phát sinh"/"giờ mỗi kỳ" -> nhập tay ở Chấm công
//     phụ cấp | "đủ ngày công tối thiểu" -> ngưỡng ngày công | "theo tải
//     trọng xe"/"theo km" -> tra theo tải trọng/km thực tế của chuyến.
function calcPhuCap(driver, trips, period){
  const homeProject = driverHomeProject(driver.code);
  const capacity = driverVehicleCapacity(driver.code);
  const workDays = tripDaysCount(trips);
  const lines = [];
  let total = 0;

  // Phụ cấp thâm niên — đặt thẳng trên hồ sơ Lái xe (giống Lương cứng),
  // không qua hệ Loại phụ cấp/tick gán ở Cấu hình › Phụ cấp. Luôn nhận trọn
  // mức đã đặt mỗi kỳ, không phụ thuộc ngày công/số chuyến.
  const seniority = safeNum(driver.seniorityAllowance);
  if(seniority>0){
    lines.push({ name:'Phụ cấp thâm niên', target: driver.code, unit:'perPeriod', qty:1, rate:seniority, amount:seniority });
    total += seniority;
  }

  // Mọi loại phụ cấp áp dụng cho MỌI lái xe có dự án gốc của xe khớp bảng
  // đơn giá của loại đó — không có khái niệm "gán riêng từng lái xe" nữa
  // (cùng dự án luôn hưởng giống nhau, xác nhận với người dùng ngày
  // 2026-09-22). "perPeriod/perTrip/perDay" tự tính số lượng từ dữ liệu
  // chuyến; "perOccurrence" vẫn cần nhập tay ở Chấm công phụ cấp vì không có
  // dữ liệu chuyến để tự đếm (giống hệt perOccurrenceByProject).
  state.allowanceTypes.forEach(at=>{
    if(at.unit==='perPeriod'){
      const rate = allowanceRateFor(at, homeProject);
      if(rate===null) return;
      lines.push({ name: at.name, target: driver.code, unit:at.unit, qty:1, rate, amount:rate });
      total += rate;
    } else if(at.unit==='perTrip'){
      const rate = allowanceRateFor(at, homeProject);
      if(rate===null) return;
      const qty = trips.filter(t=>!isOffTrip(t)).length;
      if(qty<=0) return;
      const amount = rate * qty;
      lines.push({ name: at.name, target: driver.code, unit:at.unit, qty, rate, amount });
      total += amount;
    } else if(at.unit==='perDay'){
      const rate = allowanceRateFor(at, homeProject);
      if(rate===null) return;
      if(workDays<=0) return;
      const amount = rate * workDays;
      lines.push({ name: at.name, target: driver.code, unit:at.unit, qty:workDays, rate, amount });
      total += amount;
    } else if(at.unit==='perOccurrence'){
      const rate = allowanceRateFor(at, homeProject);
      if(rate===null) return;
      const usage = state.allowanceUsage.find(u=>u.targetType==='driver' && u.targetId===driver.code
        && u.allowanceTypeId===at.id && u.period===period);
      const qty = usage ? safeNum(usage.quantity) : 0;
      if(qty<=0) return;
      const amount = rate * qty;
      lines.push({ name: at.name, target: driver.code, unit:at.unit, qty, rate, amount });
      total += amount;
    } else if(at.unit==='perPeriodMinDays'){
      const rate = allowanceRateFor(at, homeProject);
      if(rate===null) return;
      const minDays = safeNum(at.minDays) || 15;
      if(workDays > minDays){
        lines.push({ name: at.name, target: driver.code, unit:at.unit, qty:1, rate, amount:rate });
        total += rate;
      }
    } else if(at.unit==='perProratedMonth'){
      const rate = allowanceRateFor(at, homeProject);
      if(rate===null) return;
      const standardDays = safeNum(at.standardDays) || 26;
      const paidDays = Math.min(workDays, standardDays);
      const amount = Math.round(rate * paidDays / standardDays);
      if(amount>0){
        lines.push({ name:`${at.name} (${homeProject})`, target: driver.code, unit:at.unit,
          qty: workDays, rate: Math.round(rate/standardDays), amount });
        total += amount;
      }
    } else if(at.unit==='perPeriodByCapacity'){
      const rate = allowanceRateFor(at, homeProject, capacity);
      if(rate===null) return;
      lines.push({ name: at.name, target: driver.code, unit:at.unit, qty:1, rate, amount:rate });
      total += rate;
    } else if(at.unit==='perTripByKmCapacity'){
      // Không dùng dự án gốc của xe — tính riêng cho TỪNG CHUYẾN vì mỗi
      // chuyến có thể đi số km khác nhau (dù cùng 1 dự án).
      let qty = 0, amount = 0;
      trips.forEach(t=>{
        const a = tripAllowanceByKmCapacity(at, t);
        if(a>0){ qty++; amount += a; }
      });
      if(amount>0){
        lines.push({ name: at.name, target: driver.code, unit:at.unit, qty, rate: Math.round(amount/qty), amount });
        total += amount;
      }
    } else if(at.unit==='perOccurrenceByProject'){
      // Tự động theo dự án gốc của xe (không cần tick gán), nhưng vẫn cần
      // nhập tay số giờ/lần phát sinh mỗi kỳ ở "Chấm công phụ cấp" — vì
      // không có dữ liệu chuyến để tự đếm (khác perPeriodMinDays/...).
      const rate = allowanceRateFor(at, homeProject);
      if(rate===null) return;
      const usage = state.allowanceUsage.find(u=>u.targetType==='driver' && u.targetId===driver.code
        && u.allowanceTypeId===at.id && u.period===period);
      const qty = usage ? safeNum(usage.quantity) : 0;
      if(qty<=0) return;
      const amount = rate * qty;
      lines.push({ name: at.name, target: driver.code, unit:at.unit, qty, rate, amount });
      total += amount;
    }
  });

  // Phụ cấp rớt điểm — riêng, gộp theo nhóm ngày/khách hàng (xem
  // calcPointDropGroups — lấy MAX giữa "Số điểm giao" trên dòng Chuyến
  // chính và số dòng "Trả điểm" đi kèm, không cộng trùng cả 2) rồi nhân theo
  // tải trọng xe chạy chuyến đó (không cấu hình theo dự án như trên).
  let droppedQty = 0, droppedAmount = 0;
  calcPointDropGroups(trips).forEach(({trip, dropped})=>{
    const veh = vehicleByPlate(trip.plate);
    droppedQty += dropped;
    droppedAmount += dropped * pointDropRateFor(veh ? veh.capacity : 0);
  });
  if(droppedQty>0){
    lines.push({ name:'Phụ cấp rớt điểm', target: driver.code, unit:'perPoint',
      qty: droppedQty, rate: Math.round(droppedAmount/droppedQty), amount: droppedAmount });
    total += droppedAmount;
  }

  // Phụ cấp đường dài — riêng, tự tính từ chuyến tăng cường Ngoại tỉnh vượt
  // ngưỡng km của khách hàng "Theo km" (xem isLongHaulSurgeTrip ở trên). 2
  // trường hợp đã được cộng khoản này theo NGÀY ở Lương cố định rồi nên bỏ
  // qua ở đây để không cộng trùng 2 lần cho cùng 1 ngày: (a) xe gốc NTF (xem
  // ntfHomeDayTrips) — MỌI chuyến NTF của xe này; (b) xe KHÔNG gốc NTF nhưng
  // có ngày chạy TRỌN NGÀY riêng cho NTF (xem ntfOnlyDayTrips) — mọi chuyến
  // trong đúng NGÀY đó, dù ngày đó có chuyến tăng cường vượt ngưỡng km hay
  // không (ngày đã được tính 1 lần ở Lương cố định rồi, không tính thêm theo
  // từng chuyến vượt ngưỡng trong chính ngày đó nữa). Làm tròn 1 lần trên
  // tổng (xem longHaulGroupTotal) để đủ 28 chuyến/tháng ra đúng tròn mức tháng.
  const ntfOnlyDates = homeProject!=='NTF' ? new Set(ntfOnlyDayTrips(trips).map(t=>t.date)) : null;
  const longHaulTrips = trips.filter(t=>!(homeProject==='NTF' && t.project==='NTF')
    && !(ntfOnlyDates && ntfOnlyDates.has(t.date)) && isLongHaulSurgeTrip(t));
  const longHaulResult = longHaulGroupTotal(longHaulTrips, t=>{
    const cust = customerByCode(t.project);
    const veh = vehicleByPlate(t.plate);
    return cust ? longHaulMonthlyAmount(cust, veh ? veh.capacity : 0) : null;
  });
  const longHaulQty = longHaulResult.qty, longHaulAmount = longHaulResult.amount;
  if(longHaulQty>0){
    lines.push({ name:'Phụ cấp đường dài (tăng cường ngoại tỉnh vượt ngưỡng km)', target: driver.code, unit:'perLongHaul',
      qty: longHaulQty, rate: Math.round(longHaulAmount/longHaulQty), amount: longHaulAmount });
    total += longHaulAmount;
  }
  return { total, lines };
}

// (5) Thưởng/phạt nhiên liệu — chỉ áp dụng xe "Khoán dầu"; xe "Không khoán"
// không thưởng/phạt (cấp dầu theo thực tế, công ty theo dõi km/nổ máy riêng).
function vehicleFuelLog(plate, period){ return state.fuelLogs.find(f=>f.plate===plate && f.period===period); }
function fuelPriceOf(period){ const p = state.fuelPrices.find(x=>x.period===period); return p ? safeNum(p.price) : 0; }

// Công thức khoán dầu, chấm theo từng xe mỗi kỳ (mục Nhiên liệu):
//   Tổng km          = Km công tơ mét cuối kỳ − đầu kỳ
//   Dầu định mức     = Tổng km × Định mức xe (lít/100km) / 100
//   Dầu chạy thực tế = Dầu tồn đầu kỳ + Dầu đổ trong kỳ − Dầu tồn cuối kỳ
//   Dầu tiết kiệm    = Dầu định mức − Dầu chạy thực tế  (âm = chạy vượt định mức)
//   Thưởng/phạt      = Dầu tiết kiệm × Đơn giá dầu của kỳ (âm = phạt, trừ vào lương)
function calcVehicleFuel(vehicle, period){
  const log = vehicleFuelLog(vehicle.plate, period);
  if(!log) return { vehicle, missing:true };
  const totalKm = safeNum(log.odoEnd) - safeNum(log.odoStart);
  const actualFuel = safeNum(log.stockStart) + safeNum(log.purchased) - safeNum(log.stockEnd);
  const normFuel = totalKm * safeNum(vehicle.fuelNorm) / 100;
  const savedFuel = normFuel - actualFuel;
  const price = fuelPriceOf(period);
  const amount = savedFuel * price;
  return { vehicle, missing:false, totalKm, actualFuel, normFuel, savedFuel, price, amount };
}
function fuelResultsForDriver(driverCode, period){
  const veh = vehicleOfDriver(driverCode);
  const lines = (veh && veh.fuelManagement === FUEL_MANAGED) ? [calcVehicleFuel(veh, period)] : [];
  const total = lines.reduce((s,l)=> s + (l.missing ? 0 : l.amount), 0);
  return { total, lines };
}

// (6) Khấu trừ — nhập tay, kỳ luôn suy ra từ ngày phát sinh (một nguồn sự thật).
function deductionsOf(driverCode, period){
  return state.deductions.filter(d=>d.driverCode===driverCode && getPeriod(d.date)===period);
}

// Tổng hợp một lái xe trong một kỳ: (1)+(2)+(3)+(4)+(5) = tổng thu nhập,
// trừ (6) ra thực nhận. Làm tròn đến đồng khi hiển thị/xuất file.
function calcPayrollForDriver(driver, period){
  const allTrips = state.trips.filter(t=>t.driverCode===driver.code && getPeriod(t.date)===period).sort(byDateDesc);
  const trips = allTrips.filter(t=>t.status !== TRIP_CANCELLED);
  const chuyen = calcLuongChuyen(trips, false);
  const tangCuong = calcLuongChuyen(trips, true);
  const phuCap = calcPhuCap(driver, trips, period);
  const fuel = fuelResultsForDriver(driver.code, period);
  const deductionLines = deductionsOf(driver.code, period).sort(byDateDesc);
  const coDinhInfo = calcLuongCoDinh(driver.code, trips);
  const coDinh = coDinhInfo.actual;
  const thuong = fuel.total;
  const khauTru = deductionLines.reduce((s,d)=>s+safeNum(d.amount),0);
  const tongThuNhap = coDinh + chuyen.total + tangCuong.total + phuCap.total + thuong;
  const missing = chuyen.missing + tangCuong.missing;
  const fuelMissing = fuel.lines.filter(l=>l.missing).length;
  const warnings = [];
  if(missing) warnings.push(`Thiếu đơn giá cho ${missing} chuyến — chưa cấu hình Khách hàng + Tuyến (hoặc thiếu số km) tương ứng`);
  if(fuelMissing) warnings.push(`Thiếu chấm nhiên liệu kỳ này cho ${fuelMissing} xe khoán dầu`);
  return {
    driver, period, trips,
    cancelled: allTrips.length - trips.length,
    surgeCount: trips.filter(isSurgeTrip).length,
    revenue: trips.reduce((s,t)=>s+safeNum(t.revenue),0),
    coDinh, coDinhInfo, chuyen: chuyen.total, tangCuong: tangCuong.total,
    phuCap: phuCap.total, phuCapLines: phuCap.lines,
    thuong, khauTru, tongThuNhap,
    thucNhan: tongThuNhap - khauTru,
    projects: distinct(trips.map(t=>t.project)),
    deductionLines, fuelLines: fuel.lines,
    warnings,
  };
}

// Bảng lương bỏ qua lái xe đã nghỉ việc mà không phát sinh gì trong kỳ,
// tránh trả lương cố định cho người đã nghỉ.
function payrollRows(period){
  return state.drivers
    .map(d=>calcPayrollForDriver(d, period))
    .filter(r => r.driver.status !== STATUS_RESIGNED
      || r.trips.length || r.cancelled || r.khauTru || r.thuong || r.coDinh || r.phuCap)
    .sort((a,b)=> String(a.driver.code).localeCompare(String(b.driver.code)));
}
function filteredPayrollRows(period){
  const f = filters.payroll, q = f.q.trim().toLowerCase();
  return payrollRows(period)
    .filter(r=> !f.driver || r.driver.code===f.driver)
    .filter(r=> !f.project || r.projects.includes(f.project)
      || (vehicleOfDriver(r.driver.code)||{}).homeProject===f.project)
    .filter(r=> !q || String(r.driver.code).toLowerCase().includes(q)
      || String(r.driver.name||'').toLowerCase().includes(q));
}

/* =========================================================================
   KIỂM TRA DỮ LIỆU — hiện ở đầu trang Bảng lương
   ========================================================================= */
function buildWarnings(){
  const w = [];
  const codeSeen = new Map();
  state.trips.forEach(t=>{
    const ref = `Chuyến ${t.tripCode||t.id} ngày ${fmtDate(t.date)}`;
    if(!driverByCode(t.driverCode)) w.push(`${ref}: mã lái xe "${t.driverCode}" không có trong danh sách lái xe.`);
    if(!vehicleByPlate(t.plate)) w.push(`${ref}: biển số "${t.plate}" không có trong danh sách xe.`);
    if(!customerByCode(t.project)) w.push(`${ref}: mã khách hàng "${t.project}" chưa có trong mục Khách hàng.`);
    const method = customerCalcMethod(t.project);
    const zeroRevenue = isZeroRevenueTrip(t); // Trả hàng/Trực luôn 0đ, không cần đủ Tuyến đường/km
    if(!zeroRevenue && (method==='route' || method==='tripPlusExtras') && !findRoute(t.project, t.route)){
      w.push(`${ref}: chưa có đơn giá cho "${t.project} — ${t.route}".`);
    }
    // Khách "Theo km" có thể có 1 vài tuyến chạy giá cố định ở "Lương theo
    // tuyến" (xem tripBasePrice) — chuyến nào đã khớp đúng tuyến đó thì tính
    // theo đơn giá tuyến, không cần Số km/Khu vực nữa nên bỏ qua các cảnh
    // báo dưới đây.
    const matchedKmRoute = (method==='km' && t.route) ? findRoute(t.project, t.route) : null;
    if(!zeroRevenue && method==='km' && !isSurgeTrip(t) && !matchedKmRoute){
      if(t.km===null || t.km===undefined || t.km===''){
        w.push(`${ref}: khách hàng tính theo km nhưng chuyến chưa nhập số km.`);
      }else{
        const veh = vehicleByPlate(t.plate);
        const cust = customerByCode(t.project);
        if(cust && (cust.kmRegions||[]).length>1 && !kmRegionFor(cust, t.surgeZone)){
          w.push(`${ref}: khách hàng có nhiều khu vực giá km nhưng chuyến chưa chọn đúng khu vực.`);
        }else if(veh && cust && kmBracketRateFor(cust, t.surgeZone, safeNum(t.km), veh.capacity)===null){
          w.push(`${ref}: chưa có đơn giá bậc thang km cho ${fmtMoney(t.km)}km / tải trọng ${veh.capacity} tấn — vào Cấu hình › Khách hàng › Sửa "${t.project}" để thêm.`);
        }
      }
    }
    if(method==='km' && isSurgeTrip(t)){
      const cust = customerByCode(t.project);
      if(cust && tripSurgeKmPrice(cust, t)===null){
        w.push(`${ref}: chưa cấu hình đủ đơn giá tăng cường (Nội thành/Ngoại tỉnh), chưa nhập số km, hoặc vượt ngưỡng km mà chưa có đơn giá bậc thang km cho đúng khoảng km/tải trọng xe này — vào Cấu hình › Khách hàng › Sửa "${t.project}" để thêm.`);
      }
    }
    if(t.tripCode) codeSeen.set(t.tripCode, (codeSeen.get(t.tripCode)||0)+1);
  });
  codeSeen.forEach((n,code)=>{ if(n>1) w.push(`Mã chuyến "${code}" bị trùng ở ${n} chuyến.`); });
  state.drivers.forEach(d=>{
    if(d.plate && !vehicleByPlate(d.plate)) w.push(`Lái xe ${d.code}: biển số phụ trách "${d.plate}" không tồn tại.`);
  });
  state.vehicles.forEach(v=>{
    if(v.fuelManagement===FUEL_MANAGED && !safeNum(v.fuelNorm)) w.push(`Xe ${v.plate}: khoán dầu nhưng chưa nhập định mức tiêu hao.`);
  });
  state.allowanceConfigs.forEach(c=>{
    if(!driverByCode(c.targetId)) w.push(`Gán phụ cấp: mã lái xe "${c.targetId}" không tồn tại.`);
  });
  state.deductions.forEach(d=>{ if(!driverByCode(d.driverCode)) w.push(`Khấu trừ ngày ${fmtDate(d.date)}: mã lái xe "${d.driverCode}" không tồn tại.`); });
  state.fuelLogs.forEach(f=>{ if(!vehicleByPlate(f.plate)) w.push(`Chấm nhiên liệu kỳ ${f.period}: biển số "${f.plate}" không tồn tại.`); });
  const pairs = new Map();
  state.routes.forEach(r=>{ const k=r.project+' — '+r.route; pairs.set(k,(pairs.get(k)||0)+1); });
  pairs.forEach((n,k)=>{ if(n>1) w.push(`Trùng cấu hình đơn giá cho "${k}" (${n} dòng).`); });
  return w;
}

/* =========================================================================
   LƯU TRỮ — tự chọn giữa dữ liệu dùng chung (claude.ai) và localStorage
   ========================================================================= */
const COLLECTIONS = {
  drivers:'drivers', vehicles:'vehicles', routes:'routes', customers:'customers', allowanceTypes:'allowanceTypes',
  allowanceConfigs:'allowanceConfigs', allowanceUsage:'allowanceUsage', trips:'trips',
  deductions:'deductions', fuelLogs:'fuelLogs', fuelPrices:'fuelPrices',
};
const LOCAL_DB_KEY = 'vittrans_payroll_db_v8';

/* Dữ liệu mẫu minh hoạ, chỉ nạp khi chạy offline lần đầu (localStorage trống)
   để mở lên là thấy ngay hệ thống hoạt động. Không phải số liệu thật. */
const SEED_DATA = {
  customers: {
    GHN:{code:'GHN',name:'CÔNG TY CỔ PHẦN DỊCH VỤ GIAO HÀNG NHANH',calcMethod:'route'},
    BEST:{code:'BEST',name:'CÔNG TY TNHH BEST EXPRESS (VIỆT NAM)',calcMethod:'route'},
    // kmRegions: tới 2 khu vực CỐ ĐỊNH (zone: 'inner'/'outer'), mỗi khu vực
    // có tiers riêng (cột theo tải trọng tấn, thứ tự cố định) và brackets
    // riêng (kmBrackets[].rates khoá theo CHỈ SỐ cột 0,1,2… tương ứng, không
    // theo giá trị tấn; kmMax=null = "không giới hạn", dùng cho mốc cao
    // nhất). NTF (mẫu) chỉ cấu hình 1 khu vực nên lái xe không cần chọn khu
    // vực khi nhập chuyến thường.
    NTF:{code:'NTF',name:'CÔNG TY CỔ PHẦN THỰC PHẨM DINH DƯỠNG NUTIFOOD VIỆT NAM',calcMethod:'km',
      surgeInnerAmount:250000, surgeOuterFlatAmount:300000, surgeOuterKmCap:200,
      longHaulUpTo5:4000000, longHaulUpTo8:6000000, longHaulUpTo15:6800000,
      kmRegions:[{ zone:'outer', tiers:[5,10,15], brackets:[
        {kmMax:80,  rates:{0:1000000, 1:1200000, 2:1500000}},
        {kmMax:120, rates:{0:1500000, 1:1800000, 2:2200000}},
        {kmMax:200, rates:{0:2500000, 1:3000000, 2:3600000}},
        {kmMax:null, rates:{0:3500000, 1:4200000, 2:5000000}},
      ]}]},
    GS:{code:'GS',name:'CÔNG TY TNHH GREAT STAR VIỆT NAM',calcMethod:'fixed'},
    SGW:{code:'SGW',name:'CHI NHÁNH CÔNG TY TNHH SG SAGAWA VIỆT NAM TẠI HÀ NỘI',calcMethod:'tripPlusExtras',loadingPrice:80000},
    SEWS:{code:'SEWS',name:'CÔNG TY TNHH SEWS-COMPONENTS VIỆT NAM',calcMethod:'fixed'},
    BHX:{code:'BHX',name:'CÔNG TY CỔ PHẦN THƯƠNG MẠI BÁCH HÓA XANH',calcMethod:'tripPlusExtras',loadingPrice:70000},
  },
  drivers: {
    LX01:{code:'LX01',name:'Nguyễn Văn Bình',phone:'0912345001',driverType:'Chính thức',status:'Đang làm việc',plate:'29H-111.11'},
    LX02:{code:'LX02',name:'Trần Văn Cường',phone:'0912345002',driverType:'Chính thức',status:'Đang làm việc',plate:'51C-222.22'},
    LX03:{code:'LX03',name:'Lê Văn Dũng',phone:'0912345003',driverType:'Chính thức',status:'Đang làm việc',plate:'51D-333.33'},
    LX04:{code:'LX04',name:'Phạm Văn Em',phone:'0912345004',driverType:'Thời vụ',status:'Đang làm việc',hasFixedSalary:true,fixedSalaryAmount:9000000,plate:'30F-444.44'},
    LX05:{code:'LX05',name:'Hoàng Văn Phúc',phone:'0912345005',driverType:'Chính thức',status:'Đang làm việc',plate:'29C-555.55'},
    LX06:{code:'LX06',name:'Vũ Văn Giang',phone:'0912345006',driverType:'Chính thức',status:'Tạm nghỉ',hasFixedSalary:true,fixedSalaryAmount:8500000,plate:'30G-666.66'},
    LX07:{code:'LX07',name:'Đặng Văn Hải',phone:'0912345007',driverType:'Chính thức',status:'Đang làm việc',plate:'51H-777.77'},
  },
  vehicles: {
    '29H-111.11':{plate:'29H-111.11',capacity:5,vehicleType:'Xe tải thùng',ownership:'Xe công ty',homeProject:'GHN',fuelManagement:FUEL_MANAGED,fuelNorm:22,status:'Đang hoạt động'},
    '51C-222.22':{plate:'51C-222.22',capacity:5,vehicleType:'Xe tải thùng',ownership:'Xe công ty',homeProject:'BEST',fuelManagement:FUEL_UNMANAGED,status:'Đang hoạt động'},
    '51D-333.33':{plate:'51D-333.33',capacity:10,vehicleType:'Xe tải thùng',ownership:'Xe thuê ngoài',homeProject:'NTF',fuelManagement:FUEL_MANAGED,fuelNorm:28,status:'Đang hoạt động'},
    '30F-444.44':{plate:'30F-444.44',capacity:8,vehicleType:'Xe tải thùng',ownership:'Xe công ty',homeProject:'GS',fuelManagement:FUEL_UNMANAGED,status:'Đang hoạt động'},
    '29C-555.55':{plate:'29C-555.55',capacity:5,vehicleType:'Xe tải thùng',ownership:'Xe công ty',homeProject:'SGW',fuelManagement:FUEL_UNMANAGED,status:'Đang hoạt động'},
    '30G-666.66':{plate:'30G-666.66',capacity:8,vehicleType:'Xe tải thùng',ownership:'Xe công ty',homeProject:'SEWS',fuelManagement:FUEL_UNMANAGED,status:'Đang hoạt động'},
    '51H-777.77':{plate:'51H-777.77',capacity:5,vehicleType:'Xe tải thùng',ownership:'Xe công ty',homeProject:'BHX',fuelManagement:FUEL_UNMANAGED,status:'Đang hoạt động'},
  },
  routes: {
    rt1:{project:'GHN',route:'Hà Nội – Hải Phòng',price:900000,surchargePrice:1100000},
    rt2:{project:'GHN',route:'Hà Nội – Bắc Ninh',price:500000,surchargePrice:null},
    rt3:{project:'BEST',route:'TP.HCM – Bình Dương',price:700000,surchargePrice:850000},
    rt4:{project:'BEST',route:'TP.HCM – Đồng Nai',price:750000,surchargePrice:null},
    rt5:{project:'SGW',route:'Hà Nội – Vĩnh Phúc',price:600000,surchargePrice:null},
    rt6:{project:'BHX',route:'TP.HCM – Long An',price:650000,surchargePrice:750000},
  },
  allowanceTypes: {
    // Đơn giá theo TỪNG dự án (mã Khách hàng) — dự án nào không có dòng ở
    // đây thì lái xe thuộc dự án đó không được tính loại phụ cấp này.
    at_an:{name:'Ăn ca', unit:'perDay',
      rates:{GHN:50000,BEST:50000,NTF:50000,GS:50000,SGW:50000,SEWS:50000,BHX:50000}},
    at_luutru:{name:'Lưu trú', unit:'perDay',
      rates:{GHN:150000,BEST:150000,NTF:150000,GS:150000,SGW:150000,SEWS:150000,BHX:150000}},
    at_bocxep:{name:'Bốc xếp', unit:'perTrip',
      rates:{GHN:80000,BEST:80000,NTF:80000,GS:80000,SGW:80000,SEWS:80000,BHX:80000}},
    at_chohang:{name:'Chờ hàng', unit:'perPeriod',
      rates:{GHN:200000,BEST:200000,NTF:200000,GS:200000,SGW:200000,SEWS:200000,BHX:200000}},
    at_tangca:{name:'Tăng ca', unit:'perOccurrence',
      rates:{GHN:100000,BEST:100000,NTF:100000,GS:100000,SGW:100000,SEWS:100000,BHX:100000}},
    at_cadem:{name:'Ca đêm', unit:'perOccurrence',
      rates:{GHN:60000,BEST:60000,NTF:60000,GS:60000,SGW:60000,SEWS:60000,BHX:60000}},
    at_dienthoai:{name:'Phụ cấp điện thoại', unit:'perPeriodMinDays', minDays:15,
      rates:{GHN:100000,BEST:100000,NTF:100000,GS:100000,SGW:100000,SEWS:100000,BHX:100000}},
    at_tienan:{name:'Tiền ăn', unit:'perProratedMonth', standardDays:26,
      rates:{GS:1260000, SEWS:1000000}},
    at_baoquanxe:{name:'Phụ cấp bảo quản xe', unit:'perPeriodByCapacity',
      rates:{GS:{1.9:300000, 5:500000, 8:800000}}},
    at_guixe:{name:'Phụ cấp gửi xe', unit:'perPeriodByCapacity',
      rates:{GS:{1.9:400000, 5:400000, 8:500000}}},
  },
  // Bảng này còn giữ lại để tương thích dữ liệu cũ (xem calcPhuCap) — mọi
  // phụ cấp giờ áp dụng thẳng theo dự án gốc của xe, không còn cần gán tay.
  allowanceConfigs: {},
  trips: {
    tr01:{date:'2026-08-20',tripCode:'CD01',driverCode:'LX01',plate:'29H-111.11',project:'GHN',route:'Hà Nội – Hải Phòng',origin:'Hà Nội',destination:'Hải Phòng',isSurge:false,revenue:1500000,status:'Hoàn thành'},
    tr02:{date:'2026-08-22',tripCode:'CD02',driverCode:'LX01',plate:'29H-111.11',project:'GHN',route:'Hà Nội – Bắc Ninh',origin:'Hà Nội',destination:'Bắc Ninh',isSurge:false,revenue:900000,status:'Hoàn thành'},
    tr03:{date:'2026-09-01',tripCode:'CD03',driverCode:'LX01',plate:'29H-111.11',project:'GHN',route:'Hà Nội – Hải Phòng',origin:'Hà Nội',destination:'Hải Phòng',tripType:'normal',revenue:1500000,status:'Hoàn thành'},
    tr03b:{date:'2026-09-02',tripCode:'CD03B',driverCode:'LX01',plate:'29H-111.11',project:'GHN',route:'Hà Nội – Hải Phòng',origin:'Hải Phòng',destination:'Hà Nội',tripType:'return',revenue:0,status:'Hoàn thành'},
    tr04:{date:'2026-09-05',tripCode:'CD04',driverCode:'LX01',plate:'29H-111.11',project:'BEST',route:'TP.HCM – Bình Dương',origin:'TP.HCM',destination:'Bình Dương',tripType:'surge',revenue:1200000,status:'Hoàn thành'},

    tr05:{date:'2026-08-25',tripCode:'CD05',driverCode:'LX02',plate:'51C-222.22',project:'BEST',route:'TP.HCM – Bình Dương',origin:'TP.HCM',destination:'Bình Dương',isSurge:false,revenue:1300000,status:'Hoàn thành'},
    tr06:{date:'2026-09-02',tripCode:'CD06',driverCode:'LX02',plate:'51C-222.22',project:'BEST',route:'TP.HCM – Đồng Nai',origin:'TP.HCM',destination:'Đồng Nai',isSurge:false,revenue:1400000,status:'Hoàn thành'},
    tr07:{date:'2026-09-07',tripCode:'CD07',driverCode:'LX02',plate:'51C-222.22',project:'BEST',route:'TP.HCM – Bình Dương',origin:'TP.HCM',destination:'Bình Dương',isSurge:false,revenue:1300000,status:'Hoàn thành'},

    tr08:{date:'2026-08-28',tripCode:'CD08',driverCode:'LX03',plate:'51D-333.33',project:'NTF',route:'',origin:'Bình Dương',destination:'Long An',isSurge:false,km:110,revenue:2000000,status:'Hoàn thành'},
    tr09:{date:'2026-09-03',tripCode:'CD09',driverCode:'LX03',plate:'51D-333.33',project:'NTF',route:'',origin:'Bình Dương',destination:'Cần Thơ',isSurge:false,km:180,revenue:3000000,status:'Hoàn thành'},
    tr10:{date:'2026-09-06',tripCode:'CD10',driverCode:'LX03',plate:'51D-333.33',project:'NTF',route:'',origin:'Bình Dương',destination:'Vũng Tàu',isSurge:true,km:null,revenue:2500000,status:'Hoàn thành'},

    tr11:{date:'2026-09-05',tripCode:'CD11',driverCode:'LX04',plate:'30F-444.44',project:'GS',route:'',origin:'KCN Sóng Thần',destination:'Nội thành',isSurge:false,revenue:900000,status:'Hoàn thành'},
    tr12:{date:'2026-09-08',tripCode:'CD12',driverCode:'LX04',plate:'30F-444.44',project:'GS',route:'',origin:'KCN Sóng Thần',destination:'Nội thành',isSurge:false,revenue:900000,status:'Hoàn thành'},

    tr13:{date:'2026-09-04',tripCode:'CD13',driverCode:'LX05',plate:'29C-555.55',project:'SGW',route:'Hà Nội – Vĩnh Phúc',origin:'Hà Nội',destination:'Vĩnh Phúc',isSurge:false,loadingCount:2,pointCount:5,revenue:1000000,status:'Hoàn thành'},
    tr14:{date:'2026-09-09',tripCode:'CD14',driverCode:'LX05',plate:'29C-555.55',project:'SGW',route:'Hà Nội – Vĩnh Phúc',origin:'Hà Nội',destination:'Vĩnh Phúc',isSurge:false,loadingCount:1,pointCount:3,revenue:1000000,status:'Hoàn thành'},

    tr15:{date:'2026-09-02',tripCode:'CD15',driverCode:'LX06',plate:'30G-666.66',project:'SEWS',route:'',origin:'KCN Bắc Thăng Long',destination:'Nội thành',isSurge:false,revenue:850000,status:'Hoàn thành'},

    tr16:{date:'2026-09-07',tripCode:'CD16',driverCode:'LX07',plate:'51H-777.77',project:'BHX',route:'TP.HCM – Long An',origin:'TP.HCM',destination:'Long An',isSurge:false,loadingCount:1,pointCount:8,revenue:1100000,status:'Hoàn thành'},
    tr17:{date:'2026-09-10',tripCode:'CD17',driverCode:'LX07',plate:'51H-777.77',project:'BHX',route:'TP.HCM – Long An',origin:'TP.HCM',destination:'Long An',isSurge:false,loadingCount:2,pointCount:6,revenue:1100000,status:'Đang chạy'},
  },
  deductions: {
    dd1:{date:'2026-08-25',driverCode:'LX02',type:'Tạm ứng',amount:2000000,reason:'Tạm ứng lương giữa kỳ'},
    dd2:{date:'2026-09-02',driverCode:'LX04',type:'Phạt vi phạm',amount:500000,reason:'Chậm giao hàng'},
  },
  fuelLogs: {
    fl1:{plate:'29H-111.11',period:'2026-09',odoStart:15000,odoEnd:15600,stockStart:15,purchased:120,stockEnd:15},
    fl2:{plate:'51D-333.33',period:'2026-09',odoStart:8000,odoEnd:8500,stockStart:10,purchased:150,stockEnd:8},
  },
  fuelPrices: {
    fp1:{period:'2026-09',price:20000},
  },
  allowanceUsage: {
    au2:{targetType:'driver',targetId:'LX01',allowanceTypeId:'at_tangca',period:'2026-09',quantity:3},
    au4:{targetType:'driver',targetId:'LX05',allowanceTypeId:'at_cadem',period:'2026-09',quantity:4},
  },
};

function lsLoadAll(){ try{ return JSON.parse(localStorage.getItem(LOCAL_DB_KEY)) || {}; }catch(e){ return {}; } }
function lsSaveAll(all){ localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(all)); }
function lsMintId(){ return 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

/* Lớp lưu trữ localStorage, cùng bộ hàm với db của claude.ai nên phần còn
   lại của ứng dụng không cần biết đang chạy ở chế độ nào. */
function makeLocalDb(){
  const listeners = {};
  function notify(path){ (listeners[path]||new Set()).forEach(fn=>fn()); }
  return {
    collection(path){
      return {
        onSnapshot(next){
          const fire = ()=>{
            const items = lsLoadAll()[path] || {};
            next({ docs: Object.keys(items).map(id=>({ id, data:()=>items[id] })) });
          };
          (listeners[path] = listeners[path] || new Set()).add(fire);
          fire();
          return ()=>{ listeners[path].delete(fire); };
        },
        async add(data){
          const all = lsLoadAll(); all[path] = all[path] || {};
          const id = lsMintId(); all[path][id] = data;
          lsSaveAll(all); notify(path);
          return { id };
        },
      };
    },
    doc(fullPath){
      const i = fullPath.lastIndexOf('/');
      const path = fullPath.slice(0,i), id = fullPath.slice(i+1);
      return {
        async set(data){ const all=lsLoadAll(); all[path]=all[path]||{}; all[path][id]=data; lsSaveAll(all); notify(path); },
        async update(data){ const all=lsLoadAll(); all[path]=all[path]||{}; all[path][id]={...(all[path][id]||{}), ...data}; lsSaveAll(all); notify(path); },
        async delete(){ const all=lsLoadAll(); if(all[path]) delete all[path][id]; lsSaveAll(all); notify(path); },
      };
    },
  };
}

/* =========================================================================
   LỚP LƯU TRỮ SUPABASE (Postgres thật, qua REST API PostgREST) — kết nối
   trực tiếp từ trình duyệt bằng anon key, KHÔNG cần backend riêng (đúng
   kiểu Supabase được thiết kế để dùng: anon key vốn công khai, an toàn nhờ
   RLS ở phía database — xem supabase_setup.sql). muHeader "x-app-secret" gắn
   kèm mọi request khớp với policy RLS đã tạo, để không phải ai có anon key
   (vốn lộ sẵn trong app.js) cũng đọc/sửa được dữ liệu.
   ========================================================================= */
const SUPABASE_URL = 'https://vacyyyqgnqwuastjimlz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhY3l5eXFnbnF3dWFzdGppbWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNTEwNDQsImV4cCI6MjEwNDgyNzA0NH0.-HkI4Y8PS_oYbKdZ9ygNTRuXZNgLlIUkpBlDZbzr2ME';
// Phải khớp CHÍNH XÁC giá trị "app_secret" trong supabase_setup.sql — đổi ở
// đây thì phải chạy lại khối RLS bên đó với giá trị mới, không thì bị chặn.
const SUPABASE_APP_SECRET = 'hJBS2VJVRGLHnY20_noLzOUUaOPso2BH';
// Đặt cả 2 hằng trên thành '' để tắt hẳn, quay lại chạy offline (localStorage).
const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

// Tên bảng Postgres (snake_case) ứng với từng "path" collection (camelCase,
// giữ nguyên như key của COLLECTIONS) — vì schema.sql/supabase_setup.sql cố
// tình đặt tên bảng chuẩn snake_case, khác hẳn key JS.
const SUPA_TABLE = {
  drivers:'drivers', vehicles:'vehicles', routes:'routes', customers:'customers',
  allowanceTypes:'allowance_types', allowanceConfigs:'allowance_configs', allowanceUsage:'allowance_usage',
  trips:'trips', deductions:'deductions', fuelLogs:'fuel_logs', fuelPrices:'fuel_prices',
};
// Khoá chính THẬT của từng bảng: 'code' (khách hàng/lái xe — khoá tự nhiên
// có sẵn), 'id' SERIAL do Postgres tự sinh (xe/tuyến), hoặc 'id' TEXT do
// PHÍA CLIENT tự sinh (các bảng còn lại — Postgres không tự sinh chuỗi
// ngẫu nhiên được, phải mint bằng lsMintId() trước khi INSERT).
const SUPA_PK = {
  customers:'code', drivers:'code', vehicles:'id', routes:'id',
  allowanceTypes:'id', allowanceConfigs:'id', allowanceUsage:'id',
  trips:'id', deductions:'id', fuelLogs:'id', fuelPrices:'id',
};
const SUPA_AUTO_ID = { vehicles:true, routes:true }; // Postgres tự sinh (SERIAL), KHÔNG tự đặt id phía client
// Ánh xạ tên trường app.js (camelCase) -> tên cột Postgres (snake_case).
// Trường nào trùng tên y hệt (vd "name", "date", "km", "status"...) không
// cần liệt kê — toSupaRow()/fromSupaRow() tự giữ nguyên tên nếu không thấy
// trong bảng ánh xạ của đúng collection đó.
const SUPA_FIELD_MAP = {
  customers: { calcMethod:'calc_method', loadingPrice:'loading_price', surgeInnerAmount:'surge_inner_amount',
    surgeOuterFlatAmount:'surge_outer_flat_amount', surgeOuterKmCap:'surge_outer_km_cap',
    longHaulUpTo5:'long_haul_up_to_5', longHaulUpTo8:'long_haul_up_to_8', longHaulUpTo15:'long_haul_up_to_15',
    kmRegions:'km_regions' },
  drivers: { driverType:'driver_type', hasFixedSalary:'has_fixed_salary', fixedSalaryAmount:'fixed_salary_amount',
    seniorityAllowance:'seniority_allowance' },
  vehicles: { vehicleType:'vehicle_type', homeProject:'home_project',
    fuelManagement:'fuel_management', fuelNorm:'fuel_norm' },
  routes: { routeName:'route_name', surchargePrice:'surcharge_price' },
  allowanceTypes: { minDays:'min_days', standardDays:'standard_days' },
  allowanceConfigs: { targetType:'target_type', targetId:'target_id', allowanceTypeId:'allowance_type_id' },
  allowanceUsage: { targetType:'target_type', targetId:'target_id', allowanceTypeId:'allowance_type_id' },
  trips: { tripCode:'trip_code', driverCode:'driver_code', kmRegion:'km_region', surgeZone:'surge_zone',
    loadingCount:'loading_count', pointCount:'point_count', tripType:'trip_type' },
  deductions: { driverCode:'driver_code' },
  fuelLogs: { odoStart:'odo_start', odoEnd:'odo_end', stockStart:'stock_start', stockEnd:'stock_end' },
  fuelPrices: {},
};
// Trường nào chuỗi rỗng '' phải đổi thành null trước khi gửi lên Postgres —
// cột có CHECK theo danh sách giá trị (enum) không chấp nhận chuỗi rỗng,
// chỉ chấp nhận NULL hoặc đúng 1 trong các giá trị liệt kê.
const SUPA_EMPTY_TO_NULL = { trips: ['surgeZone'] };

function toSupaRow(key, data){
  const map = SUPA_FIELD_MAP[key] || {};
  const emptyToNull = SUPA_EMPTY_TO_NULL[key] || [];
  const row = {};
  Object.keys(data).forEach(k=>{
    let v = data[k];
    if(emptyToNull.includes(k) && v==='') v = null;
    row[map[k] || k] = v;
  });
  return row;
}
function fromSupaRow(key, row){
  const map = SUPA_FIELD_MAP[key] || {};
  const reverse = {};
  Object.keys(map).forEach(k=>{ reverse[map[k]] = k; });
  const obj = {};
  Object.keys(row).forEach(col=>{ obj[reverse[col] || col] = row[col]; });
  return obj;
}
function makeSupabaseDb(){
  const BASE = SUPABASE_URL + '/rest/v1';
  const HEADERS = {
    apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer '+SUPABASE_ANON_KEY,
    'x-app-secret': SUPABASE_APP_SECRET, 'Content-Type':'application/json',
  };
  const tableOf = key => SUPA_TABLE[key] || key;
  const pkOf = key => SUPA_PK[key] || 'id';
  async function apiFail(action, key, res){
    let body = ''; try{ body = await res.text(); }catch(e){}
    throw new Error(`Supabase lỗi khi ${action} "${key}": ${res.status} ${body}`);
  }
  async function fetchRows(key){
    const res = await fetch(`${BASE}/${tableOf(key)}?select=*`, { headers:HEADERS });
    if(!res.ok) await apiFail('đọc', key, res);
    return res.json();
  }
  // Supabase không đẩy realtime về đây (chỉ làm mới định kỳ 6s ở poll() bên
  // dưới) — nếu KHÔNG làm mới ngay sau khi thêm/sửa/xoá thành công, người
  // dùng bấm xong phải đợi tới 6s mới thấy thay đổi trên màn hình, dễ tưởng
  // nhầm là thao tác không có tác dụng (VD bấm "Xoá tuyến" xong dòng vẫn còn
  // nguyên vài giây). "refreshers" lưu hàm làm mới của TỪNG collection đang
  // có màn hình lắng nghe, để add/update/delete gọi lại ngay lập tức.
  const refreshers = {};
  async function refreshNow(key){ if(refreshers[key]) await refreshers[key](); }
  return {
    collection(key){
      return {
        onSnapshot(next, onError){
          let stopped = false;
          async function doFetch(){
            try{
              const rows = await fetchRows(key);
              const pk = pkOf(key);
              next({ docs: rows.map(r=>({ id:String(r[pk]), data:()=>fromSupaRow(key, r) })) });
            }catch(e){ console.error('Supabase onSnapshot lỗi', key, e); if(onError) onError(e); }
          }
          refreshers[key] = doFetch;
          async function poll(){
            if(stopped) return;
            await doFetch();
            if(!stopped) setTimeout(poll, 6000); // không có realtime — làm mới định kỳ 6s
          }
          poll();
          return ()=>{ stopped = true; if(refreshers[key]===doFetch) delete refreshers[key]; };
        },
        async add(data){
          const row = toSupaRow(key, data);
          if(!SUPA_AUTO_ID[key] && pkOf(key)==='id' && row.id==null) row.id = lsMintId();
          const res = await fetch(`${BASE}/${tableOf(key)}`, {
            method:'POST', headers:{...HEADERS, Prefer:'return=representation'}, body: JSON.stringify(row),
          });
          if(!res.ok) await apiFail('thêm', key, res);
          const [saved] = await res.json();
          await refreshNow(key);
          return { id: String(saved[pkOf(key)]) };
        },
        // Ghi hàng loạt trong ĐÚNG 1 request POST (mảng nhiều dòng) — PostgREST
        // hỗ trợ sẵn kiểu này, thay vì N request add() nối tiếp. opts.onConflict
        // = tên cột UNIQUE/PK để bật UPSERT (Prefer: resolution=merge-duplicates
        // — dòng nào trùng cột đó thì CẬP NHẬT các cột có trong payload, dòng
        // nào chưa có thì THÊM mới, cùng 1 lượt); bỏ trống thì INSERT thuần.
        // LƯU Ý (ràng buộc ẩn của Postgres): dù có onConflict, mỗi dòng vẫn
        // PHẢI đủ mọi cột NOT NULL không có DEFAULT của bảng đó (VD
        // trips.date/driver_code/plate/project) — "INSERT ... ON CONFLICT DO
        // UPDATE" vẫn kiểm tra ràng buộc NOT NULL ở bước INSERT trước khi xét
        // có trùng hay không, dù cuối cùng chỉ UPDATE. Chỉ muốn sửa vài cột lẻ
        // trên bản ghi ĐÃ CÓ SẴN (không cần thêm mới) thì dùng updateDoc()
        // từng dòng (kèm Promise.all cho nhanh nếu sửa nhiều dòng cùng lúc)
        // thay vì addMany() với payload thiếu cột.
        async addMany(dataArray, opts){
          const onConflict = opts && opts.onConflict;
          const rows = dataArray.map(data=>{
            const row = toSupaRow(key, data);
            if(!SUPA_AUTO_ID[key] && pkOf(key)==='id' && row.id==null) row.id = lsMintId();
            return row;
          });
          const prefer = onConflict ? 'resolution=merge-duplicates,return=representation' : 'return=representation';
          const url = `${BASE}/${tableOf(key)}` + (onConflict ? `?on_conflict=${onConflict}` : '');
          const res = await fetch(url, {
            method:'POST', headers:{...HEADERS, Prefer:prefer}, body: JSON.stringify(rows),
          });
          if(!res.ok) await apiFail('thêm hàng loạt', key, res);
          const saved = await res.json();
          await refreshNow(key);
          return saved.map(s=>({ id: String(s[pkOf(key)]) }));
        },
      };
    },
    doc(fullPath){
      const i = fullPath.lastIndexOf('/');
      const key = fullPath.slice(0,i), id = fullPath.slice(i+1);
      const table = tableOf(key), pk = pkOf(key);
      async function patch(row){
        const res = await fetch(`${BASE}/${table}?${pk}=eq.${encodeURIComponent(id)}`, {
          method:'PATCH', headers:HEADERS, body: JSON.stringify(row),
        });
        if(!res.ok) await apiFail('cập nhật', key, res);
      }
      return {
        async set(data){ await patch(toSupaRow(key, data)); await refreshNow(key); },
        async update(data){ await patch(toSupaRow(key, data)); await refreshNow(key); },
        async delete(){
          const res = await fetch(`${BASE}/${table}?${pk}=eq.${encodeURIComponent(id)}`, { method:'DELETE', headers:HEADERS });
          if(!res.ok) await apiFail('xoá', key, res);
          await refreshNow(key);
        },
      };
    },
  };
}

/* Xuất dữ liệu ĐANG CÓ trong app (localStorage/claude.ai — nhập từ trước
   khi nối Supabase) thành file .sql chứa INSERT, để nạp 1 lần vào Supabase
   sau khi đã chạy supabase_setup.sql. Dùng CHUNG toSupaRow()/SUPA_TABLE với
   makeSupabaseDb() để tên cột/định dạng khớp tuyệt đối với những gì app sẽ
   tự ghi khi chạy trực tiếp qua Supabase — không lệch quy tắc giữa 2 nơi. */
// Cột Postgres đầy đủ theo ĐÚNG thứ tự trong supabase_setup.sql. Bảng nào
// khoá chính tự sinh (SERIAL — vehicles/routes) thì không liệt kê "id".
const SUPA_COLUMNS = {
  customers: ['code','name','calc_method','loading_price','surge_inner_amount','surge_outer_flat_amount',
    'surge_outer_km_cap','long_haul_up_to_5','long_haul_up_to_8','long_haul_up_to_15','km_regions'],
  drivers: ['code','name','phone','driver_type','status','has_fixed_salary','fixed_salary_amount','seniority_allowance','plate'],
  vehicles: ['plate','capacity','vehicle_type','ownership','home_project','status','fuel_management','fuel_norm'],
  routes: ['project','route_name','route','price','surcharge_price'],
  allowanceTypes: ['id','name','unit','min_days','standard_days','rates'],
  allowanceConfigs: ['id','target_type','target_id','allowance_type_id'],
  allowanceUsage: ['id','target_type','target_id','allowance_type_id','period','quantity'],
  trips: ['id','date','trip_code','driver_code','plate','project','route','origin','destination','km',
    'km_region','surge_zone','loading_count','point_count','trip_type','revenue','status'],
  deductions: ['id','date','driver_code','type','amount','reason'],
  fuelLogs: ['id','plate','period','odo_start','odo_end','stock_start','purchased','stock_end'],
  fuelPrices: ['id','period','price'],
};
const SUPA_JSONB_COLS = { customers:['km_regions'], allowanceTypes:['rates'] };
// Giá trị mặc định cho các cột NOT NULL DEFAULT ... trong supabase_setup.sql
// — dữ liệu cũ nhập từ trước khi các trường này tồn tại trong app (vd
// kmRegion/loadingCount thêm sau) sẽ không có field này, để undefined thì
// sqlLiteral trả về NULL, làm INSERT thất bại vì cột không nhận NULL. Chỉ
// áp dụng khi thật sự "không có" (undefined) — không đè lên giá trị hợp lệ.
const SUPA_NOT_NULL_DEFAULTS = {
  drivers: { has_fixed_salary:false },
  vehicles: { fuel_management:'unmanaged' },
  allowanceTypes: { rates:{} },
  allowanceConfigs: { target_type:'driver' },
  allowanceUsage: { target_type:'driver', quantity:0 },
  trips: { route:'', origin:'', destination:'', km_region:'', loading_count:0, trip_type:'normal', revenue:0, status:'Hoàn thành' },
};
// Thứ tự chèn phải theo đúng phụ thuộc khoá ngoại (bảng bị tham chiếu chèn
// trước) — KHÔNG dùng thứ tự của COLLECTIONS. "vehicles" phải đứng TRƯỚC
// "drivers" (drivers.plate tham chiếu vehicles.plate — lái xe chọn xe phụ
// trách, không phải chiều ngược lại như trước), nhưng SAU "customers" (vì
// vehicles.home_project tham chiếu customers).
const SUPA_INSERT_ORDER = ['customers','vehicles','drivers','routes','allowanceTypes',
  'allowanceConfigs','allowanceUsage','trips','deductions','fuelLogs','fuelPrices'];
// CHÚ Ý: '' (chuỗi rỗng) KHÔNG được coi là NULL ở đây — nhiều cột như
// trips.route/origin/destination/km_region là NOT NULL DEFAULT '', chèn
// NULL vào sẽ làm INSERT thất bại. Cột nào cần NULL thay vì '' (vd
// trips.surgeZone, do có CHECK enum không nhận chuỗi rỗng) đã được đổi
// thành null TRƯỚC đó trong toSupaRow() (xem SUPA_EMPTY_TO_NULL) — tới đây
// chỉ cần phân biệt null/undefined thật sự với chuỗi rỗng hợp lệ.
function sqlLiteral(v, isJsonb){
  if(v===null || v===undefined) return 'NULL';
  if(isJsonb) return `'${JSON.stringify(v).replace(/'/g,"''")}'::jsonb`;
  if(typeof v === 'boolean') return v ? 'true' : 'false';
  if(typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${String(v).replace(/'/g,"''")}'`;
}
// Đọc THẲNG từ localStorage (lsLoadAll) chứ không lấy "state" hiện tại —
// vì sau khi bật Supabase, "state" phản ánh dữ liệu Supabase (có thể đang
// trống), trong khi dữ liệu THẬT nhập từ trước khi có Supabase vẫn còn
// nguyên trong localStorage của trình duyệt này, độc lập với storageMode
// đang chạy. Chỉ áp dụng cho trường hợp dữ liệu cũ nằm ở chế độ offline —
// dữ liệu cũ nằm trên claude.ai (chế độ "cloud") cần cách xuất khác.
function buildSupabaseSeedSql(){
  const all = lsLoadAll();
  const lines = [
    '-- Dữ liệu THẬT đã lưu trong localStorage TRƯỚC khi nối Supabase, xuất để',
    '-- nạp vào Supabase sau khi đã chạy supabase_setup.sql (tạo bảng trống).',
    '-- Chạy 1 lần trong SQL Editor.',
    'BEGIN;', '',
  ];
  let totalRows = 0;
  SUPA_INSERT_ORDER.forEach(key=>{
    const bucket = all[COLLECTIONS[key]] || {};
    const rows = Object.keys(bucket).map(id=>({ id, ...bucket[id] }));
    if(!rows.length) return;
    totalRows += rows.length;
    const table = SUPA_TABLE[key] || key;
    const cols = SUPA_COLUMNS[key];
    const jsonbCols = new Set(SUPA_JSONB_COLS[key] || []);
    const defaults = SUPA_NOT_NULL_DEFAULTS[key] || {};
    const valueRows = rows.map(r=>{
      const { id, ...rest } = r;
      const row = toSupaRow(key, rest);
      row.id = id; // vô hại với bảng không có cột "id" trong SUPA_COLUMNS (không được đọc tới)
      const vals = cols.map(c=>{
        const v = row[c]===undefined && defaults[c]!==undefined ? defaults[c] : row[c];
        return sqlLiteral(v, jsonbCols.has(c));
      });
      return `  (${vals.join(', ')})`;
    });
    lines.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES`);
    lines.push(valueRows.join(',\n') + ';', '');
  });
  lines.push('COMMIT;');
  return { sql: lines.join('\n'), totalRows };
}

async function initStorage(){
  let cloud = null;
  if(typeof claude !== 'undefined' && claude && typeof claude.use === 'function'){
    try{ cloud = await claude.use('db'); }catch(e){ cloud = null; }
    try{ downloads = await claude.use('downloads'); }catch(e){ downloads = null; }
    storageMode = cloud ? 'cloud' : 'fallback';
  }
  if(cloud){
    db = cloud;
  }else if(SUPABASE_ENABLED){
    db = makeSupabaseDb();
    storageMode = 'supabase';
  }else{
    db = makeLocalDb();
    if(!Object.keys(lsLoadAll()).length) lsSaveAll(SEED_DATA);
  }
  Object.entries(COLLECTIONS).forEach(([key, path])=>{
    db.collection(path).onSnapshot(snap=>{
      // "id:d.id" phải đứng SAU "...d.data()" — với bảng có cột khoá chính
      // tên đúng là "id" (vehicles/routes, SERIAL bên Supabase), d.data()
      // cũng trả về một field "id" (số nguyên thô từ Postgres, KHÔNG phải
      // chuỗi), nếu để trước sẽ bị spread đè mất, khiến state[key][i].id là
      // số trong khi mọi nơi khác (data-*, so sánh tìm bản ghi) đều dùng
      // chuỗi d.id đã String() hoá — lệch kiểu làm find() không khớp, ví dụ
      // nút Xoá ở "Bảng giá theo tuyến" bấm không có phản ứng gì.
      state[key] = snap.docs.map(d=>({ ...d.data(), id:d.id }));
      scheduleRender();
    }, err=>{ console.error('Lỗi dữ liệu', path, err); });
  });
  renderStorageBadge();
}

function renderStorageBadge(){
  const wrap = document.getElementById('topbar-status');
  const dot = document.getElementById('storage-dot');
  const label = document.getElementById('storage-mode');
  // Kết nối bình thường (cloud/Supabase) thì ẩn hẳn dòng trạng thái này đi —
  // chỉ còn hiện khi CÓ VẤN ĐỀ thật sự cần người dùng biết (chưa kết nối
  // được dữ liệu dùng chung, đang chạy tạm bằng dữ liệu máy này).
  if(storageMode === 'cloud' || storageMode === 'supabase'){
    wrap.hidden = true;
  }else if(storageMode === 'fallback'){
    wrap.hidden = false;
    dot.className = 'storagedot local';
    label.textContent = 'Chưa kết nối được dữ liệu dùng chung — đang tạm lưu trên máy này.';
  }else{
    wrap.hidden = false;
    dot.className = 'storagedot local';
    label.textContent = 'Bản offline: dữ liệu lưu trong trình duyệt của máy này.';
  }
}

function colOf(key){ return db.collection(COLLECTIONS[key]); }
async function addDoc(key, data){ await colOf(key).add(data); }
async function setDoc(key, id, data){ await db.doc(COLLECTIONS[key]+'/'+id).set(data); }
async function updateDoc(key, id, data){ await db.doc(COLLECTIONS[key]+'/'+id).update(data); }
async function deleteDoc(key, id){ await db.doc(COLLECTIONS[key]+'/'+id).delete(); }
// Ghi HÀNG LOẠT trong 1 lượt gọi (dùng cho Nhập từ Excel) thay vì lặp
// `await addDoc()` từng dòng — lặp tuần tự nghĩa là N dòng = N lượt round-trip
// mạng nối tiếp nhau (dòng sau phải đợi dòng trước ghi VÀ đọc lại xong mới
// bắt đầu, xem addMany() ở makeSupabaseDb), nhập vài chục dòng có thể mất
// hàng chục giây. `opts.onConflict` = tên cột có UNIQUE/PK để UPSERT (vừa
// thêm mới vừa cập nhật bản ghi trùng trong CÙNG 1 lượt gọi, VD 'code' cho
// lái xe, 'plate' cho xe) — bỏ trống thì chỉ INSERT thuần (VD Chuyến đi,
// Khấu trừ luôn tạo dòng mới, không có khái niệm "trùng để cập nhật").
// Chỉ makeSupabaseDb() có addMany() thật (1 request duy nhất); các chế độ
// lưu trữ khác (cloud claude.ai, fallback localStorage) không có API bulk
// riêng nên dùng Promise.all() — chạy SONG SONG thay vì nối tiếp, vẫn nhanh
// hơn hẳn vòng lặp tuần tự dù không gộp được thành 1 request.
async function addManyDocs(key, dataArray, opts){
  if(!dataArray.length) return [];
  const col = colOf(key);
  if(typeof col.addMany === 'function') return await col.addMany(dataArray, opts);
  return await Promise.all(dataArray.map(d=>col.add(d)));
}

/* =========================================================================
   KHUNG GIAO DIỆN: điều hướng, kỳ lương dùng chung, render
   ========================================================================= */
const NAV = [
  { group:'Tổng hợp', items:[ {id:'payroll', label:'Bảng lương', icon:'fa-money-bill-wave'} ] },
  { group:'Vận hành', items:[
      {id:'trips', label:'Lịch lái xe', icon:'fa-truck-fast'},
      {id:'allowanceUsage', label:'Chấm công phụ cấp', icon:'fa-clock'},
      {id:'fuel', label:'Nhiên liệu', icon:'fa-gas-pump'},
      {id:'deductions', label:'Khấu trừ', icon:'fa-circle-minus'},
  ]},
  { group:'Cấu hình', items:[
      {id:'cfg-drivers', label:'Lái xe', icon:'fa-id-card'},
      {id:'cfg-vehicles', label:'Xe', icon:'fa-truck'},
      {id:'cfg-customers', label:'Khách hàng', icon:'fa-building'},
      {id:'cfg-routes', label:'Lương theo tuyến', icon:'fa-route'},
      {id:'cfg-allowance', label:'Phụ cấp', icon:'fa-hand-holding-dollar'},
  ]},
  { group:null, items:[ {id:'guide', label:'Hướng dẫn sử dụng', icon:'fa-circle-question'} ] },
];

// Thu gọn thanh bên KHÔNG ẩn hết (width:0 như trước) mà chừa lại 1 dải hẹp
// vừa đúng logo công ty — mỗi mục chỉ còn icon, tên đầy đủ xem qua "title"
// (tooltip khi rê chuột), xem thêm CSS #app.sidebar-collapsed.
function renderNav(){
  document.getElementById('navroot').innerHTML = NAV.map(g=>`
    <div class="navgroup${g.group?'':' plain'}">
      ${g.group?`<div class="navgroup-title">${esc(g.group)}</div>`:''}
      <div class="navlist">
        ${g.items.map(it=>`<button class="navitem${currentSection===it.id?' active':''}" data-nav="${it.id}" title="${esc(it.label)}">
          <i class="nav-icon fa-solid ${it.icon}" aria-hidden="true"></i><span>${esc(it.label)}</span>
        </button>`).join('')}
      </div>
    </div>`).join('');
}

function syncPeriodUi(){
  const input = document.getElementById('side-period');
  if(input.value !== appPeriod) input.value = appPeriod;
  document.getElementById('side-period-display').textContent = periodLabelVi(appPeriod);
  document.getElementById('side-period-cap').textContent = periodCaption(appPeriod);
}

const SECTIONS = {
  payroll:        { render: renderPayroll,         bind: bindPayroll },
  trips:          { render: renderTrips,           bind: bindTrips },
  allowanceUsage: { render: renderAllowanceUsage,  bind: bindAllowanceUsage },
  fuel:           { render: renderFuel,            bind: bindFuel },
  deductions:     { render: renderDeductions,      bind: bindDeductions },
  'cfg-drivers':  { render: renderDrivers,         bind: bindDrivers },
  'cfg-vehicles': { render: renderVehicles,        bind: bindVehicles },
  'cfg-customers':{ render: renderCustomers,       bind: bindCustomers },
  'cfg-routes':   { render: renderRoutes,          bind: bindRoutes },
  'cfg-allowance':{ render: renderAllowanceConfig, bind: bindAllowanceConfig },
  guide:          { render: renderGuide,           bind: bindGuide },
};

let renderQueued = false;
function scheduleRender(){
  if(renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(()=>{ renderQueued = false; render(); });
}

function render(){
  // Giữ nguyên ô đang gõ (ví dụ ô tìm kiếm) khi trang được vẽ lại. Riêng ô
  // combo (gõ-để-tìm, VD ô "Khách hàng" ở Bảng giá theo tuyến) KHÔNG giữ
  // focus theo đường này: chọn xong 1 mục, combo tự đổi giá trị rồi gọi
  // render() ngay — nếu focus lại ô đó, sự kiện onfocus của combo sẽ tự mở
  // lại danh sách gợi ý, khiến vừa chọn xong danh sách lại bung ra ngay.
  const active = document.activeElement;
  const keepId = active && active.id && active.closest('#main') && !active.classList.contains('combo-input') ? active.id : null;
  const keepText = keepId && (active.type==='text' || active.type==='search');
  const caret = keepText ? active.selectionStart : null;

  // Combo ĐANG MỞ danh sách gợi ý (vd bộ lọc "Lái xe" ở Chuyến đi/Bảng
  // lương/Khấu trừ) lại là trường hợp khác: người dùng chưa chọn xong, chỉ
  // đang gõ tìm — nếu đúng lúc polling nền vẽ lại trang (mainEl.innerHTML
  // bị thay toàn bộ) mà bỏ qua như trên thì cả ô lẫn danh sách gợi ý biến
  // mất giữa chừng dù không hề bấm ra ngoài ô lọc. Tự lưu chuỗi đang gõ +
  // vị trí con trỏ của combo này (chỉ khi danh sách đang mở), sau khi vẽ
  // lại thì gán lại giá trị rồi tự bắn sự kiện "input" để combo lọc lại
  // đúng danh sách như cũ — không gọi thẳng .focus() theo nhánh onfocus
  // mặc định vì nhánh đó luôn mở nguyên danh sách CHƯA lọc.
  let comboRestore = null;
  if(active && active.classList && active.classList.contains('combo-input') && active.id.endsWith('-text') && active.closest('#main')){
    const listEl = document.getElementById(active.id.slice(0, -5) + '-list');
    if(listEl && !listEl.hidden){
      comboRestore = { id: active.id, value: active.value, caret: active.selectionStart };
    }
  }

  // Giữ lại vị trí cuộn của các bảng (.tablewrap giờ tự cuộn riêng — xem
  // max-height/overflow ở styles.css) qua mỗi lần vẽ lại: render() thay
  // THẲNG toàn bộ innerHTML của #main (không diff DOM), nên nếu không lưu
  // thì mỗi lần polling làm mới dữ liệu (khoảng mỗi 6s/collection, xem
  // makeSupabaseDb) sẽ tạo DOM bảng mới, tự đưa cuộn về 0 — người dùng đang
  // cuộn xem giữa bảng sẽ thấy bảng tự nhảy về đầu liên tục dù không hề chạm
  // chuột. Lưu CẢ scrollTop (dọc) LẪN scrollLeft (ngang, vd bảng lương có
  // nhiều cột phải cuộn sang phải mới xem hết) — thiếu scrollLeft là lý do
  // bảng lương lái xe vẫn tự nhảy về đầu khi cuộn ngang dù đã sửa scrollTop.
  // Lưu theo THỨ TỰ xuất hiện (đủ dùng vì mỗi trang chỉ có 1–2 bảng, thứ tự
  // không đổi giữa 2 lần vẽ cùng 1 trang).
  const mainEl = document.getElementById('main');
  const tableScrollPos = Array.from(mainEl.querySelectorAll('.tablewrap')).map(el=>({top:el.scrollTop, left:el.scrollLeft}));

  renderNav();
  syncPeriodUi();
  const section = SECTIONS[currentSection] || SECTIONS.payroll;
  mainEl.innerHTML = section.render();
  section.bind();
  mainEl.querySelectorAll('.tablewrap').forEach((el,i)=>{
    const pos = tableScrollPos[i];
    if(!pos) return;
    if(pos.top) el.scrollTop = pos.top;
    if(pos.left) el.scrollLeft = pos.left;
  });

  if(keepId){
    const el = document.getElementById(keepId);
    if(el){ el.focus(); if(keepText && caret !== null) el.setSelectionRange(caret, caret); }
  }
  if(comboRestore){
    const el = document.getElementById(comboRestore.id);
    if(el){
      el.value = comboRestore.value;
      el.focus();
      el.dispatchEvent(new Event('input', {bubbles:true}));
      if(comboRestore.caret!=null) el.setSelectionRange(comboRestore.caret, comboRestore.caret);
    }
  }
}

function setSection(id){
  currentSection = id;
  localStorage.setItem(CURRENT_SECTION_KEY, id);
  expandedRows.clear();
  render();
  document.getElementById('main').scrollIntoView({block:'nearest'});
}
function setPeriod(p){ appPeriod = p; render(); }

document.getElementById('app').addEventListener('click', e=>{
  const nav = e.target.closest('[data-nav]');
  if(nav) setSection(nav.dataset.nav);
});
document.getElementById('side-period').addEventListener('change', e=>{
  if(e.target.value) setPeriod(e.target.value);
});
document.getElementById('side-prev').onclick = ()=> setPeriod(shiftPeriod(appPeriod,-1));
document.getElementById('side-next').onclick = ()=> setPeriod(shiftPeriod(appPeriod, 1));

/* Ẩn/hiện thanh bên — nhớ lựa chọn giữa các lần mở lại trên cùng máy. */
const SIDEBAR_COLLAPSED_KEY = 'vittrans_sidebar_collapsed';
function applySidebarCollapsed(collapsed){
  document.getElementById('app').classList.toggle('sidebar-collapsed', collapsed);
  document.getElementById('sidebar-toggle').textContent = collapsed ? '›' : '‹';
}
applySidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
document.getElementById('sidebar-toggle').onclick = ()=>{
  const collapsed = !document.getElementById('app').classList.contains('sidebar-collapsed');
  applySidebarCollapsed(collapsed);
  try{ localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0'); }catch(e){}
};

/* ---------------------------- Thông báo & hộp thoại ---------------------------- */
let toastTimer = null;
function toast(msg, kind){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = kind || '';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.hidden = true; }, 2800);
}
function closeModal(){
  document.getElementById('overlay').hidden = true;
  document.getElementById('modalbox').innerHTML = '';
  activeKmGrid = null;
}
// Nút "×" đóng modal — nằm NGAY TRONG khung modal (góc trên-phải, xem
// styles.css .modal-close-wrap/.modal-close-x), không phải nổi ngoài màn
// hình như bản trước (người dùng phản hồi muốn nó thuộc hẳn về khung cửa
// sổ). Vì openModal()/replaceModalBody() thay THẲNG #modalbox.innerHTML mỗi
// lần vẽ (xoá sạch children cũ), phải tự chèn lại HTML nút này vào ĐẦU nội
// dung mỗi lần thay vì đặt cố định 1 lần trong index.html. Gắn sự kiện bằng
// UỶ QUYỀN (delegation) trên #overlay — bấm 1 lần duy nhất lúc tải trang —
// để khỏi phải gắn lại onclick mỗi lần nội dung bị thay mới.
const MODAL_CLOSE_X_HTML = '<div class="modal-close-wrap"><button type="button" class="modal-close-x" data-modal-close aria-label="Đóng" title="Đóng">×</button></div>';
document.getElementById('overlay').addEventListener('click', e=>{ if(e.target.closest('[data-modal-close]')) closeModal(); });
function openModal(html, opts){
  const box = document.getElementById('modalbox');
  box.innerHTML = MODAL_CLOSE_X_HTML + html;
  box.classList.toggle('modal-wide', !!(opts && opts.wide));
  document.getElementById('overlay').hidden = false;
  const first = document.querySelector('#modalbox input:not([disabled]), #modalbox select');
  if(first) first.focus();
}
// Vẽ lại nội dung modal (vd sau khi soát/sửa 1 dòng lỗi) mà KHÔNG nhảy cuộn
// về đầu bảng — thay hẳn innerHTML nên tự mất vị trí cuộn cũ, ở đây tự nhớ
// lại scrollTop của khung bảng cuộn (".tablewrap") trước khi thay, rồi đặt
// lại đúng vị trí đó trên khung bảng mới — người dùng sửa xong 1 dòng không
// phải lăn chuột tìm lại dòng lỗi tiếp theo mỗi lần.
function replaceModalBody(html){
  const box = document.getElementById('modalbox');
  const scroller = box.querySelector('.tablewrap');
  const top = scroller ? scroller.scrollTop : 0;
  const left = scroller ? scroller.scrollLeft : 0;
  box.innerHTML = MODAL_CLOSE_X_HTML + html;
  const next = box.querySelector('.tablewrap');
  if(next){ next.scrollTop = top; next.scrollLeft = left; }
}
// Nới/thu modal khi nội dung bên trong đổi (vd bảng nhiều cột chỉ xuất hiện
// với một vài lựa chọn) mà không phải vẽ lại toàn bộ modal.
function setModalWide(wide){ document.getElementById('modalbox').classList.toggle('modal-wide', !!wide); }
function modalError(msg){
  const el = document.getElementById('m-error');
  if(!el){ toast(msg, 'danger'); return; }
  el.textContent = msg;
  el.hidden = false;
}
// Cố ý KHÔNG đóng khi bấm ra ngoài modal (vùng overlay) — lỡ tay bấm ngoài
// phạm vi ô đang nhập sẽ mất hết dữ liệu chưa lưu, phải gõ lại từ đầu. Chỉ
// đóng qua nút Huỷ/Lưu hoặc phím Esc (là hành động chủ động của người dùng).
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !document.getElementById('overlay').hidden) closeModal(); });

/* Giữ chuột ~1s trên ô "Khoảng km (đến)" (đầu dòng) hoặc ô mốc tải trọng
   (đầu cột) của bảng bậc thang km × tải trọng để kéo đổi vị trí dòng/cột
   sang chỗ khác — dùng chung cho mọi bảng dạng này (Sửa khách hàng, Cấu
   hình › Phụ cấp) qua "activeKmGrid" mà modal đang mở tự đăng ký (xem
   bindKmGrid/bindKmProjectGrid). Chỉ bấm nhanh (thả trước 900ms hoặc di
   chuột ra xa) vẫn gõ số bình thường, không bị hiểu nhầm thành kéo. */
(function setupKmGridDragReorder(){
  const HOLD_MS = 900;
  const MOVE_CANCEL_PX = 6;
  let holdTimer = null;
  let armCancelMove = null;
  let drag = null; // { isRow, table, fromEl, regionIdx, fromIndex, hoverEl }

  function clearArm(){
    clearTimeout(holdTimer); holdTimer = null;
    if(armCancelMove){ document.removeEventListener('mousemove', armCancelMove); armCancelMove = null; }
  }
  document.addEventListener('mousedown', e=>{
    if(!activeKmGrid) return;
    const input = e.target.closest('input[data-km-bracket], input[data-kmp-bracket], input[data-km-tier], input[data-kmp-tier]');
    if(!input) return;
    const isRow = input.matches('[data-km-bracket], [data-kmp-bracket]');
    const startX = e.clientX, startY = e.clientY;
    clearArm();
    holdTimer = setTimeout(()=>{ clearArm(); beginDrag(input, isRow); }, HOLD_MS);
    armCancelMove = me=>{
      if(Math.hypot(me.clientX-startX, me.clientY-startY) > MOVE_CANCEL_PX) clearArm();
    };
    document.addEventListener('mousemove', armCancelMove);
    document.addEventListener('mouseup', clearArm, { once:true });
  });

  function siblingIndex(el){ return [...el.parentElement.children].indexOf(el); }

  function beginDrag(input, isRow){
    input.blur();
    const table = input.closest('table');
    const regionIdx = input.dataset.kmRegionIdx!=null ? Number(input.dataset.kmRegionIdx) : undefined;
    const fromEl = isRow ? input.closest('tr') : input.closest('th');
    drag = {
      isRow, table, regionIdx, fromEl,
      fromIndex: isRow ? siblingIndex(fromEl) : siblingIndex(fromEl) - 1, // cột 0 là ô "Khoảng km (đến)"
      hoverEl: null,
    };
    fromEl.classList.add(isRow ? 'km-drag-row' : 'km-drag-col');
    document.body.classList.add('km-dragging');
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', endDrag, { once:true });
  }
  function clearHoverHighlight(){
    if(drag && drag.hoverEl) drag.hoverEl.classList.remove('km-drop-target');
  }
  function onDragMove(e){
    if(!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if(!el) return;
    if(drag.isRow){
      const tr = el.closest('tbody tr');
      if(tr && tr.closest('table')===drag.table && tr!==drag.fromEl && tr.querySelector('[data-km-bracket], [data-kmp-bracket]')){
        if(tr!==drag.hoverEl){ clearHoverHighlight(); tr.classList.add('km-drop-target'); drag.hoverEl = tr; }
      }
    } else {
      const th = el.closest('thead th');
      if(th && th.closest('table')===drag.table && th!==drag.fromEl && th.querySelector('[data-km-tier], [data-kmp-tier]')){
        if(th!==drag.hoverEl){ clearHoverHighlight(); th.classList.add('km-drop-target'); drag.hoverEl = th; }
      }
    }
  }
  function endDrag(){
    document.removeEventListener('mousemove', onDragMove);
    if(drag && drag.hoverEl && activeKmGrid){
      const toIndex = drag.isRow ? siblingIndex(drag.hoverEl) : siblingIndex(drag.hoverEl) - 1;
      activeKmGrid.sync();
      if(drag.isRow) activeKmGrid.reorderRow(drag.fromIndex, toIndex, drag.regionIdx);
      else activeKmGrid.reorderColumn(drag.fromIndex, toIndex, drag.regionIdx);
      activeKmGrid.refresh();
    }
    if(drag && drag.fromEl) drag.fromEl.classList.remove('km-drag-row', 'km-drag-col');
    clearHoverHighlight();
    document.body.classList.remove('km-dragging');
    drag = null;
  }
})();

/* Tooltip cho icon lỗi ⚠ ở bảng soát lỗi nhập Excel (data-tip="..."). Dùng
   1 div dùng chung, định vị "position:fixed" theo toạ độ thật của icon lúc
   hover thay vì đặt "absolute" bên trong bảng — bảng cuộn ngang/dọc
   ("overflow:auto") sẽ CẮT MẤT tooltip nếu định vị theo cách đó vì tooltip
   nằm ngoài phần đang cuộn tới. Việc này cũng cho khống chế độ rộng cố định
   + tự xuống dòng, thay vì "title" mặc định của trình duyệt (không tự
   xuống dòng, in cả câu dài trên 1 dòng rất khó đọc). */
(function setupImportTooltip(){
  let tip = null;
  function ensureTip(){
    if(!tip){ tip = document.createElement('div'); tip.className = 'import-tip'; tip.hidden = true; document.body.appendChild(tip); }
    return tip;
  }
  document.addEventListener('mouseover', e=>{
    const icon = e.target.closest('.import-err-icon');
    if(!icon) return;
    const el = ensureTip();
    el.textContent = icon.dataset.tip || '';
    el.hidden = false;
    el.style.left = '0px'; el.style.top = '0px';
    const r = icon.getBoundingClientRect();
    let left = r.right - el.offsetWidth;
    if(left < 4) left = 4;
    let top = r.bottom + 6;
    if(top + el.offsetHeight > window.innerHeight - 4) top = r.top - el.offsetHeight - 6;
    el.style.left = left+'px'; el.style.top = top+'px';
  });
  document.addEventListener('mouseout', e=>{
    const icon = e.target.closest('.import-err-icon');
    if(!icon || (e.relatedTarget && e.relatedTarget.closest('.import-err-icon')===icon)) return;
    if(tip) tip.hidden = true;
  });
})();

const ERROR_SLOT = '<div class="modal-error full" id="m-error" hidden></div>';
const MODAL_BUTTONS = '<div class="modal-actions"><button class="btn" id="m-cancel">Huỷ</button><button class="btn primary" id="m-save">Lưu</button></div>';

function selectOptions(opts, selected){
  return opts.map(o=>{
    const v = typeof o==='object'?o.v:o, l = typeof o==='object'?o.l:o;
    return `<option value="${esc(v)}"${v===selected?' selected':''}>${esc(l)}</option>`;
  }).join('');
}

/* ---------------------------- Ô chọn có gõ tìm kiếm ----------------------------
   Danh sách lái xe / xe / khách hàng / tuyến thường rất dài nên dùng ô gõ để lọc
   thay cho select thường. Giá trị thật nằm ở input ẩn mang đúng id cũ, và khi
   chọn xong sẽ bắn sự kiện "change" trên input ẩn đó — nên mọi chỗ đang đọc
   $('m-driver').value hay gán $('m-driver').onchange vẫn chạy như cũ. */
function driverComboOptions(emptyLabel){
  const opts = [...state.drivers].sort((a,b)=>String(a.code).localeCompare(String(b.code)))
    .map(d=>({v:d.code, l:d.code+' — '+d.name}));
  return emptyLabel!=null ? [{v:'', l:emptyLabel}, ...opts] : opts;
}
function vehicleComboOptions(emptyLabel){
  const opts = [...state.vehicles].sort((a,b)=>String(a.plate).localeCompare(String(b.plate)))
    .map(v=>({v:v.plate, l:v.plate+(v.homeProject?' — '+v.homeProject:'')}));
  return emptyLabel!=null ? [{v:'', l:emptyLabel}, ...opts] : opts;
}
function customerComboOptions(emptyLabel, codes){
  const opts = (codes || allProjects()).map(code=>{
    const c = customerByCode(code);
    return {v:code, l: c ? code+' — '+c.name : code};
  });
  return emptyLabel!=null ? [{v:'', l:emptyLabel}, ...opts] : opts;
}
function routeComboOptions(project){
  const list = routesForProject(project).sort((a,b)=>String(a.route).localeCompare(String(b.route)));
  return [{v:'', l: list.length?'— Chọn tuyến —':'— Chưa có tuyến cho khách hàng này —'},
    ...list.map(r=>({v:r.route, l:r.route}))];
}
function comboLabelOf(options, value){
  const o = options.find(x=>String(x.v)===String(value==null?'':value));
  return o ? o.l : '';
}
function comboField(id, options, selected, placeholder){
  return `<div class="combo">
    <input type="text" class="combo-input" id="${id}-text" autocomplete="off" spellcheck="false"
      value="${esc(comboLabelOf(options, selected))}" placeholder="${esc(placeholder||'Gõ để tìm…')}">
    <input type="hidden" id="${id}" value="${esc(selected==null?'':selected)}">
    <div class="combo-list" id="${id}-list" hidden></div>
  </div>`;
}
function setComboValue(id, options, value){
  const hidden = document.getElementById(id), text = document.getElementById(id+'-text');
  if(!hidden) return;
  hidden.value = value==null ? '' : value;
  if(text) text.value = comboLabelOf(options, value);
}
function bindCombo(id, options, onPick){
  const text = document.getElementById(id+'-text');
  const hidden = document.getElementById(id);
  const list = document.getElementById(id+'-list');
  if(!text || !hidden || !list) return;
  let shown = [], active = -1;

  function close(){ list.hidden = true; active = -1; }
  function openList(filter){
    const q = String(filter||'').trim().toLowerCase();
    shown = q ? options.filter(o=>String(o.l).toLowerCase().includes(q) || String(o.v).toLowerCase().includes(q))
              : options.slice();
    list.innerHTML = shown.length
      ? shown.map((o,i)=>`<div class="combo-item${i===active?' active':''}" data-i="${i}">${esc(o.l)}</div>`).join('')
      : '<div class="combo-empty">Không tìm thấy</div>';
    list.hidden = false;
    list.querySelectorAll('[data-i]').forEach(el=>{
      // mousedown chứ không phải click: chạy trước blur nên chọn được bằng chuột
      el.onmousedown = ev=>{ ev.preventDefault(); pick(shown[+el.dataset.i]); };
    });
  }
  function pick(o){
    if(!o) return;
    hidden.value = o.v;
    text.value = o.l;
    close();
    hidden.dispatchEvent(new Event('change', {bubbles:true}));
    if(onPick) onPick(o.v);
  }
  function highlight(){
    list.querySelectorAll('[data-i]').forEach((el,i)=>{
      el.classList.toggle('active', i===active);
      if(i===active) el.scrollIntoView({block:'nearest'});
    });
  }
  text.onfocus = ()=>{ text.select(); openList(''); };
  text.oninput = ()=>{ active = -1; openList(text.value); };
  text.onblur = ()=>setTimeout(()=>{ close(); text.value = comboLabelOf(options, hidden.value); }, 120);
  text.onkeydown = ev=>{
    if(ev.key==='ArrowDown' || ev.key==='ArrowUp'){
      ev.preventDefault();
      if(list.hidden) openList(text.value);
      if(!shown.length) return;
      active = ev.key==='ArrowDown' ? Math.min(active+1, shown.length-1) : Math.max(active-1, 0);
      highlight();
    }else if(ev.key==='Enter'){
      if(!list.hidden && shown.length){ ev.preventDefault(); pick(shown[active>=0?active:0]); }
    }else if(ev.key==='Escape'){
      close();
      text.value = comboLabelOf(options, hidden.value);
    }
  };
}
function driverFilterField(id, value){
  return `<div class="field">${comboField(id, driverComboOptions('Lái xe'), value, 'Lái xe')}</div>`;
}
function scopeField(id, value){
  return `<div class="field"><select id="${id}">
    <option value="period"${value==='period'?' selected':''}>Chỉ kỳ đang xem</option>
    <option value="all"${value==='all'?' selected':''}>Tất cả các kỳ</option></select></div>`;
}
function periodTag(){
  return `<div class="periodtag">Kỳ: <b>${esc(periodCaption(appPeriod))}</b></div>`;
}
function rowActions(id){
  return `<button class="btn sm" data-edit="${id}">Sửa</button> <button class="btn sm danger" data-del="${id}">Xoá</button>`;
}
function bindRowActions(onEdit, onDelete){
  document.querySelectorAll('[data-edit]').forEach(b=>{ b.onclick = ()=>onEdit(b.dataset.edit); });
  document.querySelectorAll('[data-del]').forEach(b=>{ b.onclick = ()=>onDelete(b.dataset.del); });
}

/* =========================================================================
   MÀN HÌNH: BẢNG LƯƠNG
   ========================================================================= */
function renderPayroll(){
  const period = appPeriod;
  const rows = filteredPayrollRows(period);
  const warnings = buildWarnings();
  const sum = k => rows.reduce((s,r)=>s+r[k],0);
  const totalNet = sum('thucNhan'), totalGross = sum('tongThuNhap');
  const projects = allProjects();

  return `
    <div class="pagehead">
      <div>
        <h1>Bảng lương lái xe</h1>
        <p>Lương cố định + Lương chuyến (gồm cả tăng cường) + Phụ cấp + Thưởng/phạt nhiên liệu − Khấu trừ. ${esc(periodLabel(period))}.</p>
      </div>
      <div class="actions">
        <button class="btn" data-act="export-csv">Xuất CSV</button>
        <button class="btn primary" data-act="export-xlsx">Xuất Excel (.xlsx)</button>
      </div>
    </div>

    ${warnings.length ? `<div class="warnbox"><b>${warnings.length} cảnh báo dữ liệu</b> — nên kiểm tra trước khi chốt lương:
      <ul>${warnings.slice(0,6).map(w=>`<li>${esc(w)}</li>`).join('')}</ul>
      ${warnings.length>6?`<div class="hint">…và ${warnings.length-6} cảnh báo khác.</div>`:''}
    </div>` : ''}

    <div class="filterbar">
      ${driverFilterField('f-driver', filters.payroll.driver)}
      <div class="field">${comboField('f-project', customerComboOptions('Khách hàng', projects), filters.payroll.project, 'Khách hàng')}</div>
      <div class="field grow"><input type="text" id="f-q" placeholder="Mã hoặc tên lái xe…" value="${esc(filters.payroll.q)}"></div>
    </div>

    <div class="tablewrap">
      <table>
        <thead><tr>
          <th class="th-tools">${payrollCollapseAllBtn()}</th><th class="nowrap">Họ tên</th><th>Biển kiểm soát</th><th>Khách hàng gốc</th>
          <th class="num">Lương cố định</th><th class="num">Lương chuyến</th>
          <th class="num">Phụ cấp</th><th class="num">Thưởng/phạt NL</th><th class="num">Tổng thu nhập</th>
          <th class="num">Khấu trừ</th><th class="num">Thực nhận</th>
        </tr></thead>
        <tbody>
          ${rows.map(renderPayrollRow).join('') || `<tr><td colspan="11" class="empty">Không có dữ liệu phù hợp bộ lọc trong kỳ này.</td></tr>`}
        </tbody>
        ${rows.length?`<tfoot><tr class="total-row">
          <td colspan="4">Tổng cộng</td>
          <td class="num">${fmtMoney(sum('coDinh'))}</td>
          <td class="num">${fmtMoney(sum('chuyen')+sum('tangCuong'))}</td>
          <td class="num">${fmtMoney(sum('phuCap'))}</td>
          <td class="num">${fmtMoney(sum('thuong'))}</td>
          <td class="num">${fmtMoney(totalGross)}</td>
          <td class="num">${sum('khauTru')?'-'+fmtMoney(sum('khauTru')):'0'}</td>
          <td class="num">${fmtMoney(totalNet)}</td>
        </tr></tfoot>`:''}
      </table>
    </div>`;
}

/* Nút "thu gọn tất cả" nằm ở ô tiêu đề cột đầu, ngay bên trái cột Họ tên —
   mở vài dòng để đối chiếu rồi muốn dọn sạch thì bấm 1 nhát, không phải bấm
   đóng lại từng dòng. Luôn hiện (mờ đi + disabled khi chưa mở dòng nào) để
   bề rộng cột không nhảy mỗi lần sổ/thu dòng. */
const ICON_COLLAPSE_ALL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="m7 4 5 5 5-5"/><path d="m7 20 5-5 5 5"/></svg>`;
function payrollCollapseAllBtn(){
  // expandedRows chứa cả khoá dòng chính lẫn khoá dòng con "mã|loại" — đếm
  // riêng dòng chính để câu nhắc nói đúng số dòng người dùng nhìn thấy.
  const n = [...expandedRows].filter(k=>!k.includes('|')).length;
  const label = n ? `Thu gọn tất cả ${n} dòng đang mở` : 'Chưa có dòng nào đang mở';
  return `<button class="collapsebtn" data-act="collapse-all" ${n?'':'disabled'}
    aria-label="${esc(label)}" title="${esc(label)}">${ICON_COLLAPSE_ALL}</button>`;
}

/* Cột đầu Bảng lương: thay nút tam giác ▸/▾ bằng icon tình trạng dữ liệu của
   dòng đó — tam giác cảnh báo (còn thiếu đơn giá chuyến / chưa chấm nhiên
   liệu) hay dấu tích (đủ dữ liệu, chốt lương được). Trước đây phải mở từng
   dòng mới biết dòng nào còn thiếu; nay nhìn lướt cả cột là thấy.
   Vẫn là nút bấm để sổ/thu chi tiết như cũ — chỉ đổi hình, không đổi thao tác.
   Hai icon khác HÌNH chứ không chỉ khác màu (tam giác vs hình tròn) để người
   khó phân biệt màu vẫn đọc được, và dùng SVG thay vì emoji ⚠ cho nét icon
   đồng bộ, không đổi hình theo font hệ điều hành. */
const ICON_DATA_WARN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M10.29 3.86 1.82 18.1A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-2.9L13.71 3.86a2 2 0 0 0-3.42 0Z"/>
  <path d="M12 9v4.5"/><path d="M12 17.2h.01"/></svg>`;
const ICON_DATA_OK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="9"/><path d="m8.4 12.2 2.5 2.5 4.7-5"/></svg>`;
function payrollStatusToggle(key, warnings, open){
  const lack = warnings.length > 0;
  // Tooltip nói luôn THIẾU GÌ, không chỉ "có cảnh báo" — đỡ phải mở dòng ra xem.
  const state = lack ? `Thiếu dữ liệu: ${warnings.join(' · ')}` : 'Dữ liệu đã hoàn thiện';
  const title = `${state} — bấm để ${open?'thu':'xem'} chi tiết`;
  return `<button class="statusbtn ${lack?'lack':'done'}" data-toggle="${esc(key)}"
    aria-expanded="${open?'true':'false'}" aria-label="${esc(title)}" title="${esc(title)}"
    >${lack?ICON_DATA_WARN:ICON_DATA_OK}</button>`;
}

function renderPayrollRow(r){
  const key = r.driver.code;
  const open = expandedRows.has(key);
  const mainVeh = vehicleOfDriver(key)||{};
  const homeProject = mainVeh.homeProject;
  const out = [`
    <tr class="${r.warnings.length?'row-warn':''}">
      <td>${payrollStatusToggle(key, r.warnings, open)}</td>
      <td class="nowrap">${esc(r.driver.name)}${r.driver.status===STATUS_RESIGNED?' <span class="badge danger">Đã nghỉ</span>':''}</td>
      <td class="nowrap">${mainVeh.plate?`<span class="platecell">${esc(mainVeh.plate)}${mainVeh.capacity?` <span class="badge neutral">${esc(mainVeh.capacity)}T</span>`:''}</span>`:'<span class="muted">—</span>'}</td>
      <td>${homeProject?esc(homeProject):'<span class="muted">—</span>'}</td>
      <td class="num">${fmtMoney(r.coDinh)}</td>
      <td class="num">${fmtMoney(r.chuyen+r.tangCuong)}</td>
      <td class="num">${fmtMoney(r.phuCap)}</td>
      <td class="num">${fmtMoney(r.thuong)}</td>
      <td class="num">${fmtMoney(r.tongThuNhap)}</td>
      <td class="num">${r.khauTru?'-'+fmtMoney(r.khauTru):'0'}</td>
      <td class="num strong">${fmtMoney(r.thucNhan)}</td>
    </tr>`];
  if(open){
    out.push(`<tr class="expand-row"><td></td><td colspan="10">
      <div class="subaccordion">
        ${r.coDinhInfo.actual ? `<div class="subrow subrow-static">
          <span class="subrow-toggle"></span>
          <span class="subrow-label">Lương cố định</span>
          <span class="subrow-amount">${r.coDinhInfo.total ? `${fmtMoney(r.coDinhInfo.actual)} / ${fmtMoney(r.coDinhInfo.total)}` : fmtMoney(r.coDinhInfo.actual)} đ</span>
          <span class="subrow-meta muted">${[
            r.coDinhInfo.total ? `${r.coDinhInfo.workDays}/${r.coDinhInfo.standardDays} ngày công` : '',
            r.coDinhInfo.ntfDayQty ? `${r.coDinhInfo.ntfDayQty} ngày chạy riêng NTF` : '',
          ].filter(Boolean).join(' + ')}</span>
        </div>` : ''}
        ${renderPayrollSubrow(key, 'trips', 'Lương chuyến + Tăng cường', `${r.trips.length} chuyến${r.cancelled?` (+${r.cancelled} huỷ)`:''}`, r.chuyen+r.tangCuong, ()=>`
          <table><thead><tr><th>Ngày</th><th>Khách hàng — Chi tiết</th><th>Loại</th><th class="num">Đơn giá</th></tr></thead>
          <tbody>${r.trips.length ? r.trips.map(t=>{
            const price = tripUnitPrice(t);
            return `<tr><td>${fmtDate(t.date)}</td><td>${tripCustomerLabel(t, true)}${tripPointNoteHtml(t)}</td>
              <td>${tripTypeBadge(t)}</td>
              <td class="num">${price===null?'<span class="badge warn">Thiếu giá</span>':fmtMoney(price)}</td></tr>`;
          }).join('') : '<tr><td colspan="4" class="muted">Không có chuyến</td></tr>'}</tbody></table>`)}
        ${renderPayrollSubrow(key, 'phucap', 'Phụ cấp', `${r.phuCapLines.length} khoản`, r.phuCap, ()=>`
          <table><thead><tr><th>Loại</th><th>Đối tượng</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
          <tbody>${r.phuCapLines.length ? r.phuCapLines.map(l=>`<tr><td>${esc(l.name)}</td><td>${esc(l.target)}</td>
            <td class="num">${l.qty}</td><td class="num">${fmtMoney(l.rate)}</td><td class="num">${fmtMoney(l.amount)}</td></tr>`).join('')
            : '<tr><td colspan="5" class="muted">Không có</td></tr>'}</tbody></table>`)}
        ${renderPayrollSubrow(key, 'fuel', 'Thưởng/phạt nhiên liệu', 'Xe khoán dầu', r.thuong, ()=>`
          <table><thead><tr><th>Xe</th><th class="num">Tổng km</th><th class="num">Định mức</th><th class="num">Thực tế</th><th class="num">Tiết kiệm</th><th class="num">Thành tiền</th></tr></thead>
          <tbody>${r.fuelLines.length ? r.fuelLines.map(f=> f.missing
            ? `<tr><td>${esc(f.vehicle.plate)}</td><td colspan="5" class="muted">Chưa chấm nhiên liệu kỳ này</td></tr>`
            : `<tr><td>${esc(f.vehicle.plate)}</td><td class="num">${fmtMoney(f.totalKm)}</td>
                <td class="num">${fmtMoney(f.normFuel)} lít</td><td class="num">${fmtMoney(f.actualFuel)} lít</td>
                <td class="num">${fmtMoney(f.savedFuel)} lít</td><td class="num">${fmtMoney(f.amount)}</td></tr>`
          ).join('') : '<tr><td colspan="6" class="muted">Xe không khoán dầu</td></tr>'}</tbody></table>`)}
        ${renderPayrollSubrow(key, 'khautru', 'Khấu trừ', `${r.deductionLines.length} khoản`, -r.khauTru, ()=>`
          <table><thead><tr><th>Ngày</th><th>Loại</th><th>Lý do</th><th class="num">Số tiền</th></tr></thead>
          <tbody>${r.deductionLines.length ? r.deductionLines.map(d=>`<tr><td>${fmtDate(d.date)}</td><td>${esc(d.type)}</td>
            <td>${esc(d.reason||'')}</td><td class="num">${fmtMoney(d.amount)}</td></tr>`).join('')
            : '<tr><td colspan="4" class="muted">Không có</td></tr>'}</tbody></table>`)}
      </div>
      ${r.warnings.length?`<div class="hint"><span class="warn">⚠ ${r.warnings.map(esc).join(' · ')}</span></div>`:''}
    </td></tr>`);
  }
  return out.join('');
}
// Một dòng "loại lương" trong khung mở rộng của Bảng lương — bấm vào để
// sổ/thu bảng chi tiết ngay bên dưới, thay vì xếp 4 bảng cạnh nhau khó nhìn.
// Khoản nào bằng 0đ thì ẩn hẳn dòng (không hiện "0 đ" vô nghĩa) — đỡ rối mắt
// với lái xe hưởng lương cứng (VD GS/SEWS: Lương chuyến/Tăng cường/Khấu trừ
// thường 0 vì khách trả thẳng lương cứng, chỉ Lương cố định + Phụ cấp có số).
function renderPayrollSubrow(driverKey, sub, label, meta, amount, detailFn){
  if(amount===0) return '';
  const subKey = `${driverKey}|${sub}`;
  const open = expandedRows.has(subKey);
  const amountCls = amount<0 ? ' class="danger"' : '';
  let html = `<div class="subrow" data-toggle="${esc(subKey)}">
    <button class="linkbtn subrow-toggle" title="Xem chi tiết">${open?'▾':'▸'}</button>
    <span class="subrow-label">${esc(label)}</span>
    <span class="subrow-amount"${amountCls}>${amount<0?'-':''}${fmtMoney(Math.abs(amount))} đ</span>
    <span class="subrow-meta muted">${esc(meta)}</span>
  </div>`;
  if(open) html += `<div class="subrow-detail">${detailFn()}</div>`;
  return html;
}

function bindPayroll(){
  const $ = id=>document.getElementById(id);
  bindCombo('f-driver', driverComboOptions('Lái xe'));
  bindCombo('f-project', customerComboOptions('Khách hàng', allProjects()));
  $('f-driver').onchange = e=>{ filters.payroll.driver = e.target.value; render(); };
  $('f-project').onchange = e=>{ filters.payroll.project = e.target.value; render(); };
  $('f-q').oninput = e=>{ filters.payroll.q = e.target.value; render(); };
  document.querySelectorAll('[data-toggle]').forEach(b=>{
    b.onclick = ()=>{ const k=b.dataset.toggle; expandedRows.has(k)?expandedRows.delete(k):expandedRows.add(k); render(); };
  });
  const collapseAll = document.querySelector('[data-act="collapse-all"]');
  if(collapseAll) collapseAll.onclick = ()=>{ expandedRows.clear(); render(); };
  document.querySelector('[data-act="export-csv"]').onclick = exportPayrollCsv;
  document.querySelector('[data-act="export-xlsx"]').onclick = exportPayrollXlsx;
}

/* ---------------------------- Xuất dữ liệu ---------------------------- */
const PAYROLL_HEADER = ['Mã LX','Họ tên','Kỳ lương','Số chuyến','Lương cố định','Lương chuyến',
  'Tổng phụ cấp','Thưởng/phạt nhiên liệu','Tổng thu nhập','Tổng khấu trừ','Thực nhận'];
function payrollAoA(rows){
  return [PAYROLL_HEADER, ...rows.map(r=>[r.driver.code, r.driver.name, periodLabel(r.period), r.trips.length,
    Math.round(r.coDinh), Math.round(r.chuyen+r.tangCuong), Math.round(r.phuCap),
    Math.round(r.thuong), Math.round(r.tongThuNhap), Math.round(r.khauTru), Math.round(r.thucNhan)])];
}
async function saveFile(filename, content){
  if(downloads){
    try{ await downloads.save({ filename, data: content }); }
    catch(e){ if(e && e.code !== 'declined') toast('Xuất file thất bại: '+((e && e.message) || e), 'danger'); }
    return;
  }
  const blob = content instanceof Blob ? content : new Blob([content], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}
function toCsv(aoa){
  return aoa.map(row=>row.map(v=>{
    const s = String(v==null?'':v);
    return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(',')).join('\r\n');
}

/* ------------------- Nhập từ Excel (dùng chung mọi màn hình) -------------------
   Mọi màn hình nhập liệu đều theo một mạch: Tải mẫu Excel (có sẵn cột đúng tên)
   -> điền -> Nhập từ Excel -> xem lại -> lưu. */
function downloadSheets(filename, sheets){
  const wb = XLSX.utils.book_new();
  sheets.forEach(s=>XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.aoa), s.name));
  const buf = XLSX.write(wb, {type:'array', bookType:'xlsx'});
  saveFile(filename, new Blob([buf], {type:'application/octet-stream'}));
}
function downloadSheet(filename, aoa, sheetName){ downloadSheets(filename, [{name:sheetName, aoa}]); }
// Sheet "Danh mục" kèm trong file mẫu: liệt kê sẵn mã lái xe, biển số, mã khách
// hàng và tuyến để người điền copy cho đúng, khỏi bị sai mã lúc nhập lại.
function referenceSheetAoa(){
  const aoa = [['DANH SÁCH LÁI XE'], ['Mã LX','Họ tên']];
  [...state.drivers].sort((a,b)=>String(a.code).localeCompare(String(b.code)))
    .forEach(d=>aoa.push([d.code, d.name]));
  aoa.push([], ['DANH SÁCH XE'], ['Biển số','Khách hàng gốc']);
  [...state.vehicles].sort((a,b)=>String(a.plate).localeCompare(String(b.plate)))
    .forEach(v=>aoa.push([v.plate, v.homeProject||'']));
  aoa.push([], ['DANH SÁCH KHÁCH HÀNG'], ['Mã khách hàng','Tên khách hàng','Cách tính lương']);
  [...state.customers].sort((a,b)=>String(a.code).localeCompare(String(b.code)))
    .forEach(c=>aoa.push([c.code, c.name, calcMethodLabel(c.calcMethod)]));
  aoa.push([], ['DANH SÁCH TUYẾN'], ['Khách hàng','Tuyến đường','Đơn giá/chuyến']);
  [...state.routes].sort((a,b)=>String(a.project).localeCompare(String(b.project))||String(a.route).localeCompare(String(b.route)))
    .forEach(r=>aoa.push([r.project, r.route, safeNum(r.price)]));
  return aoa;
}
async function readSheetRows(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:'array'});
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
}
function importButtons(prefix){
  return `<button class="btn" data-act="${prefix}-template">Tải mẫu Excel</button>
    <button class="btn primary" data-act="${prefix}-import">Nhập từ Excel</button>
    <input type="file" id="${prefix}-import-file" accept=".xlsx,.xls,.csv" hidden>`;
}
function bindImportButtons(prefix, onTemplate, onImport){
  const tplBtn = document.querySelector(`[data-act="${prefix}-template"]`);
  if(!tplBtn) return;
  tplBtn.onclick = onTemplate;
  const fileInput = document.getElementById(prefix+'-import-file');
  document.querySelector(`[data-act="${prefix}-import"]`).onclick = ()=>fileInput.click();
  fileInput.onchange = async ()=>{
    const file = fileInput.files[0];
    fileInput.value = '';
    if(!file) return;
    let rows;
    try{ rows = await readSheetRows(file); }
    catch(e){ toast('Không đọc được file. Kiểm tra lại định dạng Excel/CSV.', 'danger'); return; }
    try{ await onImport(rows); }
    catch(e){ toast('Nhập file lỗi: '+((e && e.message) || e), 'danger'); }
  };
}
// Ngày trong Excel có thể là số sê-ri hoặc chuỗi dd/mm/yyyy — đưa hết về YYYY-MM-DD.
function parseSheetDate(v){
  if(v===''||v===undefined||v===null) return '';
  if(typeof v === 'number'){
    const d = XLSX.SSF.parse_date_code(v);
    return d ? d.y+'-'+pad2(d.m)+'-'+pad2(d.d) : '';
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return m[1]+'-'+pad2(+m[2])+'-'+pad2(+m[3]);
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if(m) return m[3]+'-'+pad2(+m[2])+'-'+pad2(+m[1]);
  return '';
}
function sheetYes(v){ return /^(c[óo]|x|1|true|yes)$/i.test(String(v==null?'':v).trim()); }
function exportPayrollCsv(){
  saveFile(`BangLuong_${appPeriod}.csv`, '﻿'+toCsv(payrollAoA(filteredPayrollRows(appPeriod))));
  toast('Đã tạo file CSV bảng lương kỳ '+periodCaption(appPeriod));
}
function exportPayrollXlsx(){
  const rows = filteredPayrollRows(appPeriod);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payrollAoA(rows)), 'Bang luong');

  // "Tuyến" = nguyên Tuyến đường đã cấu hình trong Lương theo tuyến; "Điểm
  // đi"/"Điểm đến" = đúng 2 ô riêng trên chuyến (để trống nếu chuyến chưa
  // nhập) — tách 3 cột riêng biệt, không gộp lại như cột hiển thị rút gọn ở
  // Lịch lái xe (xem tripOriginDestLabel).
  const tripsAoa = [['Ngày','Mã chuyến','Mã LX','Biển số','Khách hàng','Tuyến','Km','Bốc xếp','Điểm giao','Loại chuyến','Đơn giá','Doanh thu','Điểm đi','Điểm đến']];
  rows.forEach(r=>r.trips.forEach(t=>tripsAoa.push([fmtDate(t.date), t.tripCode||'', t.driverCode, t.plate, t.project, t.route||'',
    t.km ?? '', t.loadingCount||'', t.pointCount||'', tripTypeLabel(tripTypeOf(t)), tripUnitPrice(t) ?? '', safeNum(t.revenue),
    t.origin||'', t.destination||''])));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tripsAoa), 'Chi tiet chuyen');

  const allowAoa = [['Mã LX','Loại phụ cấp','Đối tượng','Đơn vị tính','Số lượng','Đơn giá','Thành tiền']];
  rows.forEach(r=>r.phuCapLines.forEach(l=>allowAoa.push([r.driver.code, l.name, l.target, unitLabel(l.unit), l.qty,
    Math.round(l.rate), Math.round(l.amount)])));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(allowAoa), 'Phu cap');

  const dedAoa = [['Mã LX','Ngày','Loại khoản','Lý do','Số tiền']];
  rows.forEach(r=>r.deductionLines.forEach(d=>dedAoa.push([d.driverCode, fmtDate(d.date), d.type, d.reason||'', Math.round(safeNum(d.amount))])));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dedAoa), 'Khau tru');

  const buf = XLSX.write(wb, {type:'array', bookType:'xlsx'});
  saveFile(`BangLuong_${appPeriod}.xlsx`, new Blob([buf], {type:'application/octet-stream'}));
  toast('Đã tạo file Excel 4 sheet cho kỳ '+periodCaption(appPeriod));
}

/* =========================================================================
   MÀN HÌNH: CHUYẾN ĐI
   ========================================================================= */
function renderTrips(){
  const f = filters.trips, q = f.q.trim().toLowerCase();
  const list = state.trips.filter(t=>{
    if(f.scope==='period' && getPeriod(t.date)!==appPeriod) return false;
    if(f.driver && t.driverCode!==f.driver) return false;
    if(f.project && t.project!==f.project) return false;
    if(q && !String(t.tripCode||'').toLowerCase().includes(q)
        && !String(t.driverCode).toLowerCase().includes(q)
        && !String(t.plate).toLowerCase().includes(q)) return false;
    return true;
  }).sort(byDateDesc);
  // Chỉ giữ lại tick chọn cho những chuyến vẫn đang hiện trong danh sách đã
  // lọc — đổi bộ lọc/xoá chuyến ở nơi khác thì tự bỏ tick chuyến không còn
  // thấy nữa, tránh xoá nhầm chuyến đang bị ẩn bởi bộ lọc hiện tại.
  const listIds = new Set(list.map(t=>t.id));
  [...selectedTripIds].forEach(id=>{ if(!listIds.has(id)) selectedTripIds.delete(id); });
  const allSelected = list.length>0 && list.every(t=>selectedTripIds.has(t.id));

  return `
    <div class="pagehead">
      <div><h1>Chuyến đi</h1><p>Mỗi chuyến chọn Khách hàng, hệ thống tự hiện các ô cần nhập theo đúng cách tính lương của khách hàng đó (tuyến, km, hay bốc xếp). Ô "Số điểm giao" luôn hiện để tính phụ cấp rớt điểm theo tải trọng xe. Chuyến ngoài khách hàng gốc của xe được tự đánh dấu tăng cường.</p></div>
      <div class="actions">${importButtons('trip')}
        <button class="btn danger" data-act="bulk-delete"${selectedTripIds.size?'':' disabled'}>Xoá đã chọn${selectedTripIds.size?` (${selectedTripIds.size})`:''}</button>
        <button class="btn primary" data-act="add">+ Thêm chuyến</button></div>
    </div>
    <div class="filterbar">
      ${scopeField('f-scope', f.scope)}
      ${f.scope==='period'?periodTag():''}
      ${driverFilterField('f-driver', f.driver)}
      <div class="field">${comboField('f-project', customerComboOptions('Khách hàng'), f.project, 'Khách hàng')}</div>
      <div class="field grow"><input type="text" id="f-q" placeholder="Mã chuyến / lái xe / biển số…" value="${esc(f.q)}"></div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th style="width:32px;"><input type="checkbox" id="trip-select-all"${allSelected?' checked':''}></th><th>Ngày</th><th class="nowrap">Lái xe</th><th>Biển số</th><th>Khách hàng — Chi tiết</th>
        <th>Điểm đi → đến</th><th>Loại</th><th></th></tr></thead>
      <tbody>${list.map(t=>{
        const price = tripUnitPrice(t);
        const cancelled = t.status===TRIP_CANCELLED;
        return `<tr class="${price===null?'row-warn':''}${cancelled?' row-muted':''}">
          <td><input type="checkbox" class="trip-select" data-id="${t.id}"${selectedTripIds.has(t.id)?' checked':''}></td>
          <td>${fmtDate(t.date)}</td>
          <td class="nowrap">${esc((driverByCode(t.driverCode)||{}).name || t.driverCode)}${driverByCode(t.driverCode)?'':' <span class="badge warn">?</span>'}</td>
          <td>${esc(t.plate)}${vehicleByPlate(t.plate)?'':' <span class="badge warn">?</span>'}</td>
          <td>${tripCustomerLabel(t)}</td>
          <td class="muted">${tripOriginDestLabel(t)}${tripPointNoteHtml(t, true)}</td>
          <td>${tripTypeBadge(t)}</td>
          <td>${rowActions(t.id)}</td></tr>`;
      }).join('') || `<tr><td colspan="8" class="empty">${f.scope==='period'?'Chưa có chuyến nào trong kỳ đang xem.':'Chưa có chuyến nào.'}</td></tr>`}
      </tbody></table></div>`;
}

// "Mã khách hàng — Chi tiết" — nếu Chi tiết đã tự bắt đầu bằng đúng mã khách
// hàng (VD "Tên tuyến" đặt là "GHN Thái Nguyên" cho khách hàng mã GHN) thì
// không lặp lại mã khách hàng nữa ("GHN — GHN Thái Nguyên" nhìn thừa) — chỉ
// hiện thẳng Chi tiết; không khớp thì vẫn hiện đủ "Mã — Chi tiết" như cũ.
function customerDetailLabel(project, detail){
  const p = String(project||''), d = String(detail||'');
  const startsWithCode = new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '(\\s|$)', 'i').test(d);
  return startsWithCode ? esc(d) : `${esc(p)} — ${esc(d)}`;
}
// Tên hiển thị của một tuyến — ưu tiên "Tên tuyến" (tên gọi nội bộ) nếu đã
// đặt, không có thì hiện thẳng "Tuyến đường" (Điểm đi – Điểm đến) như trước.
function routeDisplayName(project, route){
  const r = findRoute(project, route);
  return (r && r.routeName) ? r.routeName : route;
}
// Hiển thị Khách hàng + chi tiết theo đúng cách tính lương của khách hàng đó.
// fullRoute=true: hiện NGUYÊN "Tuyến đường" đầy đủ thay vì "Tên tuyến" rút
// gọn — chỉ dùng ở bảng chi tiết "Lương chuyến + Tăng cường" trong Bảng
// lương (dễ nhận biết đúng tuyến nào khi đối soát); "Lịch lái xe" vẫn giữ
// nguyên hiện "Tên tuyến" rút gọn như trước (mặc định fullRoute=false).
function tripCustomerLabel(t, fullRoute){
  const method = customerCalcMethod(t.project);
  if(method==='km'){
    if(isZeroRevenueTrip(t)) return `${esc(t.project)} <span class="muted">(${esc(tripTypeLabel(tripTypeOf(t)))} — không tính thêm)</span>`;
    if(t.route && findRoute(t.project, t.route)){
      const detail = fullRoute ? t.route : routeDisplayName(t.project, t.route);
      return `${customerDetailLabel(t.project, detail)} <span class="muted">(theo tuyến)</span>`;
    }
    const km = (t.km===null||t.km===undefined||t.km==='') ? '<span class="muted">chưa nhập km</span>' : `${fmtMoney(t.km)} km`;
    const cust = customerByCode(t.project);
    const regionNote = (cust && (cust.kmRegions||[]).length>1) ? ` <span class="muted">(${esc(zoneLabel(t.surgeZone))})</span>` : '';
    return `${esc(t.project)} — ${km}${regionNote}`;
  }
  if(method==='fixed') return `${esc(t.project)} <span class="muted">(lương cứng)</span>`;
  const detail = fullRoute ? t.route : routeDisplayName(t.project, t.route);
  if(method==='tripPlusExtras') return `${customerDetailLabel(t.project, detail)}<br><span class="muted">Bốc xếp ×${safeNum(t.loadingCount)}</span>`;
  return customerDetailLabel(t.project, detail);
}
// "Điểm giao ×N" — tách riêng khỏi tripCustomerLabel() để mỗi bảng tự đặt
// đúng vị trí: Chuyến đi để cạnh cột Điểm đi→đến, chi tiết chuyến trong
// Bảng lương vẫn để dưới Khách hàng — Chi tiết (không có cột điểm đi/đến).
// inline=true: rút gọn "(×N)" đứng cùng dòng (dùng ở cột Điểm đi→đến của
// Chuyến đi); mặc định: "Điểm giao ×N" xuống dòng riêng (dùng ở chi tiết
// chuyến trong Bảng lương, đứng dưới Khách hàng — Chi tiết).
function tripPointNoteHtml(t, inline){
  if(!(safeNum(t.pointCount)>0)) return '';
  return inline
    ? ` <span class="muted">(×${safeNum(t.pointCount)})</span>`
    : `<br><span class="muted">Điểm giao ×${safeNum(t.pointCount)}</span>`;
}

function nextTripCode(dateStr){
  const ymd = String(dateStr||'').replace(/-/g,'').slice(2);
  const prefix = 'CD'+ymd+'-';
  const used = new Set(state.trips.map(t=>t.tripCode));
  let n = 1;
  while(used.has(prefix+pad2(n))) n++;
  return prefix+pad2(n);
}
// Tuyến đường công ty đang đặt tên chủ yếu theo dạng "Kho A → Kho B" (mũi
// tên), không phải "A – B"/"A - B" như bản trước chỉ nhận. Ưu tiên tách theo
// "→" trước — tránh tách nhầm khi tên tuyến tình cờ có dấu gạch ngang ở chỗ
// khác (VD "1/2 - Kho CT GHN Thái Nguyên → ..."). CHỈ tách khi tuyến đúng 2
// chặng (1 điểm đi, 1 điểm đến rõ ràng) — tuyến nhiều chặng/khứ hồi (VD
// "Kho A → Kho B → Kho C → Kho A") KHÔNG tự suy ra 1 cặp điểm đi/đến (trả về
// null): thử rồi bỏ vì tách kiểu "điểm giữa xa nhất" vẫn làm mất thông tin
// so với hiện nguyên cả chuỗi Tuyến đường — xem tripOriginDestLabel(), nơi
// hiện thẳng nguyên "Tuyến đường" đã cấu hình cho các tuyến nhiều chặng thay
// vì cố suy ra Điểm đi/đến rút gọn. Chỉ khi tuyến không có mũi tên nào mới
// thử về kiểu "–"/"-" cũ (tương thích ngược).
function splitRouteName(route){
  const str = String(route||'');
  const byArrow = str.split(/\s*→\s*/);
  if(byArrow.length===2) return {origin:byArrow[0].trim(), destination:byArrow[1].trim()};
  if(byArrow.length>2) return null;
  const parts = str.split(/\s+[–-]\s+/);
  return parts.length===2 ? {origin:parts[0].trim(), destination:parts[1].trim()} : null;
}
// Cột "Điểm đi → đến" ở Lịch lái xe: ưu tiên hiện Điểm đi/Điểm đến nếu chuyến
// đã có (dù gõ tay hay tự điền khi chọn Tuyến đường lúc nhập chuyến); không
// có thì hiện nguyên "Tuyến đường" đầy đủ đã cấu hình trong "Lương theo
// tuyến" nếu route khớp (kể cả tuyến nhiều chặng — hiện nguyên chuỗi, không
// rút gọn); không có gì thì để trống.
function tripOriginDestLabel(t){
  if(t.origin && t.destination) return esc(t.origin) + ' → ' + esc(t.destination);
  if(t.route && findRoute(t.project, t.route)) return esc(t.route);
  return '';
}

function tripModalHtml(t, isNew){
  return `
    <h3>${isNew?'Thêm chuyến':'Sửa chuyến'}</h3>
    <div class="modal-grid">
      ${ERROR_SLOT}
      <div class="modal-field"><label for="m-date">Ngày *</label><input type="date" id="m-date" value="${esc(t.date||'')}"></div>
      <div class="modal-field"><label for="m-code">Mã chuyến</label><input type="text" id="m-code" value="${esc(t.tripCode||'')}"></div>
      <div class="modal-field"><label for="m-driver-text">Lái xe *</label>${comboField('m-driver', driverComboOptions('— Chọn —'), t.driverCode, 'Gõ mã hoặc tên lái xe…')}</div>
      <div class="modal-field"><label for="m-plate-text">Biển số xe *</label>${comboField('m-plate', vehicleComboOptions('— Chọn —'), t.plate, 'Gõ biển số…')}</div>
      <div class="modal-field full"><label for="m-project-text">Khách hàng *</label>${comboField('m-project', customerComboOptions('— Chọn —'), t.project, 'Gõ mã hoặc tên khách hàng…')}</div>
      <div id="m-method-fields" class="modal-grid full" style="padding:0;"></div>
      <div class="modal-field"><label for="m-origin">Điểm đi</label><input type="text" id="m-origin" value="${esc(t.origin||'')}"></div>
      <div class="modal-field"><label for="m-dest">Điểm đến</label><input type="text" id="m-dest" value="${esc(t.destination||'')}"></div>
      <div class="modal-field"><label for="m-point">Số điểm giao</label><input type="number" min="0" step="1" id="m-point" value="${t.pointCount!=null?t.pointCount:''}">
        <div class="hint">Điểm giao đầu tiên không tính; từ điểm thứ 2 trở đi tự cộng phụ cấp rớt điểm theo tải trọng xe.</div></div>
      <div class="modal-field full"><label for="m-triptype">Loại chuyến</label><select id="m-triptype">${selectOptions(TRIP_TYPES, tripTypeOf(t))}</select>
        <div class="hint">Tăng cường: chạy ngoài khách hàng gốc của xe. Trả hàng: đi trả nốt hàng của chuyến hôm trước không kịp giao trong ngày. Trực: xe không chạy chuyến nào cả. Trả điểm: 1 điểm giao thêm của đúng chuyến "Chuyến" cùng ngày/xe/khách hàng, ghi riêng 1 dòng để hiện đủ trên Lịch lái xe thay vì gộp vào ô "Số điểm giao" của chuyến chính — mỗi dòng Trả điểm tự tính 1 điểm vào Phụ cấp rớt điểm. Trả hàng, Trực và Trả điểm đều luôn 0đ tiền chuyến (không tính thêm Lương chuyến/Tăng cường), chỉ cộng thêm 1 ngày công cho Lương cố định. Nghỉ: xe không hoạt động — luôn 0đ và KHÔNG cộng ngày công (khác Trực), chỉ để ghi nhận lịch xe nghỉ.</div></div>
      <div class="full hint" id="m-preview"></div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="m-cancel">Huỷ</button>
      ${isNew?'<button class="btn" id="m-save-more">Lưu &amp; thêm tiếp</button>':''}
      <button class="btn primary" id="m-save">Lưu</button>
    </div>`;
}

function openTripModal(trip, prefill){
  const isNew = !trip;
  const base = trip || Object.assign({ date: todayISO(), status:'Hoàn thành', isSurge:false }, prefill||{});
  if(isNew && !base.tripCode) base.tripCode = nextTripCode(base.date);
  openModal(tripModalHtml(base, isNew));

  const $ = id => document.getElementById(id);
  let codeTouched = !isNew;
  let typeTouched = !isNew;

  function currentMethod(){ return customerCalcMethod($('m-project').value); }

  // Mỗi khách hàng cần các ô nhập khác nhau: route/tripPlusExtras cần chọn
  // Tuyến (tra bảng giá); km cần nhập số km; fixed không cần ô nào thêm.
  function methodFieldsHtml(method, seed){
    if(method==='km'){
      const cust = customerByCode($('m-project').value);
      const surge = isSurgeTrip(seed);
      const regions = (cust && cust.kmRegions) || [];
      const zeroRevenue = isZeroRevenueTrip(seed);
      const zone = seed.surgeZone || 'inner';
      // Đúng 1 ô "Khu vực" DÙNG CHUNG cho mọi loại chuyến (trước đây tách
      // riêng "Khu vực tăng cường" + "Khu vực" khiến chuyến tăng cường Ngoại
      // tỉnh phải chọn 2 lần cùng 1 câu trả lời — xem phản hồi người dùng đã
      // gộp lại). Tăng cường LUÔN cần chọn (quyết định giá cố định, không
      // suy được từ đâu khác); chuyến thường chỉ cần hỏi khi khách hàng có
      // cấu hình CẢ 2 khu vực — chỉ 1 khu vực thì kmRegionFor tự dùng đúng
      // khu vực đó (xem length===1), không cần hỏi.
      const needZoneField = !zeroRevenue && (surge || regions.length>1);
      const zoneField = needZoneField
        ? `<div class="modal-field"><label for="m-surgezone">Khu vực *</label><select id="m-surgezone">
            <option value="inner"${zone==='inner'?' selected':''}>Nội thành</option>
            <option value="outer"${zone==='outer'?' selected':''}>Ngoại tỉnh</option>
          </select></div>`
        : '';
      if(surge){
        return `${zoneField}
          <div class="modal-field"><label for="m-km">Số km${zone==='outer'?' *':''}</label><input type="number" id="m-km" value="${seed.km!=null?seed.km:''}"></div>
          <div class="full hint">Nội thành trả cố định, không cần nhập km. Ngoại tỉnh: trong ngưỡng km trả cố định; vượt ngưỡng tra theo bảng "Bậc thang km × tải trọng xe" (chuyến thường, đúng khu vực Ngoại tỉnh) của khách hàng này theo đúng km và tải trọng xe${customerHasLongHaulConfig(cust)?', đồng thời tự cộng thêm "Phụ cấp đường dài" (lương cứng tháng theo tải trọng xe / 28 ngày)':''} — các mức cố định/ngưỡng cấu hình ở Cấu hình › Khách hàng › Sửa "${esc(cust?cust.name:$('m-project').value)}".</div>`;
      }
      // Tuỳ chọn: khách "Theo km" có thể có 1 vài tuyến chạy giá cố định đã
      // cấu hình ở "Bảng giá theo tuyến" (xem routeCustomerCodes/tripBasePrice)
      // — chọn/gõ đúng tên tuyến đó thì tính theo đơn giá tuyến, để trống thì
      // vẫn tính bậc thang km như bình thường. Chuyến 0đ (Trả hàng/Trực/Trả
      // điểm/Nghỉ) vẫn HIỆN ô này (không ẩn) để ghi chú tuyến nếu muốn — trước
      // đây ẩn hẳn khiến gõ vào cũng không lưu được (currentDraft() đọc thẳng
      // từ #m-route, ô không tồn tại thì luôn ra rỗng dù người dùng đã gõ).
      const kmRouteField = (()=>{
        const routeOpts = routeComboOptions($('m-project').value);
        return `<div class="modal-field full"><label for="m-route-text">Tuyến đường (chỉ khi chạy đúng tuyến cố định)</label>${
          comboField('m-route', routeOpts, (seed && seed.route) || '', 'Để trống nếu tính theo bậc thang km')}</div>`;
      })();
      return `<div class="modal-field"><label for="m-km">Số km${zeroRevenue?'':' *'}</label><input type="number" id="m-km" value="${seed.km!=null?seed.km:''}">
        ${zeroRevenue?'<div class="hint">Không bắt buộc — chuyến này 0đ, chỉ để ghi chú nếu muốn.</div>':''}</div>
        ${zoneField}
        ${kmRouteField}`;
    }
    if(method==='fixed'){
      return `<div class="full hint">Khách hàng này trả lương cứng cho lái xe theo kỳ — chuyến chỉ ghi nhận vận hành, không cộng thêm lương.</div>`;
    }
    const routeOpts = routeComboOptions($('m-project').value);
    const routeField = `<div class="modal-field"><label for="m-route-text">Tuyến đường *</label>${
      comboField('m-route', routeOpts, (seed && seed.route) || '', routeOpts.length>1?'Gõ tên tuyến…':'Chưa có tuyến cho khách hàng này')}</div>`;
    if(method==='tripPlusExtras'){
      return routeField
        + `<div class="modal-field"><label for="m-loading">Số lượt bốc xếp</label><input type="number" min="0" step="1" id="m-loading" value="${seed.loadingCount!=null?seed.loadingCount:''}"></div>`;
    }
    return routeField; // 'route'
  }
  function bindRouteCombo(){
    if(!$('m-route')) return;
    bindCombo('m-route', routeComboOptions($('m-project').value));
    $('m-route').onchange = ()=>{
      const parts = splitRouteName($('m-route').value);
      if(parts && !$('m-origin').value && !$('m-dest').value){
        $('m-origin').value = parts.origin;
        $('m-dest').value = parts.destination;
      }
      refreshPreview();
    };
  }
  function refreshMethodFields(seed){
    const method = currentMethod();
    $('m-method-fields').innerHTML = methodFieldsHtml(method, seed || {});
    bindRouteCombo();
    if($('m-km')) $('m-km').oninput = refreshPreview;
    if($('m-surgezone')) $('m-surgezone').onchange = ()=>{ refreshMethodFields(currentDraft()); refreshPreview(); };
    if($('m-loading')) $('m-loading').oninput = refreshPreview;
  }
  // Tự chọn "Tăng cường" khi xe chạy ngoài khách hàng gốc của nó — chỉ khi
  // người dùng chưa tự tay đổi Loại chuyến (không tự đụng vào lựa chọn "Trả hàng").
  function autoDetectType(){
    if(typeTouched) return;
    const veh = vehicleByPlate($('m-plate').value);
    const project = $('m-project').value;
    const mismatch = !!(veh && veh.homeProject && project && veh.homeProject !== project);
    $('m-triptype').value = mismatch ? 'surge' : 'normal';
  }
  function currentDraft(){
    return {
      project: $('m-project').value,
      route: $('m-route') ? $('m-route').value : '',
      tripType: $('m-triptype').value,
      km: $('m-km') ? ($('m-km').value===''?null:safeNum($('m-km').value)) : null,
      surgeZone: $('m-surgezone') ? $('m-surgezone').value : '',
      loadingCount: $('m-loading') ? safeNum($('m-loading').value) : 0,
      pointCount: safeNum($('m-point').value),
    };
  }
  function refreshPreview(){
    const draft = currentDraft();
    const method = currentMethod();
    const veh = vehicleByPlate($('m-plate').value);
    const dropped = tripDroppedPoints(draft);
    const dropRate = pointDropRateFor(veh ? veh.capacity : 0);
    const dropHtml = dropped>0
      ? `<br>Phụ cấp rớt điểm: ${dropped} điểm × ${fmtMoney(dropRate)} đ = <b>${fmtMoney(dropped*dropRate)} đ</b>.`
      : '';
    if(!draft.project){ $('m-preview').innerHTML = 'Chọn Khách hàng để xem đơn giá áp dụng.' + dropHtml; return; }
    if(draft.tripType==='return'){
      $('m-preview').innerHTML = 'Trả hàng — chuyến này luôn 0đ (lương km/tuyến đã tính ở chuyến gốc), chỉ cộng thêm 1 ngày công cho Lương cố định. Không cần chọn Tuyến đường/Khu vực.' + dropHtml;
      return;
    }
    if(draft.tripType==='standby'){
      $('m-preview').innerHTML = 'Trực — ngày này xe không chạy chuyến nào, luôn 0đ, chỉ cộng thêm 1 ngày công cho Lương cố định (nếu lái xe có Lương cố định). Không cần chọn Tuyến đường/Khu vực.' + dropHtml;
      return;
    }
    if(draft.tripType==='point'){
      $('m-preview').innerHTML = 'Trả điểm — 1 điểm giao thêm của chuyến "Chuyến" chính cùng ngày/xe/khách hàng, luôn 0đ tiền chuyến (Lương chuyến đã tính ở chuyến chính), chỉ ghi riêng để hiện đủ trên Lịch lái xe — tự tính 1 điểm vào Phụ cấp rớt điểm bên dưới. Không cần chọn Tuyến đường/Khu vực/Số km.' + dropHtml;
      return;
    }
    if(draft.tripType==='off'){
      $('m-preview').innerHTML = 'Nghỉ — xe không hoạt động ngày này, luôn 0đ và KHÔNG cộng ngày công cho Lương cố định (khác Trực), không tính phụ cấp rớt điểm. Không cần chọn Tuyến đường/Khu vực/Số km.';
      return;
    }
    if(method==='fixed'){
      $('m-preview').innerHTML = 'Khách hàng trả lương cứng cho lái xe — chuyến này không cộng thêm lương.' + dropHtml;
      return;
    }
    if((method==='route'||method==='tripPlusExtras') && !draft.route){
      $('m-preview').innerHTML = 'Chọn Tuyến đường để xem đơn giá áp dụng.' + dropHtml;
      return;
    }
    if((method==='route'||method==='tripPlusExtras') && !findRoute(draft.project, draft.route)){
      $('m-preview').innerHTML = '<span class="warn">Chưa có đơn giá cho cặp Khách hàng + Tuyến này — vào Cấu hình › Bảng giá theo tuyến để thêm.</span>' + dropHtml;
      return;
    }
    const matchedKmRoute = (method==='km' && draft.route) ? findRoute(draft.project, draft.route) : null;
    const price = tripUnitPrice(draft);
    const surge = isSurgeTrip(draft);
    let html;
    if(price===null){
      html = method!=='km' ? '<span class="warn">Chưa đủ dữ liệu để tính đơn giá — kiểm tra lại số km.</span>'
        : surge ? '<span class="warn">Chưa cấu hình đủ đơn giá tăng cường (Nội thành/Ngoại tỉnh), chưa nhập số km, hoặc vượt ngưỡng km mà chưa có đơn giá bậc thang km cho đúng khoảng km/tải trọng xe này — vào Cấu hình › Khách hàng › Sửa để thêm.</span>'
        : '<span class="warn">Chưa có đơn giá bậc thang km cho đúng khoảng km/khu vực/tải trọng xe này — vào Cấu hình › Khách hàng › Sửa để thêm.</span>';
    }else{
      html = `Đơn giá áp dụng: <b>${fmtMoney(price)} đ</b> — tính vào <b>${surge?'Lương tăng cường':'Lương chuyến'}</b>.`;
      if(method==='tripPlusExtras') html += ' (đã gồm bốc xếp)';
      if(matchedKmRoute) html += ' (theo đơn giá Tuyến, không tra bậc thang km)';
    }
    if(surge && veh && veh.homeProject && veh.homeProject !== draft.project && !typeTouched){
      html += `<br>Tự đánh dấu tăng cường vì khách hàng gốc của xe là ${esc(veh.homeProject)}.`;
    }
    html += dropHtml;
    $('m-preview').innerHTML = html;
  }
  function onProjectChange(seed){ refreshMethodFields(seed||{}); autoDetectType(); refreshPreview(); }

  refreshMethodFields(base);
  autoDetectType();
  refreshPreview();

  const driverOpts = driverComboOptions('— Chọn —');
  const plateOpts = vehicleComboOptions('— Chọn —');
  const projectOpts = customerComboOptions('— Chọn —');
  bindCombo('m-driver', driverOpts);
  bindCombo('m-plate', plateOpts);
  bindCombo('m-project', projectOpts);

  $('m-code').oninput = ()=>{ codeTouched = true; };
  $('m-date').onchange = ()=>{ if(!codeTouched) $('m-code').value = nextTripCode($('m-date').value); };
  // Lái xe → Biển số tự điền (đúng 1 xe/lái xe, xem vehicleOfDriver) — không
  // còn chiều ngược lại (Biển số → Lái xe) vì 1 xe giờ có thể có NHIỀU lái xe
  // cùng chọn (dùng chung xe theo ca), không còn 1 đáp án duy nhất để tự điền.
  $('m-driver').onchange = ()=>{
    const veh = vehicleOfDriver($('m-driver').value);
    if(veh && !$('m-plate').value){ setComboValue('m-plate', plateOpts, veh.plate); $('m-plate').onchange(); }
  };
  $('m-plate').onchange = ()=>{
    const veh = vehicleByPlate($('m-plate').value);
    if(veh){
      if(!$('m-project').value && veh.homeProject && allProjects().includes(veh.homeProject)){
        setComboValue('m-project', projectOpts, veh.homeProject);
        onProjectChange();
        return;
      }
    }
    autoDetectType();
    refreshPreview();
  };
  $('m-project').onchange = ()=>onProjectChange();
  $('m-triptype').onchange = ()=>{ typeTouched = true; refreshMethodFields(currentDraft()); refreshPreview(); };
  $('m-point').oninput = refreshPreview;
  $('m-cancel').onclick = closeModal;

  async function save(keepGoing){
    const method = currentMethod();
    const draft = currentDraft();
    const data = {
      date: $('m-date').value, tripCode: $('m-code').value.trim(), driverCode: $('m-driver').value,
      plate: $('m-plate').value, project: draft.project,
      route: (method==='route'||method==='tripPlusExtras'||method==='km') ? draft.route : '',
      km: method==='km' ? draft.km : null,
      surgeZone: method==='km' ? (draft.surgeZone || (isSurgeTrip(draft) ? 'inner' : '')) : '',
      loadingCount: method==='tripPlusExtras' ? draft.loadingCount : 0,
      pointCount: draft.pointCount,
      origin: $('m-origin').value.trim(), destination: $('m-dest').value.trim(),
      tripType: draft.tripType,
    };
    if(isNew) data.status = 'Hoàn thành'; // chuyến mới luôn tính lương — sai thì xoá, không đánh dấu Huỷ nữa
    if(!data.date || !data.driverCode || !data.plate || !data.project){
      modalError('Cần nhập đủ: Ngày, Lái xe, Biển số và Khách hàng.');
      return;
    }
    // Trả hàng/Trực luôn 0đ (xem tripUnitPrice) nên không bắt buộc chọn Tuyến
    // đường/Khu vực như chuyến thường — chỉ cần ngày/lái xe/xe/khách hàng
    // để tính đúng ngày công cho Lương cố định.
    if(!isZeroRevenueTrip(draft) && (method==='route'||method==='tripPlusExtras') && !data.route){
      modalError('Khách hàng này tính lương theo tuyến — cần chọn Tuyến đường.');
      return;
    }
    if(trip) await updateDoc('trips', trip.id, data); else await addDoc('trips', data);
    if(keepGoing){
      toast('Đã lưu chuyến '+(data.tripCode||'')+'. Nhập tiếp chuyến mới.');
      openTripModal(null, { date:data.date, driverCode:data.driverCode, plate:data.plate, project:data.project });
    }else{
      closeModal();
      toast(trip ? 'Đã cập nhật chuyến.' : 'Đã thêm chuyến vào kỳ '+periodCaption(getPeriod(data.date)));
    }
  }
  $('m-save').onclick = ()=>save(false);
  if(isNew) $('m-save-more').onclick = ()=>save(true);
}

/* Nhập chuyến hàng loạt từ Excel: mỗi dòng một chuyến, kiểm tra từng dòng rồi
   mới ghi — dòng sai được liệt kê cụ thể để sửa lại trong file. */
// Tên cột "Loại chuyến" kèm gợi ý các giá trị hợp lệ trong ngoặc — gợi ý này
// đổi theo TRIP_TYPES mỗi khi thêm loại chuyến mới (đã từng đổi khi thêm Trả
// điểm, Nghỉ...), nên file mẫu Excel người dùng tải về TỪ TRƯỚC sẽ có cột
// tên CŨ, không khớp hằng số này nữa. Không tách hằng số riêng cho tên cột
// này thì việc đọc dữ liệu từ file cũ sẽ luôn ra rỗng — xem normalizeTripTypeColumn.
const TRIP_TYPE_HEADER = `Loại chuyến (${TRIP_TYPES.map(t=>t.l).join('/')})`;
// MỘT cột "Khu vực" DÙNG CHUNG cho mọi loại chuyến của khách hàng "Theo km"
// (Nội thành/Ngoại tỉnh) — trước đây có 2 cột trùng lặp: "Khu vực (chỉ khi
// KH Theo km có nhiều khu vực)" cho chuyến thường (tra bậc thang km) và
// "Khu vực tăng cường" riêng cho chuyến tăng cường (giá cố định), khiến
// người dùng phải trả lời cùng 1 câu hỏi 2 lần và dễ điền nhầm cột (xem phản
// hồi người dùng: 2 cột cùng chỉ 1 khái niệm Nội thành/Ngoại tỉnh) — gộp lại
// còn đúng 1 cột, dùng cho cả tra bậc thang km lẫn giá cố định tăng cường.
const KM_ZONE_HEADER = 'Khu vực (chỉ khi KH Theo km; Nội thành/Ngoại tỉnh)';
const TRIP_IMPORT_HEADER = ['Ngày','Mã chuyến','Mã LX','Biển số','Khách hàng','Tuyến đường',
  'Số km','Số lượt bốc xếp','Số điểm giao',
  TRIP_TYPE_HEADER, KM_ZONE_HEADER,'Điểm đi','Điểm đến'];
// Chấp nhận gõ tự do: để trống hoặc "Chuyến" -> normal; "Có"/"x" (mẫu cũ) cũng
// hiểu là Tăng cường cho khỏi hỏng file mẫu tải từ trước.
function parseTripType(raw){
  const s = String(raw==null?'':raw).trim().toLowerCase();
  if(!s || s==='chuyến' || s==='chuyen') return 'normal';
  if(s==='trả hàng' || s==='tra hang') return 'return';
  if(s==='trực' || s==='truc') return 'standby';
  if(s==='trả điểm' || s==='tra diem') return 'point';
  if(s==='nghỉ' || s==='nghi') return 'off';
  if(s==='tăng cường' || s==='tang cuong' || sheetYes(raw)) return 'surge';
  return 'normal';
}
// undefined = gõ sai/không nhận diện được (báo lỗi ở validateTripImportRow);
// null = để trống — chuyến tăng cường mặc định "Nội thành" khi lưu (giống
// hệt mặc định của ô "Khu vực *" trong modal sửa tay), chuyến thường để
// trống thì tuỳ theo khách hàng có cần chọn hay không (xem zoneNeeded).
function parseKmZone(raw){
  const s = String(raw==null?'':raw).trim().toLowerCase();
  if(!s) return null;
  if(s==='nội thành' || s==='noi thanh' || s==='inner') return 'inner';
  if(s==='ngoại tỉnh' || s==='ngoai tinh' || s==='outer') return 'outer';
  return undefined;
}
// File mẫu tải về từ bản cũ có tên cột "Loại chuyến (...)" khác (thiếu gợi ý
// loại mới thêm sau này) — sheet_to_json lấy đúng tên cột trong file làm khoá
// nên đọc thẳng theo TRIP_TYPE_HEADER hiện tại sẽ ra rỗng. Tìm mọi cột bắt
// đầu bằng "Loại chuyến" trong dòng rồi gộp giá trị vào đúng khoá hiện tại.
function normalizeTripTypeColumn(row){
  if(row[TRIP_TYPE_HEADER]) return row;
  const legacyKey = Object.keys(row).find(k => k!==TRIP_TYPE_HEADER && k.startsWith('Loại chuyến'));
  return legacyKey ? { ...row, [TRIP_TYPE_HEADER]: row[legacyKey] } : row;
}
function exportTripTemplate(){
  downloadSheets(`MauChuyenDi_${appPeriod}.xlsx`, [
    { name:'Chuyen di', aoa:[TRIP_IMPORT_HEADER, TRIP_IMPORT_HEADER.map(()=>'')] },
    { name:'Danh muc', aoa:referenceSheetAoa() },
  ]);
  toast('Đã tạo file mẫu (kèm sheet "Danh mục" để copy đúng mã) — điền xong dùng "Nhập từ Excel". Ngày dạng dd/mm/yyyy.');
}
function isBlankTripImportRow(row){
  return !String(row['Ngày']||'').trim() && !String(row['Mã LX']||'').trim()
    && !String(row['Biển số']||'').trim() && !String(row['Khách hàng']||'').trim();
}
function mintTripCode(date, usedCodes){
  const prefix = 'CD'+String(date).replace(/-/g,'').slice(2)+'-';
  let n = 1; while(usedCodes.has(prefix+pad2(n))) n++;
  const code = prefix+pad2(n); usedCodes.add(code); return code;
}
// Cột "Kiểm tra" của bảng soát lỗi Excel: dòng hợp lệ hiện badge "OK", dòng
// lỗi hiện 1 icon nổi bật thay vì in cả câu lỗi dài — đưa chuột qua icon để
// xem đúng lỗi là gì qua tooltip riêng (setupImportTooltip, đọc "data-tip"
// ở đây) chứ không dùng "title" mặc định của trình duyệt, vì "title" không
// kiểm soát được độ rộng/xuống dòng. "errors" là mảng {field, message} —
// field dùng riêng để tô hồng đúng ô cần sửa (xem importCellClass).
function importErrorCellHtml(errors){
  if(!errors.length) return '<span class="badge good">OK</span>';
  return `<span class="import-err-icon" data-tip="${esc(errors.map(e=>e.message).join(' '))}">⚠</span>`;
}
// Class tô HỒNG cho đúng ô input cần bổ sung/sửa/bỏ bớt — field khớp tên
// cột gây lỗi ở validateTripImportRow/validateDeductImportRow.
function importCellClass(errors, field){
  return errors.some(e=>e.field===field) ? 'qty-input import-cell-bad' : 'qty-input';
}
// Gợi ý 1-2 ví dụ THẬT (lấy ngay từ dữ liệu đang có) để đính kèm vào câu báo
// lỗi ở bảng soát lỗi Excel — dễ hình dung hơn là chỉ nói "sai định dạng".
function importHint(list){
  const sample = list.filter(Boolean).slice(0,2).join(', ');
  return sample ? ` VD: ${sample}.` : '';
}
// Kiểm tra + chuẩn hoá 1 dòng theo đúng cột TRIP_IMPORT_HEADER — dùng CHUNG
// cho cả lần đọc file Excel ban đầu và bảng soát lỗi sửa trực tiếp trên web
// (openTripImportReviewModal) để không lệch quy tắc giữa 2 nơi. "row['Ngày']"
// phải đã là chuỗi ISO "YYYY-MM-DD" (gọi parseSheetDate trước khi truyền vào).
function validateTripImportRow(row, usedCodes){
  const errors = [];    // { field, message } — field = đúng tên cột TRIP_IMPORT_HEADER cần sửa
  const err = (field, message)=>errors.push({field, message});
  const date = row['Ngày'] || '';
  const driverCode = String(row['Mã LX']||'').trim();
  const plate = String(row['Biển số']||'').trim();
  const project = String(row['Khách hàng']||'').trim();
  const routeName = String(row['Tuyến đường']||'').trim();
  const driverHint = ()=>importHint(state.drivers.map(d=>d.code));
  const plateHint = ()=>importHint(state.vehicles.map(v=>v.plate));
  const customerHint = ()=>importHint(state.customers.map(c=>c.code));
  if(!date) err('Ngày', 'Thiếu hoặc sai định dạng Ngày.' + importHint(['20/09/2026']));
  if(!driverCode) err('Mã LX', 'Thiếu Mã LX.' + driverHint());
  else if(!driverByCode(driverCode)) err('Mã LX', `Mã lái xe "${driverCode}" không có trong danh sách.` + driverHint());
  if(!plate) err('Biển số', 'Thiếu Biển số.' + plateHint());
  else if(!vehicleByPlate(plate)) err('Biển số', `Biển số "${plate}" không có trong danh sách xe.` + plateHint());
  if(!project) err('Khách hàng', 'Thiếu Khách hàng.' + customerHint());
  else if(!customerByCode(project)) err('Khách hàng', `Mã khách hàng "${project}" không có trong mục Khách hàng.` + customerHint());
  // "Trả hàng"/"Trực" luôn 0đ (xem tripUnitPrice) nên không bắt buộc đủ
  // Tuyến đường/Khu vực như chuyến thường — vẫn lưu lại nếu có điền, chỉ là
  // không bắt buộc phải điền/khớp bảng giá.
  const tripTypeRaw = row[TRIP_TYPE_HEADER];
  const zeroRevenue = ZERO_REVENUE_TRIP_TYPES.includes(parseTripType(tripTypeRaw));
  let method = null, cust = null, needRoute = false, matchedKmRoute = null;
  if(project && customerByCode(project)){
    cust = customerByCode(project);
    method = cust.calcMethod;
    needRoute = method==='route' || method==='tripPlusExtras';
    const requireRoute = needRoute && !zeroRevenue;
    const routeHint = ()=>importHint(routesForProject(project).map(r=>r.route));
    if(requireRoute && !routeName) err('Tuyến đường', `Khách hàng ${project} tính theo tuyến nhưng thiếu Tuyến đường.` + routeHint());
    else if(requireRoute && !findRoute(project, routeName)) err('Tuyến đường', `Chưa có đơn giá cho "${project} — ${routeName}".` + routeHint());
    // Khách "Theo km" không bắt buộc điền Tuyến đường — nhưng nếu có điền
    // VÀ khớp đúng 1 tuyến đã cấu hình ở "Bảng giá theo tuyến" thì chuyến đó
    // tính theo đơn giá tuyến (xem tripBasePrice), không cần Khu vực nữa.
    if(method==='km' && routeName) matchedKmRoute = findRoute(project, routeName);
  }
  const isSurge = parseTripType(tripTypeRaw) === 'surge';
  const zoneRaw = String(row[KM_ZONE_HEADER]||'').trim();
  const parsedZone = parseKmZone(zoneRaw);
  if(method==='km' && zoneRaw && parsedZone===undefined){
    err(KM_ZONE_HEADER, `Khu vực "${zoneRaw}" không hợp lệ — chỉ nhận "Nội thành" hoặc "Ngoại tỉnh".`
      + importHint(['Nội thành','Ngoại tỉnh']));
  }
  // Khu vực chỉ THẬT SỰ bắt buộc chọn khi: chuyến tăng cường (luôn cần,
  // quyết định giá cố định — không suy được từ đâu khác), hoặc chuyến
  // thường mà khách hàng có cấu hình CẢ 2 khu vực (chỉ 1 khu vực thì hệ
  // thống tự dùng đúng khu vực đó, xem kmRegionFor) — khớp đúng điều kiện
  // hiện field này trong modal sửa tay (methodFieldsHtml) để không bắt nhập
  // thừa/thiếu khác với khi sửa tay.
  const zoneNeeded = method==='km' && !zeroRevenue && !matchedKmRoute && cust
    && (isSurge || (cust.kmRegions||[]).length>1);
  if(zoneNeeded && !parsedZone){
    err(KM_ZONE_HEADER, `${isSurge ? `Chuyến tăng cường` : `Khách hàng ${project} có nhiều khu vực giá km nhưng chuyến`} chưa chọn Khu vực (Nội thành/Ngoại tỉnh).`);
  }
  const surgeZone = method==='km' ? (parsedZone || (isSurge ? 'inner' : '')) : '';
  let code = String(row['Mã chuyến']||'').trim();
  if(code && usedCodes.has(code)) err('Mã chuyến', `Mã chuyến "${code}" đã tồn tại — sửa lại hoặc xoá trống để tự đặt mã khác.`);
  if(errors.length) return { errors, data:null };
  if(code) usedCodes.add(code); else code = mintTripCode(date, usedCodes);
  const km = row['Số km'];
  const parts = splitRouteName(routeName);
  const data = {
    date, tripCode: code, driverCode, plate, project,
    route: (needRoute || method==='km') ? routeName : '',
    km: method==='km' ? ((km===''||km===undefined) ? null : safeNum(km)) : null,
    surgeZone,
    loadingCount: method==='tripPlusExtras' ? safeNum(row['Số lượt bốc xếp']) : 0,
    pointCount: safeNum(row['Số điểm giao']),
    origin: String(row['Điểm đi']||'').trim() || (parts?parts.origin:''),
    destination: String(row['Điểm đến']||'').trim() || (parts?parts.destination:''),
    tripType: parseTripType(tripTypeRaw),
    status: 'Hoàn thành',
  };
  return { errors:[], data };
}
async function importTripsExcel(rows){
  const meaningful = rows.filter(row=>!isBlankTripImportRow(row));
  if(!meaningful.length){ alert('File không có dữ liệu chuyến.'); return; }
  const normalized = meaningful.map(row=>normalizeTripTypeColumn({ ...row, 'Ngày': parseSheetDate(row['Ngày']) }));
  const usedCodes = new Set(state.trips.map(t=>t.tripCode).filter(Boolean));
  const checked = normalized.map(row=>({ row, ...validateTripImportRow(row, usedCodes) }));
  const errorCount = checked.filter(c=>c.errors.length).length;
  // Luôn mở bảng soát trước khi ghi — kể cả khi không có dòng lỗi — để người
  // dùng xem lại đúng dữ liệu (đặc biệt Loại chuyến) trước khi bấm nhập, thay
  // vì ghi thẳng chỉ qua 1 dòng confirm() không thấy được nội dung từng dòng.
  toast(errorCount
    ? `File có ${errorCount}/${checked.length} dòng lỗi — sửa trực tiếp ngay trong bảng bên dưới.`
    : `Đã đọc ${checked.length} dòng — soát lại rồi bấm "Nhập các dòng hợp lệ".`, errorCount?'danger':undefined);
  openTripImportReviewModal(normalized);
}
// Bảng soát + sửa lỗi ngay trên web khi file Excel có dòng sai — thay vì bắt
// sửa lại file rồi tải lên lại. Sửa ô nào xong (bấm ra ngoài ô đó) là tự
// kiểm tra lại đúng dòng đó ngay; dòng còn lỗi giữ nguyên trong bảng tới khi
// sửa đúng hoặc bấm "Bỏ dòng này".
function openTripImportReviewModal(normalizedRows){
  let draft = normalizedRows.map((row, i)=>({ id:i, row:{...row} }));
  function revalidateAll(){
    const usedCodes = new Set(state.trips.map(t=>t.tripCode).filter(Boolean));
    draft.forEach(d=>{
      const { errors, data } = validateTripImportRow(d.row, usedCodes);
      d.errors = errors; d.data = data;
    });
  }
  revalidateAll();

  function rowHtml(d){
    const r = d.row, bad = d.errors.length>0;
    const f = name=>`data-import-field="${esc(name)}"`;
    const c = (field, extra)=>importCellClass(d.errors, field) + (extra?' '+extra:'');
    return `<tr class="${bad?'row-warn':''}" data-import-row="${d.id}">
      <td><input type="date" class="${c('Ngày')}" ${f('Ngày')} value="${esc(r['Ngày']||'')}"></td>
      <td><input type="text" class="${c('Mã chuyến')}" style="width:88px;" ${f('Mã chuyến')} value="${esc(r['Mã chuyến']||'')}" placeholder="Tự đặt"></td>
      <td><input type="text" class="${c('Mã LX')}" style="width:70px;" ${f('Mã LX')} value="${esc(r['Mã LX']||'')}"></td>
      <td><input type="text" class="${c('Biển số')}" style="width:96px;" ${f('Biển số')} value="${esc(r['Biển số']||'')}"></td>
      <td><input type="text" class="${c('Khách hàng')}" style="width:80px;" ${f('Khách hàng')} value="${esc(r['Khách hàng']||'')}"></td>
      <td><input type="text" class="${c('Tuyến đường','text')}" style="min-width:170px;" ${f('Tuyến đường')} value="${esc(r['Tuyến đường']||'')}"></td>
      <td><input type="number" class="${c('Số km')}" style="width:70px;" ${f('Số km')} value="${r['Số km']!=null?r['Số km']:''}"></td>
      <td><input type="number" class="${c('Số lượt bốc xếp')}" style="width:56px;" ${f('Số lượt bốc xếp')} value="${r['Số lượt bốc xếp']!=null?r['Số lượt bốc xếp']:''}"></td>
      <td><input type="number" class="${c('Số điểm giao')}" style="width:56px;" ${f('Số điểm giao')} value="${r['Số điểm giao']!=null?r['Số điểm giao']:''}"></td>
      <td><select class="${c(TRIP_TYPE_HEADER)}" ${f(TRIP_TYPE_HEADER)}>
        ${TRIP_TYPES.map(t=>`<option value="${esc(t.l)}"${parseTripType(r[TRIP_TYPE_HEADER])===t.v?' selected':''}>${esc(t.l)}</option>`).join('')}
      </select></td>
      <td><select class="${c(KM_ZONE_HEADER)}" ${f(KM_ZONE_HEADER)}>
        <option value=""${!r[KM_ZONE_HEADER]?' selected':''}>—</option>
        <option value="Nội thành"${r[KM_ZONE_HEADER]==='Nội thành'?' selected':''}>Nội thành</option>
        <option value="Ngoại tỉnh"${r[KM_ZONE_HEADER]==='Ngoại tỉnh'?' selected':''}>Ngoại tỉnh</option>
      </select></td>
      <td><input type="text" class="${c('Điểm đi','text')}" style="min-width:120px;" ${f('Điểm đi')} value="${esc(r['Điểm đi']||'')}"></td>
      <td><input type="text" class="${c('Điểm đến','text')}" style="min-width:120px;" ${f('Điểm đến')} value="${esc(r['Điểm đến']||'')}"></td>
      <td style="text-align:center;">${importErrorCellHtml(d.errors)}</td>
      <td><button type="button" class="btn sm danger" data-remove-import-row="${d.id}">Bỏ</button></td>
    </tr>`;
  }
  function bodyHtml(){
    const okCount = draft.filter(d=>!d.errors.length).length;
    return `<h3>Soát &amp; sửa lỗi trước khi nhập chuyến</h3>
      <p class="muted" style="margin:0 0 10px;">Dòng nền vàng còn lỗi — sửa trực tiếp ngay trong bảng, sửa xong ô nào tự kiểm tra lại dòng đó, không cần tải lại file. Bấm "Bỏ" để loại dòng không muốn nhập.</p>
      <div class="tablewrap" style="max-height:55vh;overflow:auto;"><table>
        <thead><tr>${TRIP_IMPORT_HEADER.map(h=>`<th>${esc(h)}</th>`).join('')}<th>Kiểm tra</th><th></th></tr></thead>
        <tbody id="import-review-body">${draft.length ? draft.map(rowHtml).join('') : `<tr><td colspan="${TRIP_IMPORT_HEADER.length+2}" class="empty">Không còn dòng nào.</td></tr>`}</tbody>
      </table></div>
      <div class="modal-actions" style="justify-content:space-between;align-items:center;">
        <span class="muted">${okCount}/${draft.length} dòng hợp lệ, sẵn sàng nhập.</span>
        <div>
          <button class="btn" id="m-cancel">Đóng</button>
          <button class="btn primary" id="m-import-save">Nhập các dòng hợp lệ</button>
        </div>
      </div>`;
  }
  function refresh(){
    replaceModalBody(bodyHtml());
    bind();
  }
  function bind(){
    document.querySelectorAll('#import-review-body [data-import-field]').forEach(el=>{
      el.onchange = ()=>{
        const id = Number(el.closest('tr').dataset.importRow);
        const d = draft.find(x=>x.id===id);
        d.row[el.dataset.importField] = el.value;
        revalidateAll();
        refresh();
      };
    });
    document.querySelectorAll('[data-remove-import-row]').forEach(btn=>{
      btn.onclick = ()=>{ draft = draft.filter(d=>d.id!==Number(btn.dataset.removeImportRow)); refresh(); };
    });
    document.getElementById('m-cancel').onclick = closeModal;
    document.getElementById('m-import-save').onclick = async ()=>{
      const validRows = draft.filter(d=>!d.errors.length);
      if(!validRows.length){ toast('Chưa có dòng nào hợp lệ để nhập.', 'danger'); return; }
      await addManyDocs('trips', validRows.map(d=>d.data));
      toast(`Đã nhập ${validRows.length} chuyến.`);
      draft = draft.filter(d=>d.errors.length);
      if(!draft.length){ closeModal(); return; }
      revalidateAll();
      refresh();
    };
  }
  openModal(bodyHtml(), { wide:true });
  bind();
}

function bindTrips(){
  const $ = id=>document.getElementById(id);
  bindCombo('f-driver', driverComboOptions('Lái xe'));
  bindCombo('f-project', customerComboOptions('Khách hàng'));
  $('f-scope').onchange = e=>{ filters.trips.scope = e.target.value; render(); };
  $('f-driver').onchange = e=>{ filters.trips.driver = e.target.value; render(); };
  $('f-project').onchange = e=>{ filters.trips.project = e.target.value; render(); };
  $('f-q').oninput = e=>{ filters.trips.q = e.target.value; render(); };
  bindImportButtons('trip', exportTripTemplate, importTripsExcel);
  document.querySelector('[data-act="add"]').onclick = ()=>{
    if(!state.customers.length){ toast('Cần cấu hình Khách hàng trước khi nhập chuyến.', 'danger'); setSection('cfg-customers'); return; }
    openTripModal(null, null);
  };
  bindRowActions(
    id => openTripModal(state.trips.find(t=>t.id===id), null),
    async id => {
      const t = state.trips.find(x=>x.id===id);
      if(confirm(`Xoá chuyến ${t.tripCode||''} ngày ${fmtDate(t.date)}?`)){ await deleteDoc('trips', id); toast('Đã xoá chuyến.'); }
    }
  );
  // Tick chọn hàng loạt để xoá nhiều chuyến 1 lần — cập nhật thẳng DOM (nút
  // "Xoá đã chọn"/ô chọn tất cả) thay vì gọi render() lại toàn trang mỗi lần
  // tick 1 dòng, để không nhảy cuộn trang mỗi lần chọn.
  function updateBulkDeleteUI(){
    const btn = document.querySelector('[data-act="bulk-delete"]');
    if(btn){
      btn.disabled = selectedTripIds.size===0;
      btn.textContent = selectedTripIds.size ? `Xoá đã chọn (${selectedTripIds.size})` : 'Xoá đã chọn';
    }
    const selectAll = $('trip-select-all');
    if(selectAll){
      const boxes = [...document.querySelectorAll('.trip-select')];
      selectAll.checked = boxes.length>0 && boxes.every(b=>b.checked);
    }
  }
  document.querySelectorAll('.trip-select').forEach(cb=>{
    cb.onchange = ()=>{
      if(cb.checked) selectedTripIds.add(cb.dataset.id); else selectedTripIds.delete(cb.dataset.id);
      updateBulkDeleteUI();
    };
  });
  $('trip-select-all').onchange = e=>{
    const checked = e.target.checked;
    document.querySelectorAll('.trip-select').forEach(cb=>{
      cb.checked = checked;
      if(checked) selectedTripIds.add(cb.dataset.id); else selectedTripIds.delete(cb.dataset.id);
    });
    updateBulkDeleteUI();
  };
  document.querySelector('[data-act="bulk-delete"]').onclick = async ()=>{
    if(!selectedTripIds.size) return;
    const ids = [...selectedTripIds];
    if(!confirm(`Xoá ${ids.length} chuyến đã chọn? Không thể hoàn tác.`)) return;
    for(const id of ids) await deleteDoc('trips', id);
    selectedTripIds.clear();
    toast(`Đã xoá ${ids.length} chuyến.`);
  };
}

/* =========================================================================
   MÀN HÌNH: CHẤM CÔNG PHỤ CẤP (số lượng theo kỳ)
   ========================================================================= */
const usageDraft = new Map();              // giữ số đang gõ, không mất khi trang vẽ lại
const usageKey = (c, period) => `${c.targetType}|${c.targetId}|${c.allowanceTypeId}|${period}`;

// Một dòng phụ cấp của một lái xe, cho đúng dự án gốc của xe đang phụ trách:
// "Theo ngày công" tự tính từ Chuyến đi (không sửa được); "Theo lần phát
// sinh" (perOccurrence/perOccurrenceByProject) nhập tay, giữ nguyên cơ chế
// chấm công + usageDraft như trước.
function allowanceLinesForDriver(driverCode, period){
  const trips = state.trips.filter(t=>t.driverCode===driverCode && getPeriod(t.date)===period && t.status!==TRIP_CANCELLED);
  const days = tripDaysCount(trips);
  const homeProject = driverHomeProject(driverCode);
  const lines = state.allowanceTypes
    .filter(t=>t.unit==='perDay' || unitNeedsManualUsage(t.unit))
    .map(type=>({ type, rate: allowanceRateFor(type, homeProject) }))
    .filter(x=>x.rate!=null)
    .map(({type,rate})=>{
      const c = { targetType:'driver', targetId:driverCode, allowanceTypeId:type.id };
      if(type.unit==='perDay'){
        return { config:c, type, rate, auto:true, key:null, savedId:null, savedQty:days, qty:days };
      }
      const saved = state.allowanceUsage.find(u=>u.targetType==='driver' && u.targetId===driverCode
        && u.allowanceTypeId===type.id && u.period===period);
      const key = usageKey(c, period);
      const savedQty = saved ? safeNum(saved.quantity) : 0;
      return { config:c, type, rate, auto:false, key, savedId: saved ? saved.id : null, savedQty,
        qty: usageDraft.has(key) ? usageDraft.get(key) : savedQty };
    });
  return lines.sort((a,b)=> String(a.type.name).localeCompare(String(b.type.name)));
}
function allowanceUsageDriverRows(period){
  return state.drivers
    .map(d=>({ driver:d, lines: allowanceLinesForDriver(d.code, period) }))
    .filter(r=>r.lines.length)
    .sort((a,b)=> String(a.driver.code).localeCompare(String(b.driver.code)));
}
function lineAmount(l){ return safeNum(l.rate) * safeNum(l.qty); }

function renderAllowanceUsage(){
  const rows = allowanceUsageDriverRows(appPeriod);
  const allLines = rows.flatMap(r=>r.lines);
  const dirty = allLines.filter(l=>!l.auto && l.qty!==l.savedQty).length;
  return `
    <div class="pagehead">
      <div><h1>Chấm công phụ cấp</h1>
        <p>Mỗi lái xe một dòng — bấm vào dòng để xem các phụ cấp. "Theo ngày công" tự động đếm theo số ngày có chuyến ở mục Chuyến đi; "Theo lần phát sinh" (đã tick gán) và phụ cấp tự động theo dự án dạng nhập tay (VD Phụ cấp chờ) mới cần nhập số lượng ở đây.</p></div>
      ${rows.length?`<div class="actions">${importButtons('usage')}</div>`:''}
    </div>
    <div class="filterbar">${periodTag()}</div>
    <div class="tablewrap"><table>
      <thead><tr><th></th><th>Mã LX</th><th>Họ tên</th><th class="num">Số phụ cấp</th><th class="num">Thành tiền</th></tr></thead>
      <tbody>${rows.length ? rows.map(r=>renderAllowanceDriverRow(r)).join('')
        : `<tr><td colspan="5" class="empty">Chưa có lái xe nào cần chấm công phụ cấp kỳ này. Vào Cấu hình › Phụ cấp để gán hoặc thêm loại tự động theo dự án.</td></tr>`}
      </tbody></table></div>
    ${rows.length?`<div class="savebar">
      <button class="btn primary" id="usage-save"${dirty?'':' disabled'}>Lưu chấm công kỳ này</button>
      <span class="status${dirty?' dirty':''}">${dirty?`● ${dirty} dòng đang sửa chưa lưu`:'Đã lưu, không có thay đổi'}</span>
    </div>`:''}`;
}

function renderAllowanceDriverRow(r){
  const key = r.driver.code;
  const open = expandedRows.has(key);
  const total = r.lines.reduce((s,l)=>s+lineAmount(l),0);
  const out = [`
    <tr>
      <td><button class="linkbtn" data-toggle="${esc(key)}" title="Xem chi tiết">${open?'▾':'▸'}</button></td>
      <td>${esc(key)}</td><td>${esc(r.driver.name)}</td>
      <td class="num">${r.lines.length}</td>
      <td class="num">${fmtMoney(total)}</td>
    </tr>`];
  if(open){
    out.push(`<tr class="expand-row"><td></td><td colspan="4">
      <table><thead><tr><th>Loại phụ cấp</th><th>Đơn vị tính</th><th class="num">Đơn giá</th>
        <th class="num">Số lượng</th><th class="num">Thành tiền</th></tr></thead>
      <tbody>${r.lines.map(l=>`<tr><td>${esc(l.type.name)}</td><td>${esc(unitLabel(l.type.unit))}</td>
        <td class="num">${l.rate===null?'<span class="badge warn">Chưa có đơn giá</span>':fmtMoney(l.rate)}</td>
        <td class="num">${l.auto
          ? `${l.qty} <span class="muted">(tự động)</span>`
          : `<input type="text" inputmode="numeric" id="usage-${esc(idSafe(l.key))}" class="qty-input${l.qty!==l.savedQty?' dirty':''}" data-usage-key="${esc(l.key)}" value="${l.qty}">`}</td>
        <td class="num">${fmtMoney(lineAmount(l))}</td></tr>`).join('')}</tbody></table>
    </td></tr>`);
  }
  return out.join('');
}

/* Mẫu chấm công dạng bảng ngang: mỗi lái xe một dòng, mỗi loại phụ cấp "Theo
   lần phát sinh" một cột — nạp lại vào bản nháp để soát trước khi Lưu. */
function manualAllowanceTypes(){
  return state.allowanceTypes
    .filter(t=>unitNeedsManualUsage(t.unit) && Object.keys(t.rates||{}).length)
    .sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
function exportUsageTemplate(){
  const types = manualAllowanceTypes();
  const rows = allowanceUsageDriverRows(appPeriod);
  const aoa = [['Mã LX','Họ tên', ...types.map(t=>t.name)]];
  rows.forEach(r=>{
    aoa.push([r.driver.code, r.driver.name, ...types.map(t=>{
      const l = r.lines.find(x=>!x.auto && x.type.id===t.id);
      return l ? l.qty : '';
    })]);
  });
  if(!types.length) aoa[0] = ['Mã LX','Họ tên','(chưa có loại phụ cấp nào tính theo lần phát sinh)'];
  downloadSheet(`MauChamCongPhuCap_${appPeriod}.xlsx`, aoa, 'Cham cong');
  toast('Đã tạo file mẫu — điền số lần phát sinh rồi dùng "Nhập từ Excel" để nạp lại.');
}
function importUsageExcel(rows){
  const types = manualAllowanceTypes();
  if(!types.length){ toast('Chưa có loại phụ cấp nào tính theo lần phát sinh để nhập.', 'danger'); return; }
  const driverRows = allowanceUsageDriverRows(appPeriod);
  let applied = 0, skipped = 0;
  rows.forEach(row=>{
    const code = String(row['Mã LX']||'').trim();
    if(!code) return;
    const dr = driverRows.find(r=>r.driver.code===code);
    if(!dr){ skipped++; return; }
    let touched = false;
    types.forEach(t=>{
      const raw = row[t.name];
      if(raw==='' || raw===undefined) return;
      const line = dr.lines.find(l=>!l.auto && l.type.id===t.id);
      if(!line) return;                      // lái xe này không được gán loại đó
      const val = safeNum(raw);
      if(val === line.savedQty) usageDraft.delete(line.key); else usageDraft.set(line.key, val);
      touched = true;
    });
    if(touched) applied++;
  });
  toast(applied
    ? `Đã nạp ${applied} lái xe từ file — kiểm tra lại rồi bấm "Lưu chấm công kỳ này".${skipped?` (bỏ qua ${skipped} dòng không khớp mã lái xe)`:''}`
    : 'Không có dòng nào khớp mã lái xe đang được gán phụ cấp theo lần phát sinh.', applied?undefined:'danger');
  scheduleRender();
}

function bindAllowanceUsage(){
  document.querySelectorAll('[data-toggle]').forEach(b=>{
    b.onclick = ()=>{ const k=b.dataset.toggle; expandedRows.has(k)?expandedRows.delete(k):expandedRows.add(k); render(); };
  });
  bindImportButtons('usage', exportUsageTemplate, importUsageExcel);
  const rows = allowanceUsageDriverRows(appPeriod);
  const allLines = rows.flatMap(r=>r.lines);
  document.querySelectorAll('[data-usage-key]').forEach(input=>{
    input.oninput = ()=>{
      const l = allLines.find(x=>x.key===input.dataset.usageKey);
      const val = safeNum(input.value);
      if(val === l.savedQty) usageDraft.delete(l.key); else usageDraft.set(l.key, val);
      scheduleRender();
    };
  });
  const btn = document.getElementById('usage-save');
  if(!btn) return;
  btn.onclick = async ()=>{
    const changed = allLines.filter(l=>!l.auto && l.qty !== l.savedQty);   // chỉ ghi dòng thật sự đổi
    btn.disabled = true;
    for(const l of changed){
      const data = { targetType:l.config.targetType, targetId:l.config.targetId,
        allowanceTypeId:l.config.allowanceTypeId, period:appPeriod, quantity:l.qty };
      if(l.savedId) await updateDoc('allowanceUsage', l.savedId, data);
      else await addDoc('allowanceUsage', data);
      usageDraft.delete(l.key);
    }
    toast(`Đã lưu ${changed.length} dòng chấm công cho kỳ ${periodCaption(appPeriod)}`);
    scheduleRender();
  };
}

/* =========================================================================
   MÀN HÌNH: NHIÊN LIỆU (chỉ áp dụng xe "Khoán dầu" — công thức tự tính)
   ========================================================================= */
// Khoá theo "kỳ|biển số" — bắt buộc gắn kỳ vào khoá, nếu không khi đổi kỳ lương
// lúc đang gõ dở, giá trị nháp của kỳ cũ sẽ bị hiểu nhầm là của kỳ mới và có
// thể ghi đè sai dữ liệu khi bấm Lưu.
const fuelDraft = new Map();       // "kỳ|biển số" -> {field: giá trị đang gõ}, chưa lưu
const fuelPriceDraft = new Map();  // kỳ -> đơn giá dầu đang gõ, chưa lưu
function fuelDraftKey(period, plate){ return period+'|'+plate; }
const FUEL_FIELDS = ['odoStart','odoEnd','stockStart','purchased','stockEnd'];
// Cột file Excel mẫu — cột đầu để khớp biển số, các cột sau map thẳng vào FUEL_FIELDS.
const FUEL_IMPORT_COLS = [
  { header:'Biển số',            field:null },
  { header:'Km đầu kỳ',          field:'odoStart' },
  { header:'Km cuối kỳ',         field:'odoEnd' },
  { header:'Tồn đầu (lít)',      field:'stockStart' },
  { header:'Đổ trong kỳ (lít)',  field:'purchased' },
  { header:'Tồn cuối (lít)',     field:'stockEnd' },
];

function fuelManagedVehicles(){ return state.vehicles.filter(v=>v.fuelManagement===FUEL_MANAGED); }
function computeFuelPreview(vehicle, vals, price){
  const totalKm = safeNum(vals.odoEnd) - safeNum(vals.odoStart);
  const actualFuel = safeNum(vals.stockStart) + safeNum(vals.purchased) - safeNum(vals.stockEnd);
  const normFuel = totalKm * safeNum(vehicle.fuelNorm) / 100;
  const savedFuel = normFuel - actualFuel;
  const amount = savedFuel * price;
  return { totalKm, actualFuel, normFuel, savedFuel, amount };
}
function fuelRowsFor(period){
  const price = fuelPriceDraft.has(period) ? fuelPriceDraft.get(period) : fuelPriceOf(period);
  return fuelManagedVehicles().sort((a,b)=>String(a.plate).localeCompare(String(b.plate))).map(v=>{
    const saved = vehicleFuelLog(v.plate, period);
    const savedVals = Object.fromEntries(FUEL_FIELDS.map(k=>[k, saved ? (saved[k]??null) : null]));
    const draft = fuelDraft.get(fuelDraftKey(period, v.plate)) || {};
    const vals = {...savedVals, ...draft};
    const hasAnyValue = FUEL_FIELDS.some(k=>vals[k]!=null && vals[k]!=='');
    return {
      vehicle:v, period, savedId: saved?saved.id:null, savedVals, vals, price,
      dirty: FUEL_FIELDS.some(k=>draft[k]!==undefined),
      prev: vehicleFuelLog(v.plate, shiftPeriod(period,-1)),
      hasAnyValue, calc: computeFuelPreview(v, vals, price),
    };
  });
}
function renderFuel(){
  const period = appPeriod;
  const savedPrice = fuelPriceOf(period);
  const priceDirty = fuelPriceDraft.has(period);
  const price = priceDirty ? fuelPriceDraft.get(period) : savedPrice;
  const rows = fuelRowsFor(period);
  const unmanagedCount = state.vehicles.length - rows.length;
  const dirtyCount = rows.filter(r=>r.dirty).length + (priceDirty?1:0);
  return `
    <div class="pagehead">
      <div><h1>Nhiên liệu</h1>
        <p>Chỉ áp dụng xe "Khoán dầu": mỗi kỳ chấm km công tơ mét + tồn/đổ dầu, hệ thống tự tính thưởng/phạt tiết kiệm cộng vào lương của lái xe phụ trách. Xe "Không khoán" cấp dầu theo thực tế, không thưởng/phạt.</p></div>
      ${rows.length?`<div class="actions">${importButtons('fuel')}</div>`:''}
    </div>
    <div class="filterbar">${periodTag()}
      <div class="field"><label for="fuel-price">Đơn giá dầu kỳ này (đ/lít)</label>
        <input type="text" inputmode="decimal" id="fuel-price" class="qty-input${priceDirty?' dirty':''}" style="width:130px;" value="${price||''}"></div>
    </div>
    ${unmanagedCount?`<div class="hint" style="margin:-6px 0 14px;">${unmanagedCount} xe "Không khoán" không hiện ở đây — cấp dầu theo thực tế, không thưởng/phạt.</div>`:''}
    <div class="tablewrap"><table>
      <thead><tr><th>Xe</th><th>Lái xe phụ trách</th>
        <th class="num">Km đầu kỳ</th><th class="num">Km cuối kỳ</th>
        <th class="num">Tồn đầu (lít)</th><th class="num">Đổ trong kỳ (lít)</th><th class="num">Tồn cuối (lít)</th>
        <th class="num">Tổng km</th><th class="num">Dầu định mức</th><th class="num">Dầu thực tế</th>
        <th class="num">Tiết kiệm</th><th class="num">Thưởng/phạt</th></tr></thead>
      <tbody>${rows.length ? rows.map(renderFuelRow).join('')
        : `<tr><td colspan="12" class="empty">Chưa có xe nào đặt "Khoán dầu". Vào Cấu hình › Xe để bật.</td></tr>`}
      </tbody></table></div>
    ${rows.length?`<div class="savebar">
      <button class="btn primary" id="fuel-save"${dirtyCount?'':' disabled'}>Lưu chấm nhiên liệu kỳ này</button>
      <span class="status${dirtyCount?' dirty':''}">${dirtyCount?`● ${dirtyCount} mục đang sửa chưa lưu`:'Đã lưu, không có thay đổi'}</span>
    </div>`:''}`;
}
function fuelFieldDirty(r, field){ const d = fuelDraft.get(fuelDraftKey(r.period, r.vehicle.plate)); return !!(d && d[field]!==undefined); }
function fuelNumInput(r, field){
  return `<input type="text" inputmode="decimal" id="fuel-${idSafe(r.vehicle.plate)}-${field}" class="qty-input${fuelFieldDirty(r,field)?' dirty':''}"
    data-fuel-plate="${esc(r.vehicle.plate)}" data-fuel-field="${field}" value="${r.vals[field]!=null?r.vals[field]:''}">`;
}
function renderFuelRow(r){
  const v = r.vehicle;
  const prevHint = r.prev ? `<div class="hint">Kỳ trước: km cuối ${fmtMoney(r.prev.odoEnd)} · tồn cuối ${fmtMoney(r.prev.stockEnd)} lít</div>` : '';
  return `<tr>
    <td><b>${esc(v.plate)}</b><div class="muted">Định mức ${esc(v.fuelNorm)} L/100km</div>${prevHint}</td>
    <td>${vehicleDriversLabel(v.plate)}</td>
    <td class="num">${fuelNumInput(r,'odoStart')}</td>
    <td class="num">${fuelNumInput(r,'odoEnd')}</td>
    <td class="num">${fuelNumInput(r,'stockStart')}</td>
    <td class="num">${fuelNumInput(r,'purchased')}</td>
    <td class="num">${fuelNumInput(r,'stockEnd')}</td>
    <td class="num">${r.hasAnyValue?fmtMoney(r.calc.totalKm):'—'}</td>
    <td class="num">${r.hasAnyValue?fmtMoney(r.calc.normFuel)+' lít':'—'}</td>
    <td class="num">${r.hasAnyValue?fmtMoney(r.calc.actualFuel)+' lít':'—'}</td>
    <td class="num">${r.hasAnyValue?fmtMoney(r.calc.savedFuel)+' lít':'—'}</td>
    <td class="num strong">${r.hasAnyValue?fmtMoney(r.calc.amount):'—'}</td>
  </tr>`;
}
// Xuất file mẫu (điền sẵn biển số + số liệu đang có) và nạp lại từ file đã điền —
// nạp vào bản nháp (fuelDraft) giống như gõ tay, để xem lại trước khi bấm Lưu.
function exportFuelTemplate(){
  const period = appPeriod;
  const rows = fuelRowsFor(period);
  const aoa = [FUEL_IMPORT_COLS.map(c=>c.header)];
  rows.forEach(r=>{
    aoa.push([r.vehicle.plate, ...FUEL_IMPORT_COLS.slice(1).map(c=> r.vals[c.field]!=null ? r.vals[c.field] : '')]);
  });
  downloadSheet(`MauNhienLieu_${period}.xlsx`, aoa, 'Nhien lieu');
  toast('Đã tạo file mẫu — điền số liệu rồi dùng "Nhập từ Excel" để nạp lại.');
}
function importFuelExcel(rows){
  const period = appPeriod;
  let applied = 0, skipped = 0;
  rows.forEach(row=>{
    const plate = String(row['Biển số']||'').trim();
    if(!plate) return;
    const vehicle = state.vehicles.find(v=>v.plate===plate && v.fuelManagement===FUEL_MANAGED);
    if(!vehicle){ skipped++; return; }
    const saved = vehicleFuelLog(plate, period);
    const savedVals = Object.fromEntries(FUEL_FIELDS.map(k=>[k, saved ? (saved[k]??null) : null]));
    const key = fuelDraftKey(period, plate);
    const draft = fuelDraft.get(key) || {};
    FUEL_IMPORT_COLS.forEach(c=>{
      if(!c.field || row[c.header]===undefined || row[c.header]==='') return;
      const val = safeNum(row[c.header]);
      if(val === savedVals[c.field]) delete draft[c.field]; else draft[c.field] = val;
    });
    if(Object.keys(draft).length) fuelDraft.set(key, draft); else fuelDraft.delete(key);
    applied++;
  });
  toast(applied
    ? `Đã nạp ${applied} xe từ file — kiểm tra lại rồi bấm "Lưu chấm nhiên liệu kỳ này".${skipped?` (bỏ qua ${skipped} dòng không khớp biển số xe khoán dầu)`:''}`
    : 'Không tìm thấy dòng nào khớp biển số xe khoán dầu trong file.', applied?undefined:'danger');
  scheduleRender();
}
function bindFuel(){
  const period = appPeriod;
  const $ = id=>document.getElementById(id);
  const savedPrice = fuelPriceOf(period);
  bindImportButtons('fuel', exportFuelTemplate, importFuelExcel);
  $('fuel-price').oninput = e=>{
    const val = e.target.value===''?null:safeNum(e.target.value);
    if(val === savedPrice) fuelPriceDraft.delete(period); else fuelPriceDraft.set(period, val);
    scheduleRender();
  };
  document.querySelectorAll('[data-fuel-field]').forEach(input=>{
    input.oninput = ()=>{
      const plate = input.dataset.fuelPlate, field = input.dataset.fuelField;
      const val = input.value===''?null:safeNum(input.value);
      const saved = vehicleFuelLog(plate, period);
      const savedVal = saved ? (saved[field]??null) : null;
      const key = fuelDraftKey(period, plate);
      const draft = fuelDraft.get(key) || {};
      if(val === savedVal) delete draft[field]; else draft[field] = val;
      if(Object.keys(draft).length) fuelDraft.set(key, draft); else fuelDraft.delete(key);
      scheduleRender();
    };
  });
  const btn = document.getElementById('fuel-save');
  if(!btn) return;
  btn.onclick = async ()=>{
    btn.disabled = true;
    if(fuelPriceDraft.has(period)){
      const priceVal = fuelPriceDraft.get(period);
      const savedP = state.fuelPrices.find(x=>x.period===period);
      if(savedP) await updateDoc('fuelPrices', savedP.id, { period, price: priceVal });
      else await addDoc('fuelPrices', { period, price: priceVal });
      fuelPriceDraft.delete(period);
    }
    const prefix = period+'|';
    for(const key of [...fuelDraft.keys()]){
      if(!key.startsWith(prefix)) continue;
      const plate = key.slice(prefix.length);
      const draft = fuelDraft.get(key);
      const saved = vehicleFuelLog(plate, period);
      const savedVals = Object.fromEntries(FUEL_FIELDS.map(k=>[k, saved ? (saved[k]??null) : null]));
      const vals = {...savedVals, ...draft};
      const data = { plate, period, ...Object.fromEntries(FUEL_FIELDS.map(k=>[k, safeNum(vals[k])])) };
      if(saved) await updateDoc('fuelLogs', saved.id, data); else await addDoc('fuelLogs', data);
      fuelDraft.delete(key);
    }
    toast('Đã lưu chấm nhiên liệu kỳ '+periodCaption(period));
    scheduleRender();
  };
}

/* =========================================================================
   MÀN HÌNH: KHẤU TRỪ (kỳ luôn suy ra từ ngày phát sinh)
   ========================================================================= */
function renderDeductions(){
  const f = filters.deduct;
  const list = state.deductions
    .filter(d=> (f.scope!=='period' || getPeriod(d.date)===appPeriod) && (!f.driver || d.driverCode===f.driver))
    .sort(byDateDesc);
  return `
    <div class="pagehead">
      <div><h1>Khấu trừ</h1><p>Tạm ứng, phạt, bồi thường… nhập tay theo thực tế phát sinh. Kỳ lương tự suy ra từ ngày phát sinh.</p></div>
      <div class="actions">${importButtons('deduct')}<button class="btn primary" data-act="add">+ Thêm khoản khấu trừ</button></div>
    </div>
    <div class="filterbar">${scopeField('f-scope', f.scope)}${f.scope==='period'?periodTag():''}${driverFilterField('f-driver', f.driver)}</div>
    <div class="tablewrap"><table>
      <thead><tr><th>Ngày</th><th>Thuộc kỳ</th><th>Lái xe</th><th>Loại khoản</th><th>Lý do</th><th class="num">Số tiền</th><th></th></tr></thead>
      <tbody>${list.map(d=>`<tr>
        <td>${fmtDate(d.date)}</td><td class="muted">${esc(periodCaption(getPeriod(d.date)))}</td>
        <td>${esc(d.driverCode)}${driverByCode(d.driverCode)?' — '+esc(driverByCode(d.driverCode).name):' <span class="badge warn">?</span>'}</td>
        <td><span class="badge danger">${esc(d.type)}</span></td><td>${esc(d.reason||'')}</td>
        <td class="num">${fmtMoney(d.amount)}</td><td>${rowActions(d.id)}</td></tr>`).join('')
        || `<tr><td colspan="7" class="empty">Chưa có khoản khấu trừ nào${f.scope==='period'?' trong kỳ đang xem':''}.</td></tr>`}
      </tbody></table></div>`;
}
function openDeductionModal(rec){
  const d = rec || { date: todayISO(), type: DEDUCTION_TYPES[0] };
  openModal(`<h3>${rec?'Sửa khoản khấu trừ':'Thêm khoản khấu trừ'}</h3>
    <div class="modal-grid">
      ${ERROR_SLOT}
      <div class="modal-field"><label for="m-date">Ngày phát sinh *</label><input type="date" id="m-date" value="${esc(d.date||'')}"></div>
      <div class="modal-field"><label for="m-driver-text">Lái xe *</label>${comboField('m-driver', driverComboOptions('— Chọn —'), d.driverCode, 'Gõ mã hoặc tên lái xe…')}</div>
      <div class="modal-field"><label for="m-type">Loại khoản</label><select id="m-type">${selectOptions(DEDUCTION_TYPES, d.type)}</select></div>
      <div class="modal-field"><label for="m-amount">Số tiền (đ) *</label><input type="number" id="m-amount" value="${d.amount!=null?d.amount:''}"></div>
      <div class="modal-field full"><label for="m-reason">Lý do</label><input type="text" id="m-reason" value="${esc(d.reason||'')}"></div>
      <div class="full hint" id="m-period-hint"></div>
    </div>${MODAL_BUTTONS}`);
  const $ = id=>document.getElementById(id);
  bindCombo('m-driver', driverComboOptions('— Chọn —'));
  function showPeriod(){
    const p = getPeriod($('m-date').value);
    $('m-period-hint').innerHTML = p ? `Sẽ trừ vào kỳ lương <b>${esc(periodCaption(p))}</b>.` : '';
  }
  showPeriod();
  $('m-date').onchange = showPeriod;
  $('m-cancel').onclick = closeModal;
  $('m-save').onclick = async ()=>{
    const data = { date:$('m-date').value, driverCode:$('m-driver').value, type:$('m-type').value,
      amount:safeNum($('m-amount').value), reason:$('m-reason').value.trim() };
    if(!data.date || !data.driverCode || !data.amount){ modalError('Cần nhập đủ: Ngày, Lái xe và Số tiền.'); return; }
    if(rec) await updateDoc('deductions', rec.id, data); else await addDoc('deductions', data);
    closeModal();
    toast('Đã lưu khoản khấu trừ vào kỳ '+periodCaption(getPeriod(data.date)));
  };
}
/* Nhập khấu trừ hàng loạt từ Excel — mỗi dòng một khoản, kỳ lương tự suy ra
   từ ngày phát sinh nên không cần cột kỳ. */
const DEDUCT_IMPORT_HEADER = ['Ngày','Mã LX','Loại khoản','Số tiền','Lý do'];
function exportDeductTemplate(){
  downloadSheets(`MauKhauTru_${appPeriod}.xlsx`, [
    { name:'Khau tru', aoa:[DEDUCT_IMPORT_HEADER, DEDUCT_IMPORT_HEADER.map(()=>'')] },
    { name:'Danh muc', aoa:[['LOẠI KHOẢN HỢP LỆ'], ...DEDUCTION_TYPES.map(t=>[t]), [], ...referenceSheetAoa()] },
  ]);
  toast('Đã tạo file mẫu — điền xong dùng "Nhập từ Excel". Ngày dạng dd/mm/yyyy.');
}
function isBlankDeductImportRow(row){
  const rawAmount = row['Số tiền'];
  return !String(row['Ngày']||'').trim() && !String(row['Mã LX']||'').trim() && (rawAmount===''||rawAmount===undefined);
}
// Kiểm tra + chuẩn hoá 1 dòng theo đúng cột DEDUCT_IMPORT_HEADER — dùng
// CHUNG cho lần đọc file ban đầu và bảng soát lỗi sửa trực tiếp trên web
// (openDeductImportReviewModal). "row['Ngày']" phải đã là chuỗi ISO.
function validateDeductImportRow(row){
  const errors = [];    // { field, message } — field = đúng tên cột DEDUCT_IMPORT_HEADER cần sửa
  const err = (field, message)=>errors.push({field, message});
  const date = row['Ngày'] || '';
  const driverCode = String(row['Mã LX']||'').trim();
  if(!date) err('Ngày', 'Thiếu hoặc sai định dạng Ngày.' + importHint(['20/09/2026']));
  if(!driverCode) err('Mã LX', 'Thiếu Mã LX.' + importHint(state.drivers.map(d=>d.code)));
  else if(!driverByCode(driverCode)) err('Mã LX', `Mã lái xe "${driverCode}" không có trong danh sách.` + importHint(state.drivers.map(d=>d.code)));
  const amount = safeNum(row['Số tiền']);
  if(!amount) err('Số tiền', 'Số tiền phải lớn hơn 0.' + importHint(['500000']));
  if(errors.length) return { errors, data:null };
  const typeRaw = String(row['Loại khoản']||'').trim();
  const type = DEDUCTION_TYPES.find(t=>t.toLowerCase()===typeRaw.toLowerCase()) || DEDUCTION_TYPES[DEDUCTION_TYPES.length-1];
  return { errors:[], data:{ date, driverCode, type, amount, reason:String(row['Lý do']||'').trim() } };
}
async function importDeductExcel(rows){
  const meaningful = rows.filter(row=>!isBlankDeductImportRow(row));
  if(!meaningful.length){ alert('File không có dữ liệu khấu trừ.'); return; }
  const normalized = meaningful.map(row=>({ ...row, 'Ngày': parseSheetDate(row['Ngày']) }));
  const checked = normalized.map(row=>({ row, ...validateDeductImportRow(row) }));
  const errorCount = checked.filter(c=>c.errors.length).length;
  if(!errorCount){
    const total = checked.reduce((s,c)=>s+c.data.amount,0);
    if(!confirm(`Sẽ thêm ${checked.length} khoản khấu trừ, tổng ${fmtMoney(total)} đ. Tiếp tục?`)) return;
    await addManyDocs('deductions', checked.map(c=>c.data));
    toast(`Đã nhập ${checked.length} khoản khấu trừ từ Excel.`);
    return;
  }
  toast(`File có ${errorCount}/${checked.length} dòng lỗi — sửa trực tiếp ngay trong bảng bên dưới.`, 'danger');
  openDeductImportReviewModal(normalized);
}
// Bảng soát + sửa lỗi ngay trên web khi file Excel có dòng sai — cùng cơ chế
// với openTripImportReviewModal (xem ghi chú ở đó).
function openDeductImportReviewModal(normalizedRows){
  let draft = normalizedRows.map((row, i)=>({ id:i, row:{...row} }));
  function revalidateAll(){
    draft.forEach(d=>{
      const { errors, data } = validateDeductImportRow(d.row);
      d.errors = errors; d.data = data;
    });
  }
  revalidateAll();

  function rowHtml(d){
    const r = d.row, bad = d.errors.length>0;
    const f = name=>`data-import-field="${esc(name)}"`;
    const c = (field, extra)=>importCellClass(d.errors, field) + (extra?' '+extra:'');
    return `<tr class="${bad?'row-warn':''}" data-import-row="${d.id}">
      <td><input type="date" class="${c('Ngày')}" ${f('Ngày')} value="${esc(r['Ngày']||'')}"></td>
      <td><input type="text" class="${c('Mã LX')}" style="width:70px;" ${f('Mã LX')} value="${esc(r['Mã LX']||'')}"></td>
      <td><select class="${c('Loại khoản')}" ${f('Loại khoản')}>${DEDUCTION_TYPES.map(t=>`<option${String(r['Loại khoản']||'').trim().toLowerCase()===t.toLowerCase()?' selected':''}>${esc(t)}</option>`).join('')}</select></td>
      <td><input type="number" class="${c('Số tiền')}" style="width:110px;" ${f('Số tiền')} value="${r['Số tiền']!=null?r['Số tiền']:''}"></td>
      <td><input type="text" class="${c('Lý do','text')}" style="min-width:180px;" ${f('Lý do')} value="${esc(r['Lý do']||'')}"></td>
      <td style="text-align:center;">${importErrorCellHtml(d.errors)}</td>
      <td><button type="button" class="btn sm danger" data-remove-import-row="${d.id}">Bỏ</button></td>
    </tr>`;
  }
  function bodyHtml(){
    const okCount = draft.filter(d=>!d.errors.length).length;
    return `<h3>Soát &amp; sửa lỗi trước khi nhập khấu trừ</h3>
      <p class="muted" style="margin:0 0 10px;">Dòng nền vàng còn lỗi — sửa trực tiếp ngay trong bảng, sửa xong ô nào tự kiểm tra lại dòng đó, không cần tải lại file. Bấm "Bỏ" để loại dòng không muốn nhập.</p>
      <div class="tablewrap" style="max-height:55vh;overflow:auto;"><table>
        <thead><tr>${DEDUCT_IMPORT_HEADER.map(h=>`<th>${esc(h)}</th>`).join('')}<th>Kiểm tra</th><th></th></tr></thead>
        <tbody id="import-review-body">${draft.length ? draft.map(rowHtml).join('') : `<tr><td colspan="${DEDUCT_IMPORT_HEADER.length+2}" class="empty">Không còn dòng nào.</td></tr>`}</tbody>
      </table></div>
      <div class="modal-actions" style="justify-content:space-between;align-items:center;">
        <span class="muted">${okCount}/${draft.length} dòng hợp lệ, sẵn sàng nhập.</span>
        <div>
          <button class="btn" id="m-cancel">Đóng</button>
          <button class="btn primary" id="m-import-save">Nhập các dòng hợp lệ</button>
        </div>
      </div>`;
  }
  function refresh(){
    replaceModalBody(bodyHtml());
    bind();
  }
  function bind(){
    document.querySelectorAll('#import-review-body [data-import-field]').forEach(el=>{
      el.onchange = ()=>{
        const id = Number(el.closest('tr').dataset.importRow);
        const d = draft.find(x=>x.id===id);
        d.row[el.dataset.importField] = el.value;
        revalidateAll();
        refresh();
      };
    });
    document.querySelectorAll('[data-remove-import-row]').forEach(btn=>{
      btn.onclick = ()=>{ draft = draft.filter(d=>d.id!==Number(btn.dataset.removeImportRow)); refresh(); };
    });
    document.getElementById('m-cancel').onclick = closeModal;
    document.getElementById('m-import-save').onclick = async ()=>{
      const validRows = draft.filter(d=>!d.errors.length);
      if(!validRows.length){ toast('Chưa có dòng nào hợp lệ để nhập.', 'danger'); return; }
      await addManyDocs('deductions', validRows.map(d=>d.data));
      toast(`Đã nhập ${validRows.length} khoản khấu trừ.`);
      draft = draft.filter(d=>d.errors.length);
      if(!draft.length){ closeModal(); return; }
      revalidateAll();
      refresh();
    };
  }
  openModal(bodyHtml(), { wide:true });
  bind();
}

function bindDeductions(){
  document.getElementById('f-scope').onchange = e=>{ filters.deduct.scope = e.target.value; render(); };
  bindCombo('f-driver', driverComboOptions('Lái xe'));
  document.getElementById('f-driver').onchange = e=>{ filters.deduct.driver = e.target.value; render(); };
  bindImportButtons('deduct', exportDeductTemplate, importDeductExcel);
  document.querySelector('[data-act="add"]').onclick = ()=>openDeductionModal(null);
  bindRowActions(
    id => openDeductionModal(state.deductions.find(x=>x.id===id)),
    async id => { if(confirm('Xoá khoản khấu trừ này?')){ await deleteDoc('deductions', id); toast('Đã xoá khoản khấu trừ.'); } }
  );
}

/* =========================================================================
   CẤU HÌNH: LÁI XE
   ========================================================================= */
function renderDrivers(){
  const q = filters.drivers.q.trim().toLowerCase();
  const list = [...state.drivers].sort((a,b)=> String(a.code).localeCompare(String(b.code)))
    .filter(d=>!q || String(d.code).toLowerCase().includes(q) || String(d.name).toLowerCase().includes(q) || String(d.phone||'').toLowerCase().includes(q));
  return `
    <div class="pagehead">
      <div><h1>Danh sách lái xe</h1><p>Lương cứng khách hàng trả thẳng cho lái xe (vd GS, SEWS) đặt ngay ở đây.</p></div>
      <div class="actions">${importButtons('driver')}<button class="btn primary" data-act="add">+ Thêm lái xe</button></div>
    </div>
    <div class="filterbar">
      <div class="field grow"><input type="text" id="f-q" placeholder="Mã, tên hoặc SĐT lái xe…" value="${esc(filters.drivers.q)}"></div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Mã LX</th><th>Họ tên</th><th>SĐT</th><th>Loại lái xe</th><th>Xe phụ trách</th><th class="num">Lương cứng</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${list.map(d=>`<tr>
        <td><b>${esc(d.code)}</b></td><td>${esc(d.name)}</td><td>${esc(d.phone||'')}</td><td>${esc(d.driverType||'')}</td>
        <td>${d.plate?esc(d.plate)+(vehicleByPlate(d.plate)?'':' <span class="badge warn">?</span>'):'<span class="muted">—</span>'}</td>
        <td class="num">${d.hasFixedSalary?fmtMoney(d.fixedSalaryAmount):'<span class="muted">Không</span>'}</td>
        <td><span class="badge ${d.status==='Đang làm việc'?'good':(d.status===STATUS_RESIGNED?'danger':'neutral')}">${esc(d.status||'')}</span></td>
        <td>${rowActions(d.id)}</td></tr>`).join('') || `<tr><td colspan="8" class="empty">${q?'Không tìm thấy lái xe phù hợp.':'Chưa có lái xe nào.'}</td></tr>`}
      </tbody></table></div>`;
}
function openDriverModal(rec){
  const d = rec || { status:'Đang làm việc', driverType:'Chính thức', hasFixedSalary:false };
  openModal(`<h3>${rec?'Sửa lái xe':'Thêm lái xe'}</h3>
    <div class="modal-grid">
      ${ERROR_SLOT}
      <div class="modal-field"><label for="m-code">Mã lái xe *</label><input type="text" id="m-code" value="${esc(d.code||'')}"${rec?' disabled':''}>
        ${rec?'<div class="hint">Mã không đổi được vì các chuyến và khấu trừ đang tham chiếu tới mã này.</div>':''}</div>
      <div class="modal-field"><label for="m-name">Họ tên *</label><input type="text" id="m-name" value="${esc(d.name||'')}"></div>
      <div class="modal-field"><label for="m-phone">Số điện thoại</label><input type="text" id="m-phone" value="${esc(d.phone||'')}"></div>
      <div class="modal-field"><label for="m-type">Loại lái xe</label><select id="m-type">${selectOptions(DRIVER_TYPES, d.driverType)}</select></div>
      <div class="modal-field full"><label for="m-plate-text">Biển số xe phụ trách</label>${comboField('m-plate', vehicleComboOptions('— Không —'), d.plate, 'Gõ biển số…')}
        <div class="hint">Nhiều lái xe có thể cùng chọn 1 biển số nếu dùng chung xe theo ca.</div></div>
      <div class="modal-field full"><label for="m-status">Trạng thái</label><select id="m-status">${selectOptions(DRIVER_STATUS, d.status)}</select></div>
      <div class="modal-field checkrow"><input type="checkbox" id="m-hasfixed"${d.hasFixedSalary?' checked':''}><label for="m-hasfixed">Có lương cứng (khách hàng trả thẳng cho lái xe)</label></div>
      <div class="modal-field full"><label for="m-fixed">Mức lương cứng (đ/kỳ)</label><input type="number" id="m-fixed" value="${d.fixedSalaryAmount!=null?d.fixedSalaryAmount:''}">
        <div class="hint">Dùng cho khách hàng tính "Lương cứng cho lái xe" (vd GS, SEWS) — cộng vào Lương cố định mỗi kỳ, không phụ thuộc chuyến.</div></div>
      <div class="modal-field full"><label for="m-seniority">Phụ cấp thâm niên (đ/kỳ)</label><input type="number" id="m-seniority" value="${d.seniorityAllowance!=null?d.seniorityAllowance:''}">
        <div class="hint">Để trống nếu lái xe chưa đủ thâm niên. Có điền thì mỗi kỳ nhận trọn đúng mức này, không phụ thuộc ngày công — hiện thành 1 dòng riêng "Phụ cấp thâm niên" trong Bảng lương.</div></div>
    </div>${MODAL_BUTTONS}`);
  const $ = id=>document.getElementById(id);
  bindCombo('m-plate', vehicleComboOptions('— Không —'));
  $('m-cancel').onclick = closeModal;
  $('m-save').onclick = async ()=>{
    const name = $('m-name').value.trim();
    const code = rec ? rec.code : $('m-code').value.trim();
    if(!code || !name){ modalError('Cần nhập Mã lái xe và Họ tên.'); return; }
    if(!rec && state.drivers.some(x=>x.code===code)){ modalError('Mã lái xe này đã tồn tại.'); return; }
    const hasFixed = $('m-hasfixed').checked;
    const fixed = safeNum($('m-fixed').value);
    if(hasFixed && !fixed){ modalError('Đã bật lương cứng thì cần nhập mức lương lớn hơn 0.'); return; }
    const seniority = $('m-seniority').value===''? null : safeNum($('m-seniority').value);
    const data = { code, name, phone:$('m-phone').value.trim(), driverType:$('m-type').value, status:$('m-status').value,
      hasFixedSalary:hasFixed, fixedSalaryAmount:fixed, seniorityAllowance:seniority, plate:$('m-plate').value || null };
    if(rec) await updateDoc('drivers', rec.id, data); else await addDoc('drivers', data);
    closeModal();
    toast('Đã lưu thông tin lái xe.');
  };
}
/* Nhập lái xe hàng loạt từ Excel — khớp theo Mã LX: mã đã có thì CẬP NHẬT
   (giữ nguyên các trường không điền trong file), mã chưa có thì THÊM mới. */
const DRIVER_IMPORT_HEADER = ['Mã LX','Họ tên','SĐT','Loại lái xe','Biển số xe phụ trách','Trạng thái','Lương cứng (Có/Không)','Mức lương cứng'];
function exportDriverTemplate(){
  downloadSheets('MauLaiXe.xlsx', [
    { name:'Lai xe', aoa:[DRIVER_IMPORT_HEADER, DRIVER_IMPORT_HEADER.map(()=>'')] },
    { name:'Danh muc', aoa:[['LOẠI LÁI XE HỢP LỆ'], ...DRIVER_TYPES.map(t=>[t]), [],
      ['TRẠNG THÁI HỢP LỆ'], ...DRIVER_STATUS.map(t=>[t]), [], ...referenceSheetAoa()] },
  ]);
  toast('Đã tạo file mẫu — điền xong dùng "Nhập từ Excel". Mã LX đã có sẽ được cập nhật, mã mới sẽ được thêm.');
}
function isBlankDriverImportRow(row){
  return !String(row['Mã LX']||'').trim() && !String(row['Họ tên']||'').trim();
}
function validateDriverImportRow(row){
  const errors = [];
  const err = (field, message)=>errors.push({field, message});
  const code = String(row['Mã LX']||'').trim();
  const name = String(row['Họ tên']||'').trim();
  if(!code) err('Mã LX', 'Thiếu Mã LX.');
  if(!name) err('Họ tên', 'Thiếu Họ tên.' + importHint(state.drivers.map(d=>d.name)));
  const typeRaw = String(row['Loại lái xe']||'').trim();
  const driverType = typeRaw ? DRIVER_TYPES.find(t=>t.toLowerCase()===typeRaw.toLowerCase()) : DRIVER_TYPES[0];
  if(typeRaw && !driverType) err('Loại lái xe', `"${typeRaw}" không hợp lệ.` + importHint(DRIVER_TYPES));
  const plate = String(row['Biển số xe phụ trách']||'').trim();
  if(plate && !vehicleByPlate(plate)) err('Biển số xe phụ trách', `Biển số "${plate}" không có trong danh sách xe.` + importHint(state.vehicles.map(v=>v.plate)));
  const statusRaw = String(row['Trạng thái']||'').trim();
  const status = statusRaw ? DRIVER_STATUS.find(s=>s.toLowerCase()===statusRaw.toLowerCase()) : DRIVER_STATUS[0];
  if(statusRaw && !status) err('Trạng thái', `"${statusRaw}" không hợp lệ.` + importHint(DRIVER_STATUS));
  const hasFixedSalary = sheetYes(row['Lương cứng (Có/Không)']);
  const fixedSalaryAmount = hasFixedSalary ? safeNum(row['Mức lương cứng']) : null;
  if(hasFixedSalary && !fixedSalaryAmount) err('Mức lương cứng', 'Đã chọn "Có" lương cứng thì cần nhập mức lương lớn hơn 0.' + importHint(['9000000']));
  if(errors.length) return { errors, data:null };
  return { errors:[], data:{ code, name, phone:String(row['SĐT']||'').trim(), driverType, plate: plate || null, status, hasFixedSalary, fixedSalaryAmount } };
}
async function importDriverExcel(rows){
  const meaningful = rows.filter(row=>!isBlankDriverImportRow(row));
  if(!meaningful.length){ alert('File không có dữ liệu lái xe.'); return; }
  const checked = meaningful.map(row=>({ row, ...validateDriverImportRow(row) }));
  const errorCount = checked.filter(c=>c.errors.length).length;
  if(!errorCount){
    const added = checked.filter(c=>!driverByCode(c.data.code)).length;
    if(!confirm(`Sẽ thêm ${added} lái xe mới, cập nhật ${checked.length-added} lái xe đã có. Tiếp tục?`)) return;
    await addManyDocs('drivers', checked.map(c=>c.data), { onConflict:'code' });
    toast(`Đã nhập ${checked.length} lái xe từ Excel.`);
    return;
  }
  toast(`File có ${errorCount}/${checked.length} dòng lỗi — sửa trực tiếp ngay trong bảng bên dưới.`, 'danger');
  openDriverImportReviewModal(meaningful);
}
function openDriverImportReviewModal(rawRows){
  let draft = rawRows.map((row, i)=>({ id:i, row:{...row} }));
  function revalidateAll(){
    draft.forEach(d=>{ const { errors, data } = validateDriverImportRow(d.row); d.errors = errors; d.data = data; });
  }
  revalidateAll();
  function rowHtml(d){
    const r = d.row, bad = d.errors.length>0;
    const f = name=>`data-import-field="${esc(name)}"`;
    const c = (field, extra)=>importCellClass(d.errors, field) + (extra?' '+extra:'');
    return `<tr class="${bad?'row-warn':''}" data-import-row="${d.id}">
      <td><input type="text" class="${c('Mã LX','text')}" style="width:80px;" ${f('Mã LX')} value="${esc(r['Mã LX']||'')}"></td>
      <td><input type="text" class="${c('Họ tên','text')}" style="min-width:160px;" ${f('Họ tên')} value="${esc(r['Họ tên']||'')}"></td>
      <td><input type="text" class="${c('SĐT','text')}" style="width:120px;" ${f('SĐT')} value="${esc(r['SĐT']||'')}"></td>
      <td><select class="${c('Loại lái xe')}" ${f('Loại lái xe')}><option value=""${!r['Loại lái xe']?' selected':''}>— Mặc định —</option>${DRIVER_TYPES.map(t=>`<option${String(r['Loại lái xe']||'').trim().toLowerCase()===t.toLowerCase()?' selected':''}>${esc(t)}</option>`).join('')}</select></td>
      <td><input type="text" class="${c('Biển số xe phụ trách','text')}" style="width:90px;" ${f('Biển số xe phụ trách')} value="${esc(r['Biển số xe phụ trách']||'')}"></td>
      <td><select class="${c('Trạng thái')}" ${f('Trạng thái')}><option value=""${!r['Trạng thái']?' selected':''}>— Mặc định —</option>${DRIVER_STATUS.map(t=>`<option${String(r['Trạng thái']||'').trim().toLowerCase()===t.toLowerCase()?' selected':''}>${esc(t)}</option>`).join('')}</select></td>
      <td><select class="${c('Lương cứng (Có/Không)')}" ${f('Lương cứng (Có/Không)')}><option${!sheetYes(r['Lương cứng (Có/Không)'])?' selected':''}>Không</option><option${sheetYes(r['Lương cứng (Có/Không)'])?' selected':''}>Có</option></select></td>
      <td class="num"><input type="number" class="${c('Mức lương cứng')}" style="width:120px;" ${f('Mức lương cứng')} value="${r['Mức lương cứng']!=null?r['Mức lương cứng']:''}"></td>
      <td style="text-align:center;">${importErrorCellHtml(d.errors)}</td>
      <td><button type="button" class="btn sm danger" data-remove-import-row="${d.id}">Bỏ</button></td>
    </tr>`;
  }
  function bodyHtml(){
    const okCount = draft.filter(d=>!d.errors.length).length;
    return `<h3>Soát &amp; sửa lỗi trước khi nhập lái xe</h3>
      <p class="muted" style="margin:0 0 10px;">Dòng nền vàng còn lỗi — sửa trực tiếp ngay trong bảng. Mã LX đã có sẽ được cập nhật, mã mới sẽ được thêm.</p>
      <div class="tablewrap" style="max-height:55vh;overflow:auto;"><table>
        <thead><tr>${DRIVER_IMPORT_HEADER.map(h=>`<th>${esc(h)}</th>`).join('')}<th>Kiểm tra</th><th></th></tr></thead>
        <tbody id="import-review-body">${draft.length ? draft.map(rowHtml).join('') : `<tr><td colspan="${DRIVER_IMPORT_HEADER.length+2}" class="empty">Không còn dòng nào.</td></tr>`}</tbody>
      </table></div>
      <div class="modal-actions" style="justify-content:space-between;align-items:center;">
        <span class="muted">${okCount}/${draft.length} dòng hợp lệ, sẵn sàng nhập.</span>
        <div><button class="btn" id="m-cancel">Đóng</button><button class="btn primary" id="m-import-save">Nhập các dòng hợp lệ</button></div>
      </div>`;
  }
  function refresh(){ replaceModalBody(bodyHtml()); bind(); }
  function bind(){
    document.querySelectorAll('#import-review-body [data-import-field]').forEach(el=>{
      el.onchange = ()=>{
        const id = Number(el.closest('tr').dataset.importRow);
        const d = draft.find(x=>x.id===id);
        d.row[el.dataset.importField] = el.value;
        revalidateAll();
        refresh();
      };
    });
    document.querySelectorAll('[data-remove-import-row]').forEach(btn=>{
      btn.onclick = ()=>{ draft = draft.filter(d=>d.id!==Number(btn.dataset.removeImportRow)); refresh(); };
    });
    document.getElementById('m-cancel').onclick = closeModal;
    document.getElementById('m-import-save').onclick = async ()=>{
      const validRows = draft.filter(d=>!d.errors.length);
      if(!validRows.length){ toast('Chưa có dòng nào hợp lệ để nhập.', 'danger'); return; }
      await addManyDocs('drivers', validRows.map(d=>d.data), { onConflict:'code' });
      toast(`Đã nhập ${validRows.length} lái xe.`);
      draft = draft.filter(d=>d.errors.length);
      if(!draft.length){ closeModal(); return; }
      revalidateAll();
      refresh();
    };
  }
  openModal(bodyHtml(), { wide:true });
  bind();
}

function bindDrivers(){
  bindImportButtons('driver', exportDriverTemplate, importDriverExcel);
  document.getElementById('f-q').oninput = e=>{ filters.drivers.q = e.target.value; render(); };
  document.querySelector('[data-act="add"]').onclick = ()=>openDriverModal(null);
  bindRowActions(
    id => openDriverModal(state.drivers.find(x=>x.id===id)),
    async id => {
      const d = state.drivers.find(x=>x.id===id);
      const used = state.trips.filter(t=>t.driverCode===d.code).length;
      const msg = used
        ? `Lái xe ${d.code} đang gắn với ${used} chuyến. Xoá sẽ khiến các chuyến đó thiếu thông tin lái xe.\nNên chuyển trạng thái sang "Đã nghỉ việc" thay vì xoá. Vẫn xoá?`
        : `Xoá lái xe ${d.code} — ${d.name}?`;
      if(confirm(msg)){ await deleteDoc('drivers', id); toast('Đã xoá lái xe.'); }
    }
  );
}

/* =========================================================================
   CẤU HÌNH: XE
   ========================================================================= */
function renderVehicles(){
  const q = filters.vehicles.q.trim().toLowerCase();
  const list = [...state.vehicles].sort((a,b)=> String(a.plate).localeCompare(String(b.plate)))
    .filter(v=>{
      if(!q) return true;
      const drivers = driversOfVehicle(v.plate);
      return String(v.plate).toLowerCase().includes(q) || String(v.homeProject||'').toLowerCase().includes(q)
        || drivers.some(d=>String(d.code).toLowerCase().includes(q) || String(d.name||'').toLowerCase().includes(q));
    });
  return `
    <div class="pagehead">
      <div><h1>Danh sách xe</h1><p>Khách hàng gốc dùng để tự nhận diện chuyến tăng cường. Quản lý nhiên liệu bật/tắt riêng cho từng xe.</p></div>
      <div class="actions">${importButtons('vehicle')}<button class="btn primary" data-act="add">+ Thêm xe</button></div>
    </div>
    <div class="filterbar">
      <div class="field grow"><input type="text" id="f-q" placeholder="Biển số, khách hàng gốc hoặc lái xe phụ trách…" value="${esc(filters.vehicles.q)}"></div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Biển số</th><th class="num">Tải trọng</th><th>Loại xe</th><th>Sở hữu</th><th>Lái xe phụ trách</th>
        <th>Khách hàng gốc</th><th>Nhiên liệu</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${list.map(v=>`<tr>
        <td><b>${esc(v.plate)}</b></td><td class="num">${v.capacity?esc(v.capacity)+' tấn':''}</td>
        <td>${esc(v.vehicleType||'')}</td><td>${esc(v.ownership||'')}</td>
        <td>${vehicleDriversLabel(v.plate)}</td>
        <td>${esc(v.homeProject||'')||'<span class="muted">—</span>'}</td>
        <td>${v.fuelManagement===FUEL_MANAGED?`Khoán ${v.fuelNorm?esc(v.fuelNorm)+' L/100km':''}`:'<span class="muted">Không khoán</span>'}</td>
        <td><span class="badge ${v.status==='Đang hoạt động'?'good':(v.status==='Ngừng chạy'?'danger':'neutral')}">${esc(v.status||'')}</span></td>
        <td>${rowActions(v.id)}</td></tr>`).join('') || `<tr><td colspan="9" class="empty">${q?'Không tìm thấy xe phù hợp.':'Chưa có xe nào.'}</td></tr>`}
      </tbody></table></div>`;
}
function openVehicleModal(rec){
  const v = rec || { ownership:OWNERSHIP_OPTS[0], status:'Đang hoạt động', fuelManagement:FUEL_UNMANAGED };
  openModal(`<h3>${rec?'Sửa xe':'Thêm xe'}</h3>
    <div class="modal-grid">
      ${ERROR_SLOT}
      <div class="modal-field"><label for="m-plate">Biển số *</label><input type="text" id="m-plate" value="${esc(v.plate||'')}">
        ${rec?'<div class="hint">Đổi biển số sẽ tự cập nhật lại các chuyến/chấm nhiên liệu/lái xe phụ trách đang dùng biển số cũ.</div>':''}</div>
      <div class="modal-field"><label for="m-cap">Tải trọng (tấn)</label><input type="number" id="m-cap" value="${v.capacity!=null?v.capacity:''}"></div>
      <div class="modal-field"><label for="m-vtype">Loại xe</label><input type="text" id="m-vtype" list="vtype-list" value="${esc(v.vehicleType||'')}">
        <datalist id="vtype-list">${VEHICLE_TYPES_HINT.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist></div>
      <div class="modal-field"><label for="m-own">Hình thức sở hữu</label><select id="m-own">${selectOptions(OWNERSHIP_OPTS, v.ownership)}</select></div>
      ${rec?`<div class="modal-field full"><label>Lái xe phụ trách</label><div class="hint" style="margin-top:6px;">${vehicleDriversLabel(v.plate)} — gán/đổi ở hồ sơ từng Lái xe, không sửa được ở đây.</div></div>`:''}
      <div class="modal-field"><label for="m-project-text">Khách hàng gốc</label>${comboField('m-project',
        customerComboOptions('— Không —', state.customers.map(c=>c.code)), v.homeProject, 'Gõ mã hoặc tên khách hàng…')}</div>
      <div class="modal-field"><label for="m-status">Trạng thái</label><select id="m-status">${selectOptions(VEHICLE_STATUS, v.status)}</select></div>
      <div class="modal-field"><label for="m-fuelmgmt">Quản lý nhiên liệu</label><select id="m-fuelmgmt">${
        FUEL_MANAGEMENT_OPTS.map(o=>`<option value="${o.v}"${o.v===v.fuelManagement?' selected':''}>${esc(o.l)}</option>`).join('')}</select></div>
      <div class="modal-field" id="m-fuelnorm-wrap"><label for="m-fuelnorm">Định mức tiêu hao (lít/100km)</label><input type="number" id="m-fuelnorm" value="${v.fuelNorm!=null?v.fuelNorm:''}"></div>
      <div class="full hint">Xe khoán dầu mỗi kỳ vào mục Nhiên liệu chấm km + tồn/đổ dầu để tự tính thưởng/phạt tiết kiệm.</div>
    </div>${MODAL_BUTTONS}`);
  const $ = id=>document.getElementById(id);
  bindCombo('m-project', customerComboOptions('— Không —', state.customers.map(c=>c.code)));
  function syncFuelNormVisibility(){ $('m-fuelnorm-wrap').hidden = $('m-fuelmgmt').value !== FUEL_MANAGED; }
  syncFuelNormVisibility();
  $('m-fuelmgmt').onchange = syncFuelNormVisibility;
  $('m-cancel').onclick = closeModal;
  $('m-save').onclick = async ()=>{
    const plate = $('m-plate').value.trim();
    if(!plate){ modalError('Cần nhập Biển số.'); return; }
    if(state.vehicles.some(x=>x.plate===plate && (!rec || x.id!==rec.id))){ modalError('Biển số này đã tồn tại.'); return; }
    const fuelManagement = $('m-fuelmgmt').value;
    const fuelNorm = safeNum($('m-fuelnorm').value);
    if(fuelManagement===FUEL_MANAGED && !fuelNorm){ modalError('Xe khoán dầu cần nhập định mức tiêu hao lớn hơn 0.'); return; }
    const data = { plate, capacity: $('m-cap').value===''?null:safeNum($('m-cap').value),
      vehicleType:$('m-vtype').value.trim(), ownership:$('m-own').value,
      homeProject:$('m-project').value.trim(),
      status:$('m-status').value,
      fuelManagement, fuelNorm: fuelManagement===FUEL_MANAGED ? fuelNorm : null };
    // Đổi biển số đang có chuyến/chấm nhiên liệu/lái xe phụ trách dùng: cập
    // nhật luôn các bản ghi đó, nếu không chúng sẽ mất liên kết tới xe (tra
    // theo biển số).
    if(rec && plate !== rec.plate){
      const trips = state.trips.filter(t=>t.plate===rec.plate);
      const fuelLogs = state.fuelLogs.filter(f=>f.plate===rec.plate);
      const drivers = driversOfVehicle(rec.plate);
      if(trips.length || fuelLogs.length || drivers.length){
        const parts = [];
        if(drivers.length) parts.push(`${drivers.length} lái xe phụ trách`);
        if(trips.length) parts.push(`${trips.length} chuyến`);
        if(fuelLogs.length) parts.push(`${fuelLogs.length} kỳ chấm nhiên liệu`);
        if(!confirm(`Đổi biển số "${rec.plate}" thành "${plate}" — ${parts.join(', ')} đang dùng biển số cũ sẽ được cập nhật theo biển số mới. Tiếp tục?`)) return;
      }
      for(const t of trips) await updateDoc('trips', t.id, { plate });
      for(const f of fuelLogs) await updateDoc('fuelLogs', f.id, { plate });
      for(const d of drivers) await updateDoc('drivers', d.id, { plate });
    }
    if(rec) await updateDoc('vehicles', rec.id, data); else await addDoc('vehicles', data);
    closeModal();
    toast('Đã lưu thông tin xe.');
  };
}
/* Nhập xe hàng loạt từ Excel — khớp theo Biển số: biển đã có thì CẬP NHẬT
   các trường khác (không đổi được biển số qua import, vì biển số là khoá
   để khớp dòng — muốn đổi biển số dùng nút Sửa trên từng xe), biển chưa có
   thì THÊM mới. */
const VEHICLE_IMPORT_HEADER = ['Biển số','Tải trọng (tấn)','Loại xe','Sở hữu','Khách hàng gốc','Trạng thái','Khoán dầu (Có/Không)','Định mức tiêu hao (lít/100km)'];
function exportVehicleTemplate(){
  downloadSheets('MauXe.xlsx', [
    { name:'Xe', aoa:[VEHICLE_IMPORT_HEADER, VEHICLE_IMPORT_HEADER.map(()=>'')] },
    { name:'Danh muc', aoa:[['SỞ HỮU HỢP LỆ'], ...OWNERSHIP_OPTS.map(t=>[t]), [],
      ['TRẠNG THÁI HỢP LỆ'], ...VEHICLE_STATUS.map(t=>[t]), [], ...referenceSheetAoa()] },
  ]);
  toast('Đã tạo file mẫu — điền xong dùng "Nhập từ Excel". Biển số đã có sẽ được cập nhật, biển mới sẽ được thêm.');
}
function isBlankVehicleImportRow(row){ return !String(row['Biển số']||'').trim(); }
function validateVehicleImportRow(row){
  const errors = [];
  const err = (field, message)=>errors.push({field, message});
  const plate = String(row['Biển số']||'').trim();
  if(!plate) err('Biển số', 'Thiếu Biển số.');
  const ownRaw = String(row['Sở hữu']||'').trim();
  const ownership = ownRaw ? OWNERSHIP_OPTS.find(o=>o.toLowerCase()===ownRaw.toLowerCase()) : OWNERSHIP_OPTS[0];
  if(ownRaw && !ownership) err('Sở hữu', `"${ownRaw}" không hợp lệ.` + importHint(OWNERSHIP_OPTS));
  const statusRaw = String(row['Trạng thái']||'').trim();
  const status = statusRaw ? VEHICLE_STATUS.find(s=>s.toLowerCase()===statusRaw.toLowerCase()) : VEHICLE_STATUS[0];
  if(statusRaw && !status) err('Trạng thái', `"${statusRaw}" không hợp lệ.` + importHint(VEHICLE_STATUS));
  const homeProject = String(row['Khách hàng gốc']||'').trim();
  if(homeProject && !customerByCode(homeProject)) err('Khách hàng gốc', `Mã khách hàng "${homeProject}" không có trong mục Khách hàng.` + importHint(state.customers.map(c=>c.code)));
  const fuelManagement = sheetYes(row['Khoán dầu (Có/Không)']) ? FUEL_MANAGED : FUEL_UNMANAGED;
  const fuelNorm = fuelManagement===FUEL_MANAGED ? safeNum(row['Định mức tiêu hao (lít/100km)']) : null;
  if(fuelManagement===FUEL_MANAGED && !fuelNorm) err('Định mức tiêu hao (lít/100km)', 'Đã chọn "Khoán dầu" thì cần nhập định mức tiêu hao lớn hơn 0.' + importHint(['22']));
  const rawCap = row['Tải trọng (tấn)'];
  const capacity = (rawCap===''||rawCap===undefined) ? null : safeNum(rawCap);
  if(errors.length) return { errors, data:null };
  return { errors:[], data:{ plate, capacity, vehicleType:String(row['Loại xe']||'').trim(), ownership,
    homeProject, status, fuelManagement, fuelNorm } };
}
async function importVehicleExcel(rows){
  const meaningful = rows.filter(row=>!isBlankVehicleImportRow(row));
  if(!meaningful.length){ alert('File không có dữ liệu xe.'); return; }
  const checked = meaningful.map(row=>({ row, ...validateVehicleImportRow(row) }));
  const errorCount = checked.filter(c=>c.errors.length).length;
  if(!errorCount){
    const added = checked.filter(c=>!vehicleByPlate(c.data.plate)).length;
    if(!confirm(`Sẽ thêm ${added} xe mới, cập nhật ${checked.length-added} xe đã có. Tiếp tục?`)) return;
    await addManyDocs('vehicles', checked.map(c=>c.data), { onConflict:'plate' });
    toast(`Đã nhập ${checked.length} xe từ Excel.`);
    return;
  }
  toast(`File có ${errorCount}/${checked.length} dòng lỗi — sửa trực tiếp ngay trong bảng bên dưới.`, 'danger');
  openVehicleImportReviewModal(meaningful);
}
function openVehicleImportReviewModal(rawRows){
  let draft = rawRows.map((row, i)=>({ id:i, row:{...row} }));
  function revalidateAll(){
    draft.forEach(d=>{ const { errors, data } = validateVehicleImportRow(d.row); d.errors = errors; d.data = data; });
  }
  revalidateAll();
  function rowHtml(d){
    const r = d.row, bad = d.errors.length>0;
    const f = name=>`data-import-field="${esc(name)}"`;
    const c = (field, extra)=>importCellClass(d.errors, field) + (extra?' '+extra:'');
    return `<tr class="${bad?'row-warn':''}" data-import-row="${d.id}">
      <td><input type="text" class="${c('Biển số','text')}" style="width:100px;" ${f('Biển số')} value="${esc(r['Biển số']||'')}"></td>
      <td class="num"><input type="number" class="${c('Tải trọng (tấn)')}" style="width:90px;" ${f('Tải trọng (tấn)')} value="${r['Tải trọng (tấn)']!=null?r['Tải trọng (tấn)']:''}"></td>
      <td><input type="text" class="${c('Loại xe','text')}" style="min-width:120px;" ${f('Loại xe')} value="${esc(r['Loại xe']||'')}"></td>
      <td><select class="${c('Sở hữu')}" ${f('Sở hữu')}><option value=""${!r['Sở hữu']?' selected':''}>— Mặc định —</option>${OWNERSHIP_OPTS.map(t=>`<option${String(r['Sở hữu']||'').trim().toLowerCase()===t.toLowerCase()?' selected':''}>${esc(t)}</option>`).join('')}</select></td>
      <td><input type="text" class="${c('Khách hàng gốc','text')}" style="width:90px;" ${f('Khách hàng gốc')} value="${esc(r['Khách hàng gốc']||'')}"></td>
      <td><select class="${c('Trạng thái')}" ${f('Trạng thái')}><option value=""${!r['Trạng thái']?' selected':''}>— Mặc định —</option>${VEHICLE_STATUS.map(t=>`<option${String(r['Trạng thái']||'').trim().toLowerCase()===t.toLowerCase()?' selected':''}>${esc(t)}</option>`).join('')}</select></td>
      <td><select class="${c('Khoán dầu (Có/Không)')}" ${f('Khoán dầu (Có/Không)')}><option${!sheetYes(r['Khoán dầu (Có/Không)'])?' selected':''}>Không</option><option${sheetYes(r['Khoán dầu (Có/Không)'])?' selected':''}>Có</option></select></td>
      <td class="num"><input type="number" class="${c('Định mức tiêu hao (lít/100km)')}" style="width:90px;" ${f('Định mức tiêu hao (lít/100km)')} value="${r['Định mức tiêu hao (lít/100km)']!=null?r['Định mức tiêu hao (lít/100km)']:''}"></td>
      <td style="text-align:center;">${importErrorCellHtml(d.errors)}</td>
      <td><button type="button" class="btn sm danger" data-remove-import-row="${d.id}">Bỏ</button></td>
    </tr>`;
  }
  function bodyHtml(){
    const okCount = draft.filter(d=>!d.errors.length).length;
    return `<h3>Soát &amp; sửa lỗi trước khi nhập xe</h3>
      <p class="muted" style="margin:0 0 10px;">Dòng nền vàng còn lỗi — sửa trực tiếp ngay trong bảng. Biển số đã có sẽ được cập nhật, biển mới sẽ được thêm.</p>
      <div class="tablewrap" style="max-height:55vh;overflow:auto;"><table>
        <thead><tr>${VEHICLE_IMPORT_HEADER.map(h=>`<th>${esc(h)}</th>`).join('')}<th>Kiểm tra</th><th></th></tr></thead>
        <tbody id="import-review-body">${draft.length ? draft.map(rowHtml).join('') : `<tr><td colspan="${VEHICLE_IMPORT_HEADER.length+2}" class="empty">Không còn dòng nào.</td></tr>`}</tbody>
      </table></div>
      <div class="modal-actions" style="justify-content:space-between;align-items:center;">
        <span class="muted">${okCount}/${draft.length} dòng hợp lệ, sẵn sàng nhập.</span>
        <div><button class="btn" id="m-cancel">Đóng</button><button class="btn primary" id="m-import-save">Nhập các dòng hợp lệ</button></div>
      </div>`;
  }
  function refresh(){ replaceModalBody(bodyHtml()); bind(); }
  function bind(){
    document.querySelectorAll('#import-review-body [data-import-field]').forEach(el=>{
      el.onchange = ()=>{
        const id = Number(el.closest('tr').dataset.importRow);
        const d = draft.find(x=>x.id===id);
        d.row[el.dataset.importField] = el.value;
        revalidateAll();
        refresh();
      };
    });
    document.querySelectorAll('[data-remove-import-row]').forEach(btn=>{
      btn.onclick = ()=>{ draft = draft.filter(d=>d.id!==Number(btn.dataset.removeImportRow)); refresh(); };
    });
    document.getElementById('m-cancel').onclick = closeModal;
    document.getElementById('m-import-save').onclick = async ()=>{
      const validRows = draft.filter(d=>!d.errors.length);
      if(!validRows.length){ toast('Chưa có dòng nào hợp lệ để nhập.', 'danger'); return; }
      await addManyDocs('vehicles', validRows.map(d=>d.data), { onConflict:'plate' });
      toast(`Đã nhập ${validRows.length} xe.`);
      draft = draft.filter(d=>d.errors.length);
      if(!draft.length){ closeModal(); return; }
      revalidateAll();
      refresh();
    };
  }
  openModal(bodyHtml(), { wide:true });
  bind();
}

function bindVehicles(){
  bindImportButtons('vehicle', exportVehicleTemplate, importVehicleExcel);
  document.getElementById('f-q').oninput = e=>{ filters.vehicles.q = e.target.value; render(); };
  document.querySelector('[data-act="add"]').onclick = ()=>openVehicleModal(null);
  bindRowActions(
    id => openVehicleModal(state.vehicles.find(x=>x.id===id)),
    async id => {
      const v = state.vehicles.find(x=>x.id===id);
      const used = state.trips.filter(t=>t.plate===v.plate).length;
      const msg = used
        ? `Xe ${v.plate} đang gắn với ${used} chuyến. Vẫn xoá?`
        : `Xoá xe ${v.plate}?`;
      if(confirm(msg)){ await deleteDoc('vehicles', id); toast('Đã xoá xe.'); }
    }
  );
}

/* =========================================================================
   CẤU HÌNH: KHÁCH HÀNG (mỗi khách hàng một cách tính lương chuyến)
   ========================================================================= */
function customerRateSummary(c){
  if(c.calcMethod==='km'){
    const regions = c.kmRegions||[];
    const n = regions.reduce((s,r)=>s+(r.brackets||[]).length, 0);
    const label = !regions.length ? 'Chưa cấu hình bậc thang km'
      : regions.length===1 ? `${n} khoảng km — bấm Sửa để xem`
      : `${regions.length} khu vực, ${n} khoảng km — bấm Sửa để xem`;
    const cap = c.surgeOuterKmCap!=null?c.surgeOuterKmCap:200;
    const surgeBits = [
      `Nội thành ${c.surgeInnerAmount!=null?fmtMoney(c.surgeInnerAmount)+'đ':'—'}`,
      `Ngoại tỉnh ${c.surgeOuterFlatAmount!=null?fmtMoney(c.surgeOuterFlatAmount)+'đ':'—'} (≤${cap}km)`,
      `vượt ${cap}km: theo bậc thang km${customerHasLongHaulConfig(c)?' + phụ cấp đường dài':''}`,
    ];
    return `<span class="muted">${label}</span><br><span class="muted">Tăng cường: ${surgeBits.join(', ')}</span>`;
  }
  if(c.calcMethod==='tripPlusExtras') return `Bốc xếp ${fmtMoney(c.loadingPrice)} đ/lượt`;
  if(c.calcMethod==='route') return '<span class="muted">Xem ở Bảng giá theo tuyến</span>';
  return '<span class="muted">Xem lương cứng ở hồ sơ lái xe</span>';
}
function renderCustomers(){
  const q = filters.customers.q.trim().toLowerCase();
  const list = [...state.customers].sort((a,b)=> String(a.code).localeCompare(String(b.code)))
    .filter(c=>!q || String(c.code).toLowerCase().includes(q) || String(c.name).toLowerCase().includes(q));
  return `
    <div class="pagehead">
      <div><h1>Khách hàng</h1><p>Mỗi khách hàng có một cách tính lương chuyến riêng. Chọn cách tính rồi nhập đơn giá tương ứng.</p></div>
      <div class="actions"><button class="btn primary" data-act="add">+ Thêm khách hàng</button></div>
    </div>
    <div class="filterbar">
      <div class="field grow"><input type="text" id="f-q" placeholder="Mã hoặc tên khách hàng…" value="${esc(filters.customers.q)}"></div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Mã</th><th>Tên khách hàng</th><th>Cách tính lương</th><th class="num">Đơn giá</th><th></th></tr></thead>
      <tbody>${list.map(c=>`<tr>
        <td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td>
        <td>${esc(calcMethodLabel(c.calcMethod))}</td>
        <td class="num">${customerRateSummary(c)}</td>
        <td>${rowActions(c.id)}</td></tr>`).join('') || `<tr><td colspan="5" class="empty">${q?'Không tìm thấy khách hàng phù hợp.':'Chưa có khách hàng nào.'}</td></tr>`}
      </tbody></table></div>`;
}
function openCustomerModal(rec){
  const c = rec || { calcMethod:'route' };
  // Bậc thang km × tải trọng xe — bản nháp riêng của modal này, chỉ áp dụng
  // khi phương thức đang chọn là "km"; sống suốt vòng đời modal (đổi qua lại
  // giữa các phương thức không mất dữ liệu đã gõ).
  const kmDraftLocal = cloneKmConfig(c);
  openModal(`<h3>${rec?'Sửa khách hàng':'Thêm khách hàng'}</h3>
    <div class="modal-grid">
      ${ERROR_SLOT}
      <div class="modal-field"><label for="m-code">Mã khách hàng *</label><input type="text" id="m-code" value="${esc(c.code||'')}"${rec?' disabled':''}>
        ${rec?'<div class="hint">Mã không đổi được vì xe, chuyến, tuyến… đang tham chiếu tới mã này.</div>':''}</div>
      <div class="modal-field"><label for="m-name">Tên khách hàng *</label><input type="text" id="m-name" value="${esc(c.name||'')}"></div>
      <div class="modal-field full"><label for="m-method">Cách tính lương chuyến</label><select id="m-method">${
        CUSTOMER_CALC_METHODS.map(m=>`<option value="${m.v}"${m.v===c.calcMethod?' selected':''}>${esc(m.l)}</option>`).join('')}</select></div>
      <div id="m-method-fields" class="full modal-grid" style="padding:0;"></div>
    </div>${MODAL_BUTTONS}`, { wide: c.calcMethod==='km' });
  const $ = id=>document.getElementById(id);

  function kmRegionBlockHtml(region, ri){
    const tiers = region.tiers;
    // Không tự sắp theo kmMax nữa — giữ đúng thứ tự đã lưu để người dùng
    // kéo đổi vị trí dòng/cột (giữ chuột ~1s trên ô "Khoảng km"/mốc tải
    // trọng) không bị vẽ lại về thứ tự cũ.
    const brackets = region.brackets.map((b,i)=>({ ...b, _idx:i }));
    return `
      <div class="panel" style="margin:10px 0 0;padding:12px 14px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <b>${esc(zoneLabel(region.zone))}</b>
        </div>
        <div class="tablewrap" style="margin-top:10px;"><table class="km-fit-table">
          <thead><tr><th>Khoảng km (đến)</th>
            ${tiers.map((t,i)=>`<th><div class="km-tier-head">
              <input type="number" step="0.1" min="0" class="qty-input" data-km-region-idx="${ri}" data-km-tier="${i}" value="${t!=null?t:''}">
              <span class="km-tier-foot"><span class="muted">tấn</span><button type="button" class="btn sm danger" data-km-region-idx="${ri}" data-km-deltier="${i}" title="Xoá mốc này">×</button></span>
            </div></th>`).join('')}
            <th></th></tr></thead>
          <tbody>${brackets.length ? brackets.map(b=>`<tr>
              <td><input type="number" min="0" class="qty-input" data-km-region-idx="${ri}" data-km-bracket="${b._idx}" value="${b.kmMax!=null?b.kmMax:''}" placeholder="Để trống = không giới hạn"> km</td>
              ${tiers.map((_,ti)=>`<td class="num"><input type="text" inputmode="decimal" class="qty-input" data-km-region-idx="${ri}" data-km-rate-bracket="${b._idx}" data-km-rate-tier="${ti}" value="${b.rates && b.rates[ti]!=null ? b.rates[ti] : ''}"></td>`).join('')}
              <td><button type="button" class="btn sm danger" data-km-region-idx="${ri}" data-km-delbracket="${b._idx}">Xoá</button></td>
            </tr>`).join('')
            : `<tr><td colspan="${tiers.length+2}" class="empty">Chưa có khoảng km nào.</td></tr>`}
          </tbody></table></div>
        <div class="modal-actions" style="justify-content:flex-start;margin-top:8px;">
          <button type="button" class="btn sm" data-km-addtier="${ri}">+ Thêm mốc tải trọng</button>
          <button type="button" class="btn sm" data-km-addbracket="${ri}">+ Thêm khoảng km</button>
        </div>
      </div>`;
  }
  function kmRegionsHtml(){
    return kmDraftLocal.regions.map((region, ri)=>kmRegionBlockHtml(region, ri)).join('')
      + `<div class="hint">Để trống hẳn 1 trong 2 khu vực (không nhập mốc tải trọng/khoảng km nào) nếu khách hàng này không phân biệt Nội thành/Ngoại tỉnh cho chuyến thường — lái xe sẽ không cần chọn khu vực khi nhập chuyến, hệ thống tự dùng đúng khu vực còn lại. Để trống "Khoảng km (đến)" nghĩa là mốc cao nhất, không giới hạn (kiểu ">80km"); ngược lại chuyến xa hơn mốc cao nhất đã nhập, hoặc xe có tải trọng không khớp đúng mốc nào, sẽ báo thiếu đơn giá thay vì tự đoán.</div>`;
  }
  // Đọc lại toàn bộ ô đang gõ trong các bảng bậc thang vào bản nháp — gọi
  // trước mỗi lần thêm/xoá khu vực/dòng/cột (phải vẽ lại) để không mất dữ
  // liệu vừa gõ.
  function syncKmGridFromDom(){
    document.querySelectorAll('[data-km-tier]').forEach(input=>{
      const region = kmDraftLocal.regions[Number(input.dataset.kmRegionIdx)];
      region.tiers[Number(input.dataset.kmTier)] = input.value===''?'':safeNum(input.value);
    });
    document.querySelectorAll('[data-km-bracket]').forEach(input=>{
      const region = kmDraftLocal.regions[Number(input.dataset.kmRegionIdx)];
      region.brackets[Number(input.dataset.kmBracket)].kmMax = input.value===''?'':safeNum(input.value);
    });
    document.querySelectorAll('[data-km-rate-bracket]').forEach(input=>{
      const region = kmDraftLocal.regions[Number(input.dataset.kmRegionIdx)];
      const bi = Number(input.dataset.kmRateBracket), ti = Number(input.dataset.kmRateTier);
      if(!region.brackets[bi].rates) region.brackets[bi].rates = {};
      const v = input.value.trim();
      if(v==='') delete region.brackets[bi].rates[ti]; else region.brackets[bi].rates[ti] = safeNum(v);
    });
  }
  function bindKmGrid(){
    document.querySelectorAll('[data-km-deltier]').forEach(btn=>{
      btn.onclick = ()=>{
        syncKmGridFromDom();
        removeKmTierFromDraft(kmDraftLocal.regions[Number(btn.dataset.kmRegionIdx)], Number(btn.dataset.kmDeltier));
        refreshFields();
      };
    });
    document.querySelectorAll('[data-km-delbracket]').forEach(btn=>{
      btn.onclick = ()=>{
        syncKmGridFromDom();
        kmDraftLocal.regions[Number(btn.dataset.kmRegionIdx)].brackets.splice(Number(btn.dataset.kmDelbracket),1);
        refreshFields();
      };
    });
    document.querySelectorAll('[data-km-addtier]').forEach(btn=>{
      btn.onclick = ()=>{ syncKmGridFromDom(); kmDraftLocal.regions[Number(btn.dataset.kmAddtier)].tiers.push(''); refreshFields(); };
    });
    document.querySelectorAll('[data-km-addbracket]').forEach(btn=>{
      btn.onclick = ()=>{ syncKmGridFromDom(); kmDraftLocal.regions[Number(btn.dataset.kmAddbracket)].brackets.push({ kmMax:'', rates:{} }); refreshFields(); };
    });
    activeKmGrid = {
      sync: syncKmGridFromDom,
      reorderRow(from, to, regionIdx){ reorderKmRow(kmDraftLocal.regions[regionIdx], from, to); },
      reorderColumn(from, to, regionIdx){ reorderKmColumn(kmDraftLocal.regions[regionIdx], from, to); },
      refresh: refreshFields,
    };
  }

  function fieldsHtml(method){
    if(method==='km') return `
      <div class="modal-field"><label for="m-surge-inner">Tăng cường — Nội thành (đ/chuyến)</label><input type="number" id="m-surge-inner" value="${c.surgeInnerAmount!=null?c.surgeInnerAmount:''}"></div>
      <div class="modal-field"><label for="m-surge-outer">Tăng cường — Ngoại tỉnh, trong ngưỡng (đ/chuyến)</label><input type="number" id="m-surge-outer" value="${c.surgeOuterFlatAmount!=null?c.surgeOuterFlatAmount:''}"></div>
      <div class="modal-field"><label for="m-surge-cap">Ngưỡng km (vượt quá mới tra bậc thang km)</label><input type="number" id="m-surge-cap" value="${c.surgeOuterKmCap!=null?c.surgeOuterKmCap:200}"></div>
      <div class="full hint">Chuyến thường tra theo bậc thang km × tải trọng xe bên dưới, đúng Khu vực (Nội thành/Ngoại tỉnh) chọn trên từng chuyến. Chuyến tăng cường KHÔNG tra bậc thang đó mà theo Khu vực chọn trên chuyến: Nội thành trả cố định; Ngoại tỉnh trong ngưỡng km trả cố định; vượt ngưỡng thì tra ĐÚNG bảng bậc thang km × tải trọng xe bên dưới (theo đúng Khu vực Ngoại tỉnh) theo số km và tải trọng xe thực tế của chuyến.</div>
      <div class="modal-field"><label for="m-lh-5">Phụ cấp đường dài — xe ≤5 tấn (đ/tháng)</label><input type="number" id="m-lh-5" value="${c.longHaulUpTo5!=null?c.longHaulUpTo5:''}"></div>
      <div class="modal-field"><label for="m-lh-8">Phụ cấp đường dài — xe ≤8 tấn (đ/tháng)</label><input type="number" id="m-lh-8" value="${c.longHaulUpTo8!=null?c.longHaulUpTo8:''}"></div>
      <div class="modal-field"><label for="m-lh-15">Phụ cấp đường dài — xe ≤15 tấn (đ/tháng)</label><input type="number" id="m-lh-15" value="${c.longHaulUpTo15!=null?c.longHaulUpTo15:''}"></div>
      <div class="full hint">Để trống cả 3 ô trên nếu khách hàng này không áp dụng. Có cấu hình thì mỗi ngày phát sinh chuyến tăng cường Ngoại tỉnh VƯỢT NGƯỠNG km ở trên, lái xe được cộng thêm vào Phụ cấp một khoản = mức tháng theo tải trọng xe chạy chuyến đó / 28 ngày công.</div>
      <div class="modal-field full"><label>Bậc thang km × tải trọng xe theo từng khu vực (chuyến thường)</label>${kmRegionsHtml()}</div>`;
    if(method==='tripPlusExtras') return `
      <div class="modal-field"><label for="m-loading">Đơn giá bốc xếp (đ/lượt) *</label><input type="number" id="m-loading" value="${c.loadingPrice!=null?c.loadingPrice:''}"></div>
      <div class="full hint">Lương chuyến = đơn giá theo Tuyến (cấu hình ở "Bảng giá theo tuyến") + số lượt bốc xếp × đơn giá bốc xếp. Phụ cấp rớt điểm (theo tải trọng xe) tính riêng, áp dụng chung cho mọi khách hàng — xem ở ô "Số điểm giao" trên từng chuyến.</div>`;
    if(method==='fixed') return `<div class="full hint">Lái xe làm cho khách hàng này nhận lương cứng theo kỳ — đặt mức lương ở hồ sơ Lái xe (mục "Lương cứng"). Chuyến vẫn ghi nhận để theo dõi vận hành nhưng không cộng thêm lương.</div>`;
    return `<div class="full hint">Đơn giá từng tuyến của khách hàng này đặt ở mục "Bảng giá theo tuyến".</div>`;
  }
  function refreshFields(){
    const method = $('m-method').value;
    $('m-method-fields').innerHTML = fieldsHtml(method);
    setModalWide(method==='km');
    if(method==='km') bindKmGrid();
  }
  refreshFields();
  $('m-method').onchange = refreshFields;
  $('m-cancel').onclick = closeModal;
  $('m-save').onclick = async ()=>{
    const code = rec ? rec.code : $('m-code').value.trim();
    const name = $('m-name').value.trim();
    if(!code || !name){ modalError('Cần nhập Mã khách hàng và Tên khách hàng.'); return; }
    if(!rec && state.customers.some(x=>x.code===code)){ modalError('Mã khách hàng này đã tồn tại.'); return; }
    const method = $('m-method').value;
    const data = { code, name, calcMethod: method };
    if(method==='km'){
      data.surgeInnerAmount = $('m-surge-inner').value==='' ? null : safeNum($('m-surge-inner').value);
      data.surgeOuterFlatAmount = $('m-surge-outer').value==='' ? null : safeNum($('m-surge-outer').value);
      data.surgeOuterKmCap = $('m-surge-cap').value==='' ? null : safeNum($('m-surge-cap').value);
      data.longHaulUpTo5 = $('m-lh-5').value==='' ? null : safeNum($('m-lh-5').value);
      data.longHaulUpTo8 = $('m-lh-8').value==='' ? null : safeNum($('m-lh-8').value);
      data.longHaulUpTo15 = $('m-lh-15').value==='' ? null : safeNum($('m-lh-15').value);
      syncKmGridFromDom();
      const compact = compactKmDraft(kmDraftLocal);
      for(const r of compact.regions){
        const dupKm = new Map();
        r.brackets.forEach(b=>dupKm.set(b.kmMax, (dupKm.get(b.kmMax)||0)+1));
        const dup = [...dupKm.entries()].find(([,n])=>n>1);
        if(dup){ modalError(`Khu vực "${zoneLabel(r.zone)}": khoảng km "${dup[0]==null?'không giới hạn':dup[0]}" bị trùng.`); return; }
      }
      data.kmRegions = compact.regions;
    }else if(method==='tripPlusExtras'){
      const loading = safeNum($('m-loading').value);
      if(!loading){ modalError('Cần nhập đơn giá bốc xếp lớn hơn 0.'); return; }
      data.loadingPrice = loading;
    }
    if(rec) await updateDoc('customers', rec.id, data); else await addDoc('customers', data);
    closeModal();
    toast('Đã lưu thông tin khách hàng.');
  };
}
function bindCustomers(){
  document.getElementById('f-q').oninput = e=>{ filters.customers.q = e.target.value; render(); };
  document.querySelector('[data-act="add"]').onclick = ()=>openCustomerModal(null);
  bindRowActions(
    id => openCustomerModal(state.customers.find(x=>x.id===id)),
    async id => {
      const c = state.customers.find(x=>x.id===id);
      const used = state.trips.filter(t=>t.project===c.code).length;
      const msg = used
        ? `Khách hàng ${c.code} đang gắn với ${used} chuyến. Xoá sẽ khiến các chuyến đó không tra được cách tính lương. Vẫn xoá?`
        : `Xoá khách hàng ${c.code} — ${c.name}?`;
      if(confirm(msg)){ await deleteDoc('customers', id); toast('Đã xoá khách hàng.'); }
    }
  );
}

/* =========================================================================
   CẤU HÌNH: BẢNG GIÁ THEO TUYẾN
   Chọn khách hàng rồi gõ thẳng từng dòng tuyến + đơn giá trên bảng (một khách
   hàng thường có rất nhiều tuyến), hoặc nạp cả bảng giá từ file Excel.
   ========================================================================= */
const routeDraft = new Map();   // khoá dòng -> {project?, route?, price?, surchargePrice?, isNew?}
let routeNewSeq = 0;
const ROUTE_IMPORT_COLS = [
  { header:'Tên tuyến',          field:'routeName' },
  { header:'Tuyến đường',        field:'route' },
  { header:'Đơn giá/chuyến',     field:'price' },
  { header:'Đơn giá tăng cường', field:'surchargePrice' },
];
// "Tên tuyến" chỉ là tên gọi nội bộ để hiển thị (VD: "Tuyến 1") — "Tuyến
// đường" (dạng "Điểm đi – Điểm đến") mới là khoá tra đơn giá/điểm đi-đến,
// không đổi khi sửa Tên tuyến.
const ROUTE_TEXT_FIELDS = ['route', 'routeName'];

// Khách hàng ĐANG tính "Theo tuyến" / "Theo chuyến + bốc xếp" luôn hiện ở
// đây (bắt buộc phải có tuyến mới tính được lương). Khách "Theo km" cũng
// hiện được — CHỈ khi cần cấu hình 1 vài tuyến chạy giá cố định thay vì tra
// bậc thang km (VD NTF có 1 tuyến cố định): chuyến nào ghi đúng Tuyến đường
// đã cấu hình ở đây thì ưu tiên dùng đơn giá tuyến, không tra bậc thang km
// nữa (xem tripBasePrice) — không bắt buộc, khách "Theo km" không cấu hình
// tuyến nào thì vẫn tính bậc thang km như cũ. Khách đã đổi hẳn sang "Lương
// cứng" thì không hiện nữa dù còn tuyến cũ. Riêng khách đã bị XOÁ hẳn khỏi
// mục Khách hàng nhưng vẫn còn tuyến thì vẫn giữ lại (đánh dấu "không còn
// trong mục Khách hàng") để không giấu mất dữ liệu cũ.
function routeCustomerCodes(){
  const needRoutes = state.customers
    .filter(c=>c.calcMethod==='route' || c.calcMethod==='tripPlusExtras' || c.calcMethod==='km')
    .map(c=>c.code);
  const orphaned = state.routes.map(r=>r.project).filter(p=>!customerByCode(p));
  return distinct(needRoutes.concat(orphaned)).sort();
}
// "" (rỗng) = không chọn khách hàng cụ thể nào — nghĩa là xem TẤT CẢ các
// tuyến của mọi khách hàng gộp lại, không tự chọn đại 1 khách hàng đầu tiên.
function currentRouteProject(){
  const opts = routeCustomerCodes();
  return opts.includes(filters.routes.project) ? filters.routes.project : '';
}
function routeUsedCount(project, route){
  return state.trips.filter(t=>t.project===project && t.route===route).length;
}
// project rỗng -> gộp tuyến của MỌI khách hàng, sắp theo khách hàng rồi tới
// tuyến; không cho thêm dòng mới ở chế độ này (không rõ gán cho khách nào).
function routeRowsFor(project){
  const source = project ? state.routes.filter(r=>r.project===project) : state.routes;
  const rows = [...source]
    .sort((a,b)=> project ? String(a.route).localeCompare(String(b.route))
      : (String(a.project).localeCompare(String(b.project)) || String(a.route).localeCompare(String(b.route))))
    .map(r=>{
      const d = routeDraft.get(r.id) || {};
      const val = f => d[f]!==undefined ? d[f] : (ROUTE_TEXT_FIELDS.includes(f) ? (r[f]||'') : (r[f]!=null ? r[f] : null));
      return {
        key:r.id, savedRow:r, isNew:false, project:r.project,
        routeName: val('routeName'), route: val('route'), price: val('price'), surchargePrice: val('surchargePrice'),
        dirty: ['routeName','route','price','surchargePrice'].some(f=>d[f]!==undefined),
        used: routeUsedCount(r.project, r.route),
      };
    });
  if(project){
    routeDraft.forEach((d,key)=>{
      if(!d.isNew || d.project!==project) return;
      rows.push({ key, savedRow:null, isNew:true, project,
        routeName:d.routeName||'', route:d.route||'', price:d.price!=null?d.price:null, surchargePrice:d.surchargePrice!=null?d.surchargePrice:null,
        dirty: !!String(d.route||'').trim() || !!String(d.routeName||'').trim() || d.price!=null, used:0 });
    });
  }
  return rows;
}
// Ghi một ô đang gõ vào bản nháp; bằng đúng giá trị đã lưu thì bỏ khỏi nháp
// để không bị đánh dấu "chưa lưu" oan.
function setRouteDraftField(key, field, val){
  const d = routeDraft.get(key);
  if(d && d.isNew){ d[field] = val; routeDraft.set(key, d); return; }
  const savedRow = state.routes.find(x=>x.id===key);
  const savedVal = savedRow ? (ROUTE_TEXT_FIELDS.includes(field) ? (savedRow[field]||'') : (savedRow[field]!=null?savedRow[field]:null)) : null;
  const draft = d || {};
  if(val === savedVal) delete draft[field]; else draft[field] = val;
  if(Object.keys(draft).length) routeDraft.set(key, draft); else routeDraft.delete(key);
}

function renderRoutes(){
  const opts = routeCustomerCodes();
  const project = currentRouteProject();
  const rows = routeRowsFor(project);
  const dirtyCount = rows.filter(r=>r.dirty).length;
  const cols = project ? 6 : 7;
  return `
    <div class="pagehead">
      <div><h1>Bảng giá theo tuyến</h1>
        <p>Chọn khách hàng rồi gõ thẳng tên tuyến và đơn giá trên bảng — mỗi dòng một tuyến, gõ xong bấm "Lưu bảng giá". Sửa ở đây là kỳ lương tính lại ngay. Để trống ô Khách hàng để xem gộp tuyến của mọi khách hàng.</p></div>
      ${project?`<div class="actions">${importButtons('route')}</div>`:''}
    </div>
    ${opts.length ? `
    <div class="filterbar">
      <div class="field grow">${comboField('f-route-project',
        [{v:'', l:'Khách hàng'}, ...opts.map(p=>{ const c=customerByCode(p); return {v:p, l: c ? p+' — '+c.name : p+' (không còn trong mục Khách hàng)'}; })],
        project, 'Khách hàng')}</div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr>${project?'':'<th>Khách hàng</th>'}<th>Tên tuyến</th><th>Tuyến đường</th><th class="num">Đơn giá/chuyến</th><th class="num">Đơn giá tăng cường</th>
        <th class="num">Đã dùng</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(r=>renderRouteRow(r, !project)).join('')
        : `<tr><td colspan="${cols}" class="empty">${project?'Chưa có tuyến nào cho khách hàng này — bấm "+ Thêm dòng" để nhập.':'Chưa có tuyến nào.'}</td></tr>`}
      </tbody></table></div>
    <div class="savebar">
      ${project?'<button class="btn" id="route-add-row">+ Thêm dòng</button>':''}
      <button class="btn primary" id="route-save"${dirtyCount?'':' disabled'}>Lưu bảng giá</button>
      <span class="status${dirtyCount?' dirty':''}">${dirtyCount?`● ${dirtyCount} dòng đang sửa chưa lưu`:'Đã lưu, không có thay đổi'}</span>
    </div>`
    : `<div class="tablewrap"><table><tbody><tr><td class="empty">Chưa có khách hàng nào tính lương theo tuyến. Vào Cấu hình › Khách hàng để thêm.</td></tr></tbody></table></div>`}`;
}
function renderRouteRow(r, showProject){
  const d = routeDraft.get(r.key) || {};
  const cls = f => (r.isNew || d[f]!==undefined) ? ' dirty' : '';
  const eid = f => `route-${idSafe(r.key)}-${f}`;
  return `<tr>
    ${showProject?`<td>${esc(r.project)}${customerByCode(r.project)?'':' <span class="badge warn">?</span>'}</td>`:''}
    <td><input type="text" id="${eid('routeName')}" class="qty-input text${cls('routeName')}" data-route-key="${esc(r.key)}"
      data-route-field="routeName" value="${esc(r.routeName||'')}" placeholder="VD: Tuyến 1"></td>
    <td><input type="text" id="${eid('route')}" class="qty-input text${cls('route')}" data-route-key="${esc(r.key)}"
      data-route-field="route" value="${esc(r.route)}" placeholder="VD: Hà Nội – Hải Phòng"></td>
    <td class="num"><input type="text" inputmode="decimal" id="${eid('price')}" class="qty-input${cls('price')}"
      data-route-key="${esc(r.key)}" data-route-field="price" value="${r.price!=null?r.price:''}"></td>
    <td class="num"><input type="text" inputmode="decimal" id="${eid('surchargePrice')}" class="qty-input${cls('surchargePrice')}"
      data-route-key="${esc(r.key)}" data-route-field="surchargePrice" value="${r.surchargePrice!=null?r.surchargePrice:''}" placeholder="= giá thường"></td>
    <td class="num muted">${r.isNew?'dòng mới':r.used+' chuyến'}</td>
    <td><button class="btn sm danger" data-route-del="${esc(r.key)}">Xoá</button></td>
  </tr>`;
}

// Xuất file mẫu (điền sẵn tuyến + đơn giá đang có của khách hàng đang chọn) và
// nạp lại từ file đã điền — nạp vào bản nháp để xem lại trước khi bấm Lưu.
function exportRouteTemplate(){
  const project = currentRouteProject();
  const rows = routeRowsFor(project);
  const aoa = [ROUTE_IMPORT_COLS.map(c=>c.header)];
  rows.forEach(r=>aoa.push([r.routeName||'', r.route||'', r.price!=null?r.price:'', r.surchargePrice!=null?r.surchargePrice:'']));
  if(!rows.length) aoa.push(['','','','']);
  downloadSheet(`BangGiaTuyen_${project}.xlsx`, aoa, 'Bang gia tuyen');
  toast('Đã tạo file mẫu — điền tuyến và đơn giá rồi dùng "Nhập từ Excel" để nạp lại.');
}
function importRouteExcel(rows){
  const project = currentRouteProject();
  const colHeader = field => ROUTE_IMPORT_COLS.find(c=>c.field===field).header;
  let added = 0, updated = 0;
  rows.forEach(row=>{
    const name = String(row[colHeader('route')]||'').trim();
    if(!name) return;
    const routeName = String(row[colHeader('routeName')]||'').trim();
    const rawPrice = row[colHeader('price')];
    const rawSur = row[colHeader('surchargePrice')];
    const price = (rawPrice===''||rawPrice===undefined) ? null : safeNum(rawPrice);
    const sur = (rawSur===''||rawSur===undefined) ? null : safeNum(rawSur);
    const existing = state.routes.find(r=>r.project===project && r.route===name);
    if(existing){
      setRouteDraftField(existing.id, 'routeName', routeName);
      if(price!==null) setRouteDraftField(existing.id, 'price', price);
      setRouteDraftField(existing.id, 'surchargePrice', sur);
      updated++;
    }else{
      routeDraft.set('new'+(++routeNewSeq), { isNew:true, project, route:name, routeName, price, surchargePrice:sur });
      added++;
    }
  });
  toast(added||updated
    ? `Đã nạp ${added} tuyến mới, ${updated} tuyến cập nhật — kiểm tra lại rồi bấm "Lưu bảng giá".`
    : 'Không đọc được tuyến nào trong file (kiểm tra cột "Tuyến đường").', (added||updated)?undefined:'danger');
  scheduleRender();
}

async function saveRouteTable(project, btn){
  const all = routeRowsFor(project);
  // dòng mới còn trống trơn thì bỏ đi, không coi là lỗi
  const rows = all.filter(r=>r.dirty && !(r.isNew && !String(r.route).trim() && r.price==null));
  for(const r of rows){
    if(!String(r.route).trim()){ toast('Có dòng chưa nhập tên tuyến.', 'danger'); return; }
    if(r.price==null){ toast(`Tuyến "${String(r.route).trim()}" chưa nhập đơn giá.`, 'danger'); return; }
  }
  const seen = new Map();
  all.forEach(r=>{ const n = String(r.route).trim(); if(n) seen.set(n, (seen.get(n)||0)+1); });
  const dup = [...seen.entries()].find(([,n])=>n>1);
  if(dup){ toast(`Tuyến "${dup[0]}" bị trùng ${dup[1]} dòng — mỗi tuyến chỉ để một dòng.`, 'danger'); return; }

  // Đổi tên tuyến đang có chuyến dùng: cập nhật luôn các chuyến đó, nếu không
  // chúng sẽ mất liên kết đơn giá (chuyến tra đơn giá theo tên tuyến). Dùng
  // r.project (khách hàng THẬT của từng dòng) chứ không dùng "project" tham
  // số — ở chế độ xem gộp mọi khách hàng, "project" truyền vào là rỗng.
  const renames = rows
    .filter(r=>!r.isNew && r.savedRow && String(r.route).trim() !== r.savedRow.route)
    .map(r=>({ to:String(r.route).trim(), trips: state.trips.filter(t=>t.project===r.project && t.route===r.savedRow.route) }))
    .filter(x=>x.trips.length);
  if(renames.length){
    const n = renames.reduce((s,x)=>s+x.trips.length,0);
    if(!confirm(`Đổi tên ${renames.length} tuyến đang có ${n} chuyến sử dụng — các chuyến đó sẽ được đổi theo tên tuyến mới. Tiếp tục?`)) return;
  }

  btn.disabled = true;
  for(const r of rows){
    const data = { project:r.project, routeName: String(r.routeName||'').trim() || null, route:String(r.route).trim(), price:safeNum(r.price),
      surchargePrice: r.surchargePrice==null ? null : safeNum(r.surchargePrice) };
    if(r.isNew) await addDoc('routes', data); else await updateDoc('routes', r.key, data);
    routeDraft.delete(r.key);
  }
  for(const x of renames){
    for(const t of x.trips) await updateDoc('trips', t.id, { route:x.to });
  }
  all.filter(r=>r.isNew).forEach(r=>routeDraft.delete(r.key));   // dọn nốt dòng mới còn trống
  toast(`Đã lưu bảng giá ${rows.length} tuyến.`);
  scheduleRender();
}

function bindRoutes(){
  const $ = id=>document.getElementById(id);
  const project = currentRouteProject();
  const sel = $('f-route-project');
  if(sel){
    bindCombo('f-route-project', [{v:'', l:'Khách hàng'}, ...routeCustomerCodes().map(p=>{
      const c = customerByCode(p);
      return {v:p, l: c ? p+' — '+c.name : p+' (không còn trong mục Khách hàng)'};
    })]);
    sel.onchange = e=>{ filters.routes.project = e.target.value; render(); };
  }

  bindImportButtons('route', exportRouteTemplate, importRouteExcel);

  document.querySelectorAll('[data-route-field]').forEach(input=>{
    input.oninput = ()=>{
      const field = input.dataset.routeField;
      const val = ROUTE_TEXT_FIELDS.includes(field) ? input.value : (input.value.trim()===''?null:safeNum(input.value));
      setRouteDraftField(input.dataset.routeKey, field, val);
      scheduleRender();
    };
  });

  const addBtn = $('route-add-row');
  if(addBtn) addBtn.onclick = ()=>{
    const key = 'new'+(++routeNewSeq);
    routeDraft.set(key, { isNew:true, project, routeName:'', route:'', price:null, surchargePrice:null });
    render();
    const el = document.getElementById(`route-${idSafe(key)}-route`);
    if(el) el.focus();
  };

  document.querySelectorAll('[data-route-del]').forEach(b=>{
    b.onclick = async ()=>{
      const key = b.dataset.routeDel;
      const d = routeDraft.get(key);
      if(d && d.isNew){ routeDraft.delete(key); render(); return; }
      const r = state.routes.find(x=>x.id===key);
      if(!r) return;
      const used = routeUsedCount(r.project, r.route);
      const msg = used
        ? `Có ${used} chuyến đang dùng tuyến "${r.route}". Xoá xong các chuyến đó sẽ thiếu đơn giá khi tính lương. Vẫn xoá?`
        : `Xoá tuyến "${r.route}"?`;
      if(!confirm(msg)) return;
      routeDraft.delete(key);
      try{ await deleteDoc('routes', key); toast('Đã xoá tuyến.'); }
      catch(e){ toast('Xoá tuyến lỗi: '+((e&&e.message)||e), 'danger'); }
    };
  });

  const saveBtn = $('route-save');
  if(saveBtn) saveBtn.onclick = ()=>saveRouteTable(project, saveBtn);
}

/* =========================================================================
   LƯƠNG THEO KM (bậc thang km × tải trọng xe) — CẤU HÌNH RIÊNG NGAY TRONG
   modal "Sửa khách hàng" của từng khách hàng "Theo km" (không phải trang
   riêng, vì đơn giá này gắn chặt với đúng 1 khách hàng đang sửa). Xem
   openCustomerModal() cho phần dựng UI + gắn sự kiện.
   ========================================================================= */
// Bản nháp LUÔN có đúng 2 khu vực CỐ ĐỊNH (Nội thành/Ngoại tỉnh, không còn
// đặt tên tuỳ ý/thêm-bớt khu vực như trước — xem ghi chú ở kmRegionFor) để
// khách hàng chỉ cần nhập, không phải bấm "+ Thêm khu vực" trước; để trống
// hẳn 1 trong 2 khi lưu (xem compactKmDraft) là coi như khách hàng đó không
// dùng khu vực này.
function cloneKmConfig(cust){
  const src = (cust && cust.kmRegions) || [];
  const byZone = {};
  src.forEach(r=>{ if(r.zone==='inner' || r.zone==='outer') byZone[r.zone] = r; });
  const regions = ['inner','outer'].map(zone=>{
    const r = byZone[zone];
    return {
      zone,
      tiers: [...((r&&r.tiers)||[])],
      brackets: ((r&&r.brackets)||[]).map(b=>({ kmMax:b.kmMax, rates:{...(b.rates||{})} })),
    };
  });
  return { regions };
}
// Xoá 1 cột tải trọng của MỘT khu vực: dồn lại chỉ số các cột phía sau để
// đơn giá đã nhập của các cột còn lại không bị lệch cột.
function removeKmTierFromDraft(region, index){
  region.tiers.splice(index, 1);
  region.brackets.forEach(b=>{
    const newRates = {};
    Object.keys(b.rates||{}).forEach(k=>{
      const i = Number(k);
      if(i===index) return;
      newRates[i>index ? i-1 : i] = b.rates[k];
    });
    b.rates = newRates;
  });
}
// Đổi vị trí 1 DÒNG (khoảng km) trong bảng — chỉ đổi thứ tự hiển thị/lưu,
// không ảnh hưởng cách tính lương: kmBracketFor tự sắp lại theo kmMax khi
// tra đơn giá, không phụ thuộc thứ tự mảng đã lưu.
function reorderKmRow(region, from, to){
  if(from===to) return;
  const item = region.brackets.splice(from, 1)[0];
  region.brackets.splice(to, 0, item);
}
// Đổi vị trí 1 CỘT (mốc tải trọng) — phải đổi luôn rates của MỌI dòng theo
// đúng hoán vị mới, vì rates khoá theo CHỈ SỐ cột chứ không theo giá trị
// tấn (xem ghi chú ở kmRegionFor/kmBracketRateFor).
function reorderKmColumn(region, from, to){
  if(from===to) return;
  const order = [...Array(region.tiers.length).keys()];
  const moved = order.splice(from, 1)[0];
  order.splice(to, 0, moved);
  const oldTiers = region.tiers;
  region.tiers = order.map(oldIdx => oldTiers[oldIdx]);
  region.brackets.forEach(b=>{
    const oldRates = b.rates || {};
    const newRates = {};
    order.forEach((oldIdx, newIdx)=>{ if(oldRates[oldIdx]!=null) newRates[newIdx] = oldRates[oldIdx]; });
    b.rates = newRates;
  });
}
// Dọn 1 khu vực trước khi lưu: bỏ mốc tải trọng còn trống hoặc ≤0 (dồn lại
// chỉ số cột cho khớp); khoảng km để trống "Đến bao nhiêu km" vẫn giữ lại
// (kmMax=null nghĩa là "không giới hạn", dùng cho mốc cao nhất kiểu ">80km")
// miễn là đã nhập ít nhất 1 đơn giá, không thì coi là dòng nháp bỏ đi.
function compactKmRegion(region){
  const tierMap = [];
  const tiers = [];
  region.tiers.forEach((t,i)=>{
    const v = safeNum(t);
    if(t==null || t==='' || !(v>0)){ tierMap[i] = -1; return; }
    tierMap[i] = tiers.length;
    tiers.push(v);
  });
  const brackets = region.brackets
    .filter(b=>{
      const hasMax = b.kmMax!=null && b.kmMax!=='' && safeNum(b.kmMax)>0;
      const hasRate = b.rates && Object.keys(b.rates).some(k=>b.rates[k]!=null && b.rates[k]!=='');
      return hasMax || hasRate;
    })
    .map(b=>{
      const rates = {};
      Object.keys(b.rates||{}).forEach(k=>{
        const ni = tierMap[Number(k)];
        if(ni==null || ni===-1) return;
        const v = b.rates[k];
        if(v==null || v==='') return;
        rates[ni] = safeNum(v);
      });
      const hasMax = b.kmMax!=null && b.kmMax!=='' && safeNum(b.kmMax)>0;
      return { kmMax: hasMax ? safeNum(b.kmMax) : null, rates };
    });
    // Giữ nguyên thứ tự đã sắp trong bản nháp (người dùng có thể đã kéo đổi
    // vị trí dòng) — không tự sắp lại theo kmMax nữa. Lúc TÍNH LƯƠNG,
    // kmBracketFor tự tìm đúng khoảng km cần dùng, không phụ thuộc thứ tự
    // lưu ở đây.
  return { tiers, brackets };
}
// Dọn cả bản nháp: bỏ khu vực còn trống trơn (chưa nhập mốc/khoảng km nào)
// — khách hàng chỉ dùng 1 trong 2 khu vực thì khu vực còn lại biến mất khỏi
// dữ liệu lưu, kmRegionFor tự dùng đúng khu vực còn lại (xem length===1).
function compactKmDraft(d){
  const regions = d.regions
    .filter(r => r.tiers.some(t=>t!=null&&t!=='') || r.brackets.some(b=>b.kmMax!=null&&b.kmMax!==''))
    .map(r=>{
      const c = compactKmRegion(r);
      return { zone: r.zone, tiers: c.tiers, brackets: c.brackets };
    });
  return { regions };
}

/* =========================================================================
   CẤU HÌNH: PHỤ CẤP
   Mỗi loại phụ cấp có đơn giá RIÊNG THEO TỪNG DỰ ÁN/KHÁCH HÀNG (không còn 1
   đơn giá chung cho mọi dự án) — dự án nào chưa nhập đơn giá thì không áp
   dụng (0đ) cho lái xe thuộc dự án đó. MỌI loại đều áp dụng tự động cho
   MỌI lái xe có dự án gốc của xe khớp bảng đơn giá, không còn bước tick gán
   riêng từng lái xe (xem calcPhuCap).
   ========================================================================= */

// Tóm tắt đơn giá của 1 loại phụ cấp CHO ĐÚNG 1 dự án — dùng trong danh sách
// phụ cấp của từng khách hàng (renderAllowanceProjectRow), không phải bảng
// đầy đủ mọi dự án như trước, nên chỉ cần 1 chuỗi tóm tắt gọn cho từng dạng
// đơn giá (flat / theo tải trọng / theo khoảng km × tải trọng).
// Cột "Đơn giá" chỉ hiện NHÃN NGẮN theo cách tính (Theo km/Theo chuyến/Theo
// giờ/Theo tháng…) thay vì liệt kê hết số tiền — bảng nhiều mốc km/tải trọng
// (như "Phụ cấp ăn Nutifood") liệt kê hết sẽ tràn không đọc nổi; xem số tiền
// đầy đủ bằng cách bấm "Sửa".
// { l: nhãn hiển thị, c: màu badge } — mỗi cách tính một màu riêng để phân
// biệt nhanh bằng mắt, không cần đọc chữ.
function allowanceCalcBasis(unit){
  switch(unit){
    case 'perTripByKmCapacity': return { l:'Theo km', c:'blue' };
    case 'perTrip': return { l:'Theo chuyến', c:'good' };
    case 'perOccurrence':
    case 'perOccurrenceByProject': return { l:'Theo giờ', c:'pink' };
    case 'perPeriod':
    case 'perPeriodMinDays':
    case 'perProratedMonth': return { l:'Theo tháng', c:'yellow' };
    case 'perDay': return { l:'Theo ngày công', c:'neutral' };
    case 'perPeriodByCapacity': return { l:'Theo tải trọng xe', c:'outline' };
    default: return { l:unitLabel(unit), c:'neutral' };
  }
}
function allowanceCalcBasisLabel(unit){ return allowanceCalcBasis(unit).l; }
function allowanceRateSummaryForProject(t, project){
  const entry = t.rates ? t.rates[project] : null;
  if(entry==null) return '<span class="muted">—</span>';
  const basis = allowanceCalcBasis(t.unit);
  return `<span class="badge ${basis.c}">${esc(basis.l)}</span>`;
}

// Một dòng KHÁCH HÀNG trong trang Phụ cấp — bấm mở ra sổ xuống đúng các loại
// phụ cấp đang có đơn giá cho khách hàng đó (không trộn lẫn khách hàng khác).
function renderAllowanceProjectRow(project, allTypes){
  const key = project;
  const open = expandedRows.has(key);
  const cust = customerByCode(project);
  const applicable = allTypes.filter(t=>t.rates && t.rates[project]!=null);
  const out = [`<tr>
    <td><button class="linkbtn" data-toggle="${esc(key)}" title="Xem phụ cấp của khách hàng này">${open?'▾':'▸'}</button></td>
    <td><b>${esc(project)}</b>${cust?` — ${esc(cust.name)}`:''}</td>
    <td class="num">${applicable.length}</td>
  </tr>`];
  if(open){
    out.push(`<tr class="expand-row"><td></td><td colspan="2">
      <table><thead><tr><th>Tên phụ cấp</th><th>Đơn vị tính</th><th>Đơn giá</th><th class="num">Áp dụng</th><th></th></tr></thead>
      <tbody>${applicable.length ? applicable.map(t=>`<tr><td>${esc(t.name)}</td><td>${esc(unitLabel(t.unit))}</td>
        <td>${allowanceRateSummaryForProject(t, project)}</td>
        <td class="num muted">Tự động</td>
        <td><button class="btn sm" data-edittype="${t.id}">Sửa</button> <button class="btn sm danger" data-deltype="${t.id}">Xoá</button></td></tr>`).join('')
        : `<tr><td colspan="5" class="empty">Không có</td></tr>`}
      </tbody></table>
    </td></tr>`);
  }
  return out.join('');
}

function renderAllowanceConfig(){
  const allTypes = [...state.allowanceTypes].sort((a,b)=> String(a.name).localeCompare(String(b.name)));
  const projectSet = new Set();
  allTypes.forEach(t=>Object.keys(t.rates||{}).forEach(p=>projectSet.add(p)));
  const projects = [...projectSet].sort();
  const orphanTypes = allTypes.filter(t=>!Object.keys(t.rates||{}).length);
  return `
    <div class="pagehead">
      <div><h1>Phụ cấp</h1><p>Mỗi khách hàng/dự án có các loại phụ cấp và đơn giá riêng — bấm vào một khách hàng để xem các phụ cấp đang áp dụng cho đúng dự án đó.</p></div>
    </div>

    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;">Phụ cấp theo từng khách hàng</h3>
        <button class="btn sm primary" data-act="add-type">+ Thêm loại</button>
      </div>
      <div class="tablewrap" style="margin-top:10px;"><table>
        <thead><tr><th></th><th>Khách hàng</th><th class="num">Số loại phụ cấp</th></tr></thead>
        <tbody>${projects.length ? projects.map(p=>renderAllowanceProjectRow(p, allTypes)).join('')
          : `<tr><td colspan="3" class="empty">Chưa có khách hàng nào được cấu hình phụ cấp — bấm "+ Thêm loại" để tạo. Gợi ý: Ăn ca, Lưu trú, Bốc xếp, Chờ hàng, Tăng ca, Ca đêm, Tiền ăn, Phụ cấp điện thoại…</td></tr>`}
        </tbody></table></div>
    </div>

    ${orphanTypes.length ? `
    <div class="panel">
      <h3 style="margin:0 0 4px;">Loại phụ cấp chưa có khách hàng nào</h3>
      <p class="muted" style="margin:0 0 10px;">Mới tạo nhưng chưa nhập đơn giá cho khách hàng nào nên chưa hiện ở bảng trên — bấm Sửa để thêm.</p>
      <div class="tablewrap"><table>
        <thead><tr><th>Tên phụ cấp</th><th>Đơn vị tính</th><th></th></tr></thead>
        <tbody>${orphanTypes.map(t=>`<tr><td>${esc(t.name)}</td><td>${esc(unitLabel(t.unit))}</td>
          <td><button class="btn sm" data-edittype="${t.id}">Sửa</button> <button class="btn sm danger" data-deltype="${t.id}">Xoá</button></td></tr>`).join('')}
        </tbody></table></div>
    </div>` : ''}`;
}

function openTypeModal(rec){
  const t = rec || { unit:'perPeriod', rates:{} };
  const projects = allProjects();
  // Bậc thang km × tải trọng xe (chỉ dùng khi đơn vị tính là "mỗi chuyến theo
  // km × tải trọng") — 1 dự án + 1 bảng {tiers,brackets}, y hệt cấu trúc 1
  // khu vực của khách hàng "Theo km" nên tái dùng thẳng các hàm dùng chung
  // (removeKmTierFromDraft/compactKmRegion) đã viết cho modal Khách hàng.
  const kmProjectDraft = (function(){
    if(t.unit==='perTripByKmCapacity' && t.rates){
      const p = Object.keys(t.rates)[0];
      if(p) return { project:p, tiers:[...(t.rates[p].tiers||[])],
        brackets:(t.rates[p].brackets||[]).map(b=>({kmMax:b.kmMax, rates:{...(b.rates||{})}})) };
    }
    return { project:'', tiers:[], brackets:[] };
  })();
  openModal(`<h3>${rec?'Sửa loại phụ cấp':'Thêm loại phụ cấp'}</h3>
    <div class="modal-grid">${ERROR_SLOT}
      <div class="modal-field full"><label for="m-name">Tên phụ cấp *</label><input type="text" id="m-name" value="${esc(t.name||'')}" placeholder="VD: Ăn ca, Lưu trú, Bốc xếp…"></div>
      <div class="modal-field full"><label for="m-unit">Đơn vị tính</label><select id="m-unit">${
        ALLOWANCE_UNITS.map(u=>`<option value="${u.v}"${u.v===t.unit?' selected':''}>${esc(u.l)}</option>`).join('')}</select></div>
      <div class="full hint" id="m-unit-hint"></div>
      <div id="m-extra-fields" class="full modal-grid" style="padding:0;"></div>
      <div id="m-rates-wrap" class="full modal-grid" style="padding:0;"></div>
    </div>${MODAL_BUTTONS}`, { wide: t.unit==='perTripByKmCapacity' });
  const $ = id=>document.getElementById(id);

  function extraFieldsHtml(unit){
    if(unit==='perPeriodMinDays') return `<div class="modal-field"><label for="m-mindays">Số ngày công tối thiểu (vượt qua mới nhận trọn)</label><input type="number" min="0" step="1" id="m-mindays" value="${t.minDays!=null?t.minDays:15}"></div>`;
    if(unit==='perProratedMonth') return `<div class="modal-field"><label for="m-stddays">Số ngày công chuẩn/tháng</label><input type="number" min="1" step="1" id="m-stddays" value="${t.standardDays!=null?t.standardDays:26}"></div>`;
    return '';
  }
  function kmProjectGridHtml(){
    const tiers = kmProjectDraft.tiers;
    // Không tự sắp theo kmMax nữa — giữ đúng thứ tự đã lưu để kéo đổi vị
    // trí dòng/cột không bị vẽ lại về thứ tự cũ.
    const brackets = kmProjectDraft.brackets.map((b,i)=>({ ...b, _idx:i }));
    return `
      <div class="modal-field full"><label for="m-km-project">Khách hàng áp dụng *</label><select id="m-km-project">
        <option value="">— Chọn khách hàng —</option>
        ${projects.map(p=>`<option value="${esc(p)}"${p===kmProjectDraft.project?' selected':''}>${esc(p)}</option>`).join('')}
      </select></div>
      <div class="modal-field full">
        <label>Bậc thang km × tải trọng xe — để trống "Khoảng km (đến)" nghĩa là không giới hạn</label>
        <div class="tablewrap" style="margin-top:6px;"><table class="km-fit-table">
          <thead><tr><th>Khoảng km (đến)</th>
            ${tiers.map((tv,i)=>`<th><div class="km-tier-head">
              <input type="number" step="0.1" min="0" class="qty-input" data-kmp-tier="${i}" value="${tv!=null?tv:''}">
              <span class="km-tier-foot"><span class="muted">tấn</span><button type="button" class="btn sm danger" data-kmp-deltier="${i}" title="Xoá mốc này">×</button></span>
            </div></th>`).join('')}
            <th></th></tr></thead>
          <tbody>${brackets.length ? brackets.map(b=>`<tr>
              <td><input type="number" min="0" class="qty-input" data-kmp-bracket="${b._idx}" value="${b.kmMax!=null?b.kmMax:''}" placeholder="Để trống = không giới hạn"> km</td>
              ${tiers.map((_,ti)=>`<td class="num"><input type="text" inputmode="decimal" class="qty-input" data-kmp-rate-bracket="${b._idx}" data-kmp-rate-tier="${ti}" value="${b.rates && b.rates[ti]!=null ? b.rates[ti] : ''}"></td>`).join('')}
              <td><button type="button" class="btn sm danger" data-kmp-delbracket="${b._idx}">Xoá</button></td>
            </tr>`).join('')
            : `<tr><td colspan="${tiers.length+2}" class="empty">Chưa có khoảng km nào.</td></tr>`}
          </tbody></table></div>
        <div class="modal-actions" style="justify-content:flex-start;margin-top:8px;">
          <button type="button" class="btn sm" id="m-kmp-addtier">+ Thêm mốc tải trọng</button>
          <button type="button" class="btn sm" id="m-kmp-addbracket">+ Thêm khoảng km</button>
        </div>
      </div>`;
  }
  function syncKmProjectFromDom(){
    const sel = $('m-km-project');
    if(sel) kmProjectDraft.project = sel.value;
    document.querySelectorAll('[data-kmp-tier]').forEach(input=>{
      kmProjectDraft.tiers[Number(input.dataset.kmpTier)] = input.value===''?'':safeNum(input.value);
    });
    document.querySelectorAll('[data-kmp-bracket]').forEach(input=>{
      kmProjectDraft.brackets[Number(input.dataset.kmpBracket)].kmMax = input.value===''?'':safeNum(input.value);
    });
    document.querySelectorAll('[data-kmp-rate-bracket]').forEach(input=>{
      const bi = Number(input.dataset.kmpRateBracket), ti = Number(input.dataset.kmpRateTier);
      if(!kmProjectDraft.brackets[bi].rates) kmProjectDraft.brackets[bi].rates = {};
      const v = input.value.trim();
      if(v==='') delete kmProjectDraft.brackets[bi].rates[ti]; else kmProjectDraft.brackets[bi].rates[ti] = safeNum(v);
    });
  }
  function bindKmProjectGrid(){
    const sel = $('m-km-project');
    if(sel) sel.onchange = syncKmProjectFromDom;
    document.querySelectorAll('[data-kmp-deltier]').forEach(btn=>{
      btn.onclick = ()=>{ syncKmProjectFromDom(); removeKmTierFromDraft(kmProjectDraft, Number(btn.dataset.kmpDeltier)); refreshUnit(); };
    });
    document.querySelectorAll('[data-kmp-delbracket]').forEach(btn=>{
      btn.onclick = ()=>{ syncKmProjectFromDom(); kmProjectDraft.brackets.splice(Number(btn.dataset.kmpDelbracket),1); refreshUnit(); };
    });
    const addTierBtn = $('m-kmp-addtier');
    if(addTierBtn) addTierBtn.onclick = ()=>{ syncKmProjectFromDom(); kmProjectDraft.tiers.push(''); refreshUnit(); };
    const addBracketBtn = $('m-kmp-addbracket');
    if(addBracketBtn) addBracketBtn.onclick = ()=>{ syncKmProjectFromDom(); kmProjectDraft.brackets.push({ kmMax:'', rates:{} }); refreshUnit(); };
    activeKmGrid = {
      sync: syncKmProjectFromDom,
      reorderRow(from, to){ reorderKmRow(kmProjectDraft, from, to); },
      reorderColumn(from, to){ reorderKmColumn(kmProjectDraft, from, to); },
      refresh: refreshUnit,
    };
  }
  function ratesTableHtml(unit){
    if(unit==='perTripByKmCapacity') return kmProjectGridHtml();
    if(!projects.length) return '<div class="empty">Chưa có dự án/khách hàng nào — thêm ở mục Khách hàng trước.</div>';
    if(unit==='perPeriodByCapacity'){
      return `<div class="modal-field full"><label>Đơn giá theo từng dự án — để trống thì dự án đó không áp dụng (0đ)</label>
        <div class="tablewrap" style="margin-top:6px;"><table><thead><tr><th>Dự án</th>${CAPACITY_TIERS.map(c=>`<th class="num">${c} tấn</th>`).join('')}</tr></thead>
        <tbody>${projects.map(p=>{
          const row = (t.rates && t.rates[p]) || {};
          return `<tr><td>${esc(p)}</td>${CAPACITY_TIERS.map(c=>
            `<td class="num"><input type="number" min="0" class="qty-input" id="m-rate-${idSafe(p)}-${String(c).replace('.','_')}" value="${row[c]!=null?row[c]:''}"></td>`).join('')}</tr>`;
        }).join('')}</tbody></table></div></div>`;
    }
    return `<div class="modal-field full"><label>Đơn giá theo từng dự án — để trống thì dự án đó không áp dụng (0đ)</label>
      <div class="tablewrap" style="margin-top:6px;"><table class="compact-table"><thead><tr><th>Dự án</th><th class="num">Đơn giá (đ)</th></tr></thead>
      <tbody>${projects.map(p=>{
        const v = t.rates ? t.rates[p] : null;
        return `<tr><td>${esc(p)}</td><td class="num"><input type="number" min="0" class="qty-input" id="m-rate-${idSafe(p)}" value="${v!=null?v:''}"></td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  }
  function refreshUnit(){
    const unit = $('m-unit').value;
    $('m-unit-hint').textContent = unit==='perDay'
      ? 'Áp dụng cho mọi lái xe có dự án gốc khớp bảng đơn giá bên dưới — số ngày công tự động đếm theo số ngày có chuyến trong "Chuyến đi", không cần chấm công tay.'
      : unit==='perTripByKmCapacity'
        ? 'Áp dụng cho mọi lái xe có chuyến của đúng khách hàng đã chọn — tính riêng từng chuyến theo số km và tải trọng xe.'
      : unitNeedsManualUsage(unit)
        ? 'Áp dụng cho mọi lái xe có dự án gốc khớp bảng đơn giá bên dưới, nhưng mỗi kỳ vẫn phải vào "Chấm công phụ cấp" nhập số giờ/lần phát sinh (không tự đếm được).'
        : 'Áp dụng cho mọi lái xe có dự án gốc khớp bảng đơn giá bên dưới.';
    $('m-extra-fields').innerHTML = extraFieldsHtml(unit);
    $('m-rates-wrap').innerHTML = ratesTableHtml(unit);
    setModalWide(unit==='perTripByKmCapacity');
    if(unit==='perTripByKmCapacity') bindKmProjectGrid();
  }
  refreshUnit();
  $('m-unit').onchange = refreshUnit;
  $('m-cancel').onclick = closeModal;
  $('m-save').onclick = async ()=>{
    const name = $('m-name').value.trim();
    const unit = $('m-unit').value;
    if(!name){ modalError('Cần nhập tên phụ cấp.'); return; }
    if(state.allowanceTypes.some(x=>x.name===name && (!rec || x.id!==rec.id))){ modalError('Loại phụ cấp này đã có.'); return; }
    const rates = {};
    if(unit==='perTripByKmCapacity'){
      syncKmProjectFromDom();
      if(!kmProjectDraft.project){ modalError('Cần chọn khách hàng áp dụng.'); return; }
      const compact = compactKmRegion(kmProjectDraft);
      if(!compact.tiers.length){ modalError('Cần nhập ít nhất 1 mốc tải trọng lớn hơn 0.'); return; }
      if(!compact.brackets.length){ modalError('Cần nhập ít nhất 1 khoảng km lớn hơn 0.'); return; }
      const dupKm = new Map();
      compact.brackets.forEach(b=>dupKm.set(b.kmMax, (dupKm.get(b.kmMax)||0)+1));
      const dup = [...dupKm.entries()].find(([,n])=>n>1);
      if(dup){ modalError(`Khoảng km "${dup[0]==null?'không giới hạn':dup[0]}" bị trùng.`); return; }
      rates[kmProjectDraft.project] = compact;
    }else if(unit==='perPeriodByCapacity'){
      projects.forEach(p=>{
        const row = {};
        CAPACITY_TIERS.forEach(c=>{
          const el = $(`m-rate-${idSafe(p)}-${String(c).replace('.','_')}`);
          const v = el && el.value!=='' ? safeNum(el.value) : null;
          if(v>0) row[c] = v;
        });
        if(Object.keys(row).length) rates[p] = row;
      });
      if(!Object.keys(rates).length){ modalError('Cần nhập đơn giá cho ít nhất 1 dự án.'); return; }
    }else{
      projects.forEach(p=>{
        const el = $(`m-rate-${idSafe(p)}`);
        const v = el && el.value!=='' ? safeNum(el.value) : null;
        if(v>0) rates[p] = v;
      });
      if(!Object.keys(rates).length){ modalError('Cần nhập đơn giá cho ít nhất 1 dự án.'); return; }
    }
    const data = { name, unit, rates };
    if(unit==='perPeriodMinDays') data.minDays = safeNum($('m-mindays').value) || 15;
    if(unit==='perProratedMonth') data.standardDays = safeNum($('m-stddays').value) || 26;
    if(rec) await updateDoc('allowanceTypes', rec.id, data); else await addDoc('allowanceTypes', data);
    closeModal();
    toast(rec ? 'Đã cập nhật loại phụ cấp — áp dụng ngay cho mọi đối tượng liên quan.' : 'Đã thêm loại phụ cấp.');
  };
}

function bindAllowanceConfig(){
  document.querySelector('[data-act="add-type"]').onclick = ()=>openTypeModal(null);
  document.querySelectorAll('[data-toggle]').forEach(b=>{
    b.onclick = ()=>{ const k=b.dataset.toggle; expandedRows.has(k)?expandedRows.delete(k):expandedRows.add(k); render(); };
  });
  document.querySelectorAll('[data-edittype]').forEach(b=>{
    b.onclick = ()=>openTypeModal(state.allowanceTypes.find(x=>x.id===b.dataset.edittype));
  });
  document.querySelectorAll('[data-deltype]').forEach(b=>{
    b.onclick = async ()=>{
      const id = b.dataset.deltype;
      const t = state.allowanceTypes.find(x=>x.id===id);
      if(!confirm(`Xoá loại phụ cấp "${t.name}"? Dữ liệu chấm công liên quan (nếu có) cũng sẽ bị xoá.`)) return;
      const usages = state.allowanceUsage.filter(u=>u.allowanceTypeId===id);
      for(const u of usages) await deleteDoc('allowanceUsage', u.id);
      await deleteDoc('allowanceTypes', id);
      toast('Đã xoá loại phụ cấp.');
    };
  });
}

/* =========================================================================
   MÀN HÌNH: HƯỚNG DẪN & SAO LƯU
   ========================================================================= */
function renderGuide(){
  const canRestore = storageMode === 'fallback'; // "Phục hồi" ghi vào localStorage — chỉ có ý nghĩa khi app đang ĐỌC từ localStorage (fallback), không phải cloud/supabase
  const hasLegacyLocalData = Object.keys(lsLoadAll()).length>0;
  return `
    <div class="pagehead"><div><h1>Hướng dẫn sử dụng</h1>
      <p>Ba nhóm chức năng bên trái đúng theo thứ tự công việc: cấu hình một lần → nhập liệu hằng ngày → chốt lương cuối kỳ.</p></div></div>

    <div class="panel">
      <h3>Hướng dẫn riêng: Khách hàng NTF</h3>
      <p class="muted" style="margin:0 0 10px;">NTF là khách hàng phức tạp nhất hệ thống (tính theo km, có ngày công riêng, phụ cấp riêng) — đọc kỹ mục này trước khi xử lý chuyến/lương liên quan NTF.</p>
      <ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:10px;">
        <li><b>Cách tính tiền 1 chuyến NTF.</b> NTF tính "Theo km": mỗi chuyến tra vào 1 bảng giá theo <b>Khu vực</b> (Nội thành hoặc Ngoại tỉnh, cấu hình ở Cấu hình › Khách hàng › Sửa NTF) × <b>tải trọng xe</b> × <b>khoảng cách (km)</b>.
          <ul style="margin:6px 0 0;padding-left:18px;">
            <li>Chuyến loại <b>"Chuyến"</b> (bình thường): chọn đúng Khu vực (chỉ hỏi nếu NTF có cấu hình cả 2 khu vực) rồi nhập Số km — hệ thống tự tra bảng ra tiền.</li>
            <li>Chuyến loại <b>"Tăng cường"</b>: LUÔN phải chọn Khu vực. <b>Nội thành</b> trả 1 mức cố định/chuyến (không cần nhập km); <b>Ngoại tỉnh</b> trong ngưỡng km (mặc định 200km) cũng trả cố định, <b>vượt ngưỡng</b> thì tính lại y hệt bảng bậc thang km của chuyến thường (đúng khối Ngoại tỉnh).</li>
            <li>Vài tuyến cố định (VD "Trung chuyển kho Nutifood") có giá riêng ở <b>Lương theo tuyến</b> — ghi đúng Tuyến đường đó thì lấy giá tuyến, không tính theo km nữa.</li>
          </ul>
        </li>
        <li><b>Công chuẩn 28 ngày</b> — chỉ áp dụng cho lái xe phụ trách xe có <b>Khách hàng gốc = NTF</b> (khác 26 ngày của các khách khác). Ngày nào xe có ÍT NHẤT 1 chuyến ghi đúng Khách hàng = NTF thì tính 1 ngày công (bất kể loại Chuyến/Tăng cường/Trả hàng/Trực/Trả điểm, riêng <b>Nghỉ</b> không tính). Hôm nào xe chỉ chạy cho khách khác thì hôm đó KHÔNG tính vào 28 ngày này.</li>
        <li><b>Phụ cấp đường dài</b> (theo tải trọng xe, cộng thẳng vào Lương cố định) — 2 trường hợp được cộng, KHÔNG cộng trùng cả 2 cho cùng 1 ngày:
          <ul style="margin:6px 0 0;padding-left:18px;">
            <li>Xe <b>CÓ</b> Khách hàng gốc = NTF: mọi ngày công NTF ở mục 2 đều tự cộng thêm khoản này — không cần vượt km/tăng cường gì cả, chỉ cần hôm đó có chạy cho NTF.</li>
            <li>Xe <b>KHÔNG</b> có Khách hàng gốc = NTF nhưng được điều chạy <b>TRỌN NGÀY</b> chỉ cho NTF (không xen bất kỳ khách nào khác trong ngày đó) — chỉ những ngày đó được cộng, cùng công thức.</li>
          </ul>
          Mức tiền tra theo tải trọng xe / 28 ngày, cấu hình sẵn 3 mức (≤5T/≤8T/≤15T) ở hồ sơ khách hàng NTF.</li>
        <li><b>Kết hợp với dự án khác</b> — khi 1 xe (dù gốc NTF hay không) chạy 1 chuyến cho khách hàng khác NTF, hệ thống tự đánh dấu chuyến đó <b>Tăng cường</b> và tính tiền theo ĐÚNG giá của khách hàng kia (không dùng giá NTF). Với xe gốc NTF: ngày đó chỉ KHÔNG tính vào 28 ngày công NTF nếu hôm đó xe không có bất kỳ chuyến NTF nào khác — còn nếu hôm đó vừa có chuyến NTF vừa có chuyến khách khác, ngày đó vẫn tính đủ ngày công NTF (dựa trên chuyến NTF), chuyến khách khác vẫn tính tiền riêng theo giá của khách đó.</li>
        <li><b>Phụ cấp riêng của NTF</b> (nếu đã gán ở Cấu hình › Phụ cấp): <b>"Phụ cấp ăn Nutifood"</b> tính riêng theo từng chuyến (km × tải trọng xe) — CHỈ áp dụng chuyến loại "Chuyến" bình thường, không tính Tăng cường/Trả hàng/Trực/Trả điểm/Nghỉ, và không tính nếu chuyến đó chạy đúng 1 tuyến đã có giá cố định; <b>"Phụ cấp qua đêm"</b> tính theo tải trọng xe (hiện chỉ cấu hình mức cho xe 15 tấn).</li>
      </ol>
    </div>

    <div class="panel">
      <h3>1. Cấu hình (làm một lần, sửa khi chính sách đổi)</h3>
      <ul>
        <li><b>Khách hàng</b>: thêm từng khách hàng, chọn đúng cách tính lương chuyến — Theo tuyến (GHN, BEST…), Theo km (NTF), Lương cứng cho lái xe (GS, SEWS), hoặc Theo chuyến + bốc xếp (SGW, BHX) — rồi nhập đơn giá tương ứng. Riêng Theo km: ngay trong khung sửa có đúng 2 khối <b>Khu vực</b> cố định — <b>Nội thành</b> và <b>Ngoại tỉnh</b> (không tự đặt tên được nữa, cùng 1 khái niệm Khu vực dùng chung cho cả chuyến thường lẫn chuyến Tăng cường, khách chỉ dùng 1 trong 2 thì để trống khối còn lại, không cần chia); mỗi khối tự thêm/bớt <b>mốc tải trọng</b> (cột, VD 1,9T/3,5T/5T/8T/15T) và <b>khoảng km</b> (dòng, VD dưới 80/120/200km — để trống "đến" nghĩa là mốc cao nhất, không giới hạn kiểu ">80km"), mỗi ô giao là số tiền/chuyến cho đúng khoảng km + tải trọng đó — dùng cho chuyến thường; chuyến Tăng cường dùng số tiền cố định riêng (Nội thành/Ngoại tỉnh trong ngưỡng km), chỉ tra vào bảng bậc thang này khi Ngoại tỉnh vượt ngưỡng. Khách hàng cấu hình đủ cả 2 khối Khu vực thì khi nhập chuyến phải chọn thêm ô <b>Khu vực</b> (chuyến Tăng cường luôn phải chọn, chuyến thường chỉ hỏi khi đủ 2 khối). Chuyến xa hơn khoảng cao nhất đã nhập, xe không khớp đúng mốc tải trọng nào, hoặc chưa chọn đúng khu vực, sẽ báo thiếu đơn giá thay vì tự đoán.</li>
        <li><b>Xe</b> rồi <b>Lái xe</b>: tạo xe trước, đặt <b>Khách hàng gốc</b> cho xe, rồi ở hồ sơ từng <b>Lái xe</b> chọn <b>Biển số xe phụ trách</b> (đúng 1 xe/lái xe — nhiều lái xe có thể cùng chọn 1 biển số nếu dùng chung xe theo ca, xem ở "Lái xe phụ trách" trên hồ sơ Xe là gán ngược lại, chỉ để xem, không sửa được ở đó), bật <b>Lương cứng</b> ngay trên hồ sơ lái xe nếu khách hàng trả thẳng cho lái xe (GS, SEWS), nhập <b>Phụ cấp thâm niên</b> nếu lái xe đủ điều kiện (để trống nếu không có — có điền thì mỗi kỳ nhận trọn đúng mức đó, không phụ thuộc ngày công, hiện riêng 1 dòng trong Bảng lương), nhập đúng <b>Tải trọng (tấn)</b> của xe (dùng để tính phụ cấp rớt điểm), và chọn <b>Quản lý nhiên liệu</b> cho xe (Khoán dầu thì nhập thêm định mức tiêu hao lít/100km). Có sẵn danh sách lái xe/xe trong Excel thì dùng <b>Tải mẫu Excel</b> → điền → <b>Nhập từ Excel</b> để nạp cả loạt — Mã LX/Biển số đã có trong hệ thống sẽ được cập nhật, mã/biển mới sẽ được thêm; có dòng lỗi thì sửa trực tiếp ngay trên bảng soát lỗi hiện ra, không cần sửa lại file.</li>
        <li><b>Bảng giá theo tuyến</b>: chọn khách hàng rồi gõ thẳng từng dòng — <b>Tên tuyến</b> (tên gọi nội bộ, không bắt buộc — để trống thì hệ thống hiện thẳng Tuyến đường), <b>Tuyến đường</b> dạng "Điểm đi – Điểm đến" (để hệ thống tự điền điểm đi/đến khi nhập chuyến — đây mới là khoá tra đơn giá), đơn giá/chuyến, đơn giá tăng cường (để trống nếu tuyến đó trả bằng giá thường) — bấm <b>+ Thêm dòng</b> để nhập tiếp, xong bấm <b>Lưu bảng giá</b>. Khách hàng có sẵn bảng giá trong Excel thì dùng <b>Tải mẫu Excel</b> → điền → <b>Nhập từ Excel</b> để nạp cả loạt. Đổi Tuyến đường của một tuyến đang có chuyến sử dụng thì các chuyến đó được cập nhật theo, không mất đơn giá; đổi Tên tuyến không ảnh hưởng gì đến chuyến.</li>
        <li><b>Phụ cấp</b>: tạo loại phụ cấp rồi nhập đơn giá riêng cho TỪNG dự án/khách hàng (dự án nào để trống thì không áp dụng) — mọi loại đều tự áp dụng cho MỌI lái xe có dự án gốc của xe khớp bảng đơn giá, không cần gán riêng từng lái xe. "Cố định theo kỳ/theo chuyến/theo ngày công" tự tính số lượng từ dữ liệu chuyến; "theo lần phát sinh"/"nhập số giờ/lần phát sinh mỗi kỳ" (VD Phụ cấp chờ theo giờ) vẫn phải vào "Chấm công phụ cấp" nhập tay mỗi kỳ vì không tự đếm được. Riêng loại "mỗi chuyến theo km × tải trọng xe" (VD Phụ cấp ăn của NTF) chọn 1 khách hàng áp dụng rồi cấu hình bảng bậc thang km × tải trọng y hệt mục Lương theo km — tính riêng cho từng chuyến của khách hàng đó trong kỳ rồi cộng lại, không phải 1 số cố định cả kỳ; CHỈ tính cho chuyến Loại "Chuyến" (normal), không tính cho Tăng cường/Trả hàng/Trực/Trả điểm/Nghỉ; chuyến chạy đúng 1 Tuyến đường đã cấu hình giá cố định (VD "Trung chuyển kho nutifood" của NTF) cũng không tính khoản này dù có ghi Số km.</li>
      </ul>
      <h3 class="spaced">2. Vận hành (hằng ngày)</h3>
      <ul>
        <li><b>Lịch lái xe</b>: chọn Khách hàng thì hệ thống tự hiện đúng ô cần nhập (Tuyến, Số km, hoặc Bốc xếp) theo cách tính của khách hàng đó. Mọi chuyến — không riêng khách hàng nào — đều có ô <b>Số điểm giao</b>: điểm giao đầu tiên không tính, từ điểm thứ 2 trở đi tự cộng <b>Phụ cấp rớt điểm</b> theo tải trọng xe chạy chuyến đó (xem mốc ở "Quy tắc hệ thống đang áp dụng" bên dưới). Chọn lái xe thì xe tự điền theo xe phụ trách; chọn khách hàng khác khách hàng gốc của xe thì hệ thống tự chọn <b>Loại chuyến = Tăng cường</b>. Mỗi chuyến có 6 loại: <b>Chuyến</b> dùng đơn giá thường, <b>Tăng cường</b> dùng đơn giá/số tiền tăng cường riêng; <b>Trả hàng</b>, <b>Trực</b> và <b>Trả điểm</b> LUÔN 0đ, không tính thêm tiền chuyến, chỉ cộng thêm 1 ngày công cho Lương cố định (nếu lái xe có Lương cố định) — khác nhau ở lý do: <b>Trả hàng</b> dùng để ghi lịch ngày hôm sau đi trả nốt hàng của chuyến lấy hàng hôm trước không kịp giao trong ngày (lương km/tuyến của lô hàng đó đã tính đủ ở chuyến gốc rồi); <b>Trực</b> dùng để ghi ngày xe không chạy chuyến nào cả nhưng lái xe vẫn trực; <b>Trả điểm</b> dùng để ghi thêm 1 điểm giao của đúng chuyến "Chuyến" chính cùng ngày/xe/khách hàng. Riêng <b>Nghỉ</b> khác hẳn 3 loại trên: xe không hoạt động nên KHÔNG cộng ngày công cho Lương cố định và không tính bất cứ khoản nào khác — chỉ để ghi nhận lịch xe nghỉ. Dùng nút <b>Lưu &amp; thêm tiếp</b> để nhập nhanh nhiều chuyến trong ngày.</li>
        <li><b>Khấu trừ</b>: nhập ngay khi phát sinh, kỳ lương tự suy ra từ ngày phát sinh.</li>
        <li><b>Nhiên liệu</b>: mỗi kỳ nhập đơn giá dầu chung, rồi với từng xe khoán dầu chấm km công tơ mét đầu/cuối kỳ và dầu tồn đầu kỳ, dầu đổ trong kỳ, dầu tồn cuối kỳ — hệ thống tự tính thưởng/phạt tiết kiệm. Xe không khoán không cần chấm ở đây.</li>
        <li><b>Chấm công phụ cấp</b>: mỗi lái xe một dòng, bấm vào để xem các phụ cấp. Phụ cấp "Theo ngày công" tự động đếm theo số ngày có chuyến ở Chuyến đi; "Theo lần phát sinh" (VD Phụ cấp chờ theo giờ — tự hiện cho đúng lái xe đang chạy dự án đó) mới cần nhập số lượng — hệ thống chỉ ghi những dòng bạn sửa.</li>
        <li><b>Nhập từ Excel</b>: cả bốn mục Vận hành đều có <b>Tải mẫu Excel</b> → điền → <b>Nhập từ Excel</b>. File mẫu của Chuyến đi và Khấu trừ có kèm sheet "Danh mục" liệt kê sẵn mã lái xe, biển số, mã khách hàng và tuyến để điền cho đúng. Chuyến đi và Khấu trừ đều kiểm tra từng dòng rồi mở 1 bảng để <b>soát lại trên web trước khi nhập</b> (không cần sửa lại file rồi tải lên lại) — dòng lỗi tô nền vàng, sửa ô nào xong tự kiểm tra lại dòng đó, bấm "Nhập các dòng hợp lệ" khi đã soát xong; Chuyến đi luôn mở bảng này để soát kể cả khi không có dòng lỗi, riêng Khấu trừ file không có dòng nào lỗi thì nhập thẳng, không cần soát qua bảng. Chấm công phụ cấp và Nhiên liệu nạp vào bảng cho bạn soát trước, xong mới bấm Lưu.</li>
        <li>Các ô chọn danh sách dài (lái xe, xe, khách hàng, tuyến) đều <b>gõ được để tìm</b> — gõ mã hoặc tên đều ra, dùng phím ↑↓ và Enter để chọn nhanh.</li>
      </ul>
      <h3 class="spaced">3. Chốt lương</h3>
      <ul>
        <li>Chọn kỳ ở ô <b>Kỳ lương đang xem</b> bên trái — mọi màn hình đều theo kỳ này.</li>
        <li>Vào <b>Bảng lương</b>, xử lý hết cảnh báo dữ liệu, mở từng dòng để đối soát, rồi xuất Excel (4 sheet: bảng lương, chi tiết chuyến, phụ cấp, khấu trừ) hoặc CSV.</li>
      </ul>
    </div>

    <div class="panel">
      <h3>Quy tắc hệ thống đang áp dụng</h3>
      <ul>
        <li>Thực nhận = Lương cố định + Lương chuyến (đã gộp cả tăng cường) + Phụ cấp + Thưởng/phạt nhiên liệu − Khấu trừ, làm tròn đến đồng.</li>
        <li>Kỳ lương theo tháng dương lịch: từ mùng 1 đến ngày cuối cùng của tháng.</li>
        <li>Chuyến trạng thái <b>Huỷ</b> không được tính lương và không tính vào phụ cấp theo chuyến.</li>
        <li>Lương cố định = lương cứng khách hàng trả thẳng cho lái xe (vd GS, SEWS), đặt ở hồ sơ Lái xe; lái xe không được gán khoản này thì phần đó bằng 0. Trả theo tỷ lệ ngày công thực tế / công chuẩn (đếm theo số ngày có chuyến ở Chuyến đi) — nghỉ nhiều thì hưởng ít hơn mức đã đặt, xem chi tiết "ngày công thực nhận / mức lương cứng" ở dòng "Lương cố định" trong Bảng lương. Công chuẩn là <b>26 ngày</b>, riêng lái xe phụ trách xe có Khách hàng gốc là <b>NTF</b> dùng công chuẩn <b>28 ngày</b> — với xe này, chỉ ngày nào có chuyến ghi đúng Khách hàng NTF mới được tính ngày công; ngày chỉ chạy tạm (Tăng cường) cho khách khác thì không tính. Riêng "Phụ cấp đường dài" theo ngày chạy NTF (tra theo tải trọng xe / 28 ngày, CỘNG THẲNG vào Lương cố định, không phụ thuộc lái xe có bật "Lương cứng" hay không vì đơn giá lấy từ cấu hình khách hàng NTF chứ không phải mức lương cứng riêng của lái xe): xe CÓ Khách hàng gốc là NTF thì <b>mọi ngày công NTF</b> ở trên đều được cộng khoản này; xe KHÔNG có Khách hàng gốc là NTF nhưng có ngày được điều qua chạy RIÊNG cho NTF cả ngày (mọi chuyến trong ngày đó đều ghi Khách hàng = NTF, không xen lẫn khách khác) thì chỉ những ngày đó mới được cộng.</li>
        <li>Mỗi khách hàng một cách tính lương chuyến riêng: Theo tuyến, Theo km (tra bậc thang km × tải trọng xe theo đúng <b>Khu vực</b> (Nội thành/Ngoại tỉnh — MỘT ô Khu vực duy nhất, dùng chung cho cả chuyến thường lẫn chuyến Tăng cường, không hỏi 2 lần) chọn trên chuyến, cấu hình ngay trong hồ sơ khách hàng đó; chuyến tăng cường: Nội thành và Ngoại tỉnh trong ngưỡng km trả cố định, Ngoại tỉnh vượt ngưỡng thì tra đúng bảng bậc thang km × tải trọng xe (đúng khối Ngoại tỉnh) như chuyến thường; khách hàng nào có cấu hình "Phụ cấp đường dài theo tải trọng xe" thì còn tự cộng thêm khoản này (chia 28 ngày/tháng) vào Phụ cấp cho trường hợp vượt ngưỡng, để trống cả 3 ô thì khách hàng đó không áp dụng — mặc định chỉ NTF có cấu hình sẵn; các mức cố định/ngưỡng/phụ cấp đường dài đều cấu hình ở hồ sơ khách hàng), Lương cứng (chuyến không cộng thêm lương), hoặc Theo chuyến + bốc xếp. Khách hàng "Theo km" vẫn có thể cấu hình riêng 1 vài tuyến chạy giá cố định ở "Lương theo tuyến" (VD NTF có 1 tuyến cố định) — chuyến nào ghi đúng Tuyến đường đã cấu hình thì tính theo đơn giá tuyến đó, không tra bậc thang km nữa; không ghi hoặc không khớp tuyến nào thì vẫn tính bậc thang km như bình thường.</li>
        <li>Phụ cấp rớt điểm áp dụng chung cho mọi khách hàng, tính GỘP theo từng ngày + khách hàng (không riêng khách hàng nào): điểm giao đầu tiên không tính, từ điểm thứ 2 trở đi cộng thêm theo tải trọng xe — xe ≤1,9 tấn: 20.000đ/điểm; hơn 1,9 đến 5 tấn: 30.000đ/điểm; hơn 5 đến 15 tấn (và cao hơn): 50.000đ/điểm. Ghi số điểm theo 1 trong 2 cách đều ra đúng tiền, không cần làm cả 2: (a) điền thẳng TỔNG số điểm của lượt chạy vào ô "Số điểm giao" của chuyến "Chuyến" chính; hoặc (b) dùng Loại chuyến <b>Trả điểm</b> — mỗi điểm thêm (từ điểm thứ 2 trở đi) ghi riêng 1 dòng "Trả điểm" (0đ, không cần điền Số điểm giao ở các dòng này) cùng ngày/xe/khách hàng với chuyến "Chuyến" chính, hệ thống tự đếm số dòng "Trả điểm" để tính tiền — cách này còn giúp hiện đủ từng điểm giao thành từng dòng riêng trên Lịch lái xe. Ghi cả 2 cách cùng lúc thì hệ thống lấy giá trị lớn hơn, không cộng trùng cả 2.</li>
        <li>Mọi loại phụ cấp ở mục Cấu hình › Phụ cấp đều có đơn giá riêng theo TỪNG dự án/khách hàng (xác định "thuộc dự án nào" theo Khách hàng gốc của xe lái xe đang phụ trách) — dự án chưa nhập đơn giá cho loại nào thì không áp dụng loại đó (0đ). Ví dụ mặc định: Phụ cấp điện thoại nhận trọn nếu hơn 15 ngày công trong kỳ (không theo tỷ lệ); Tiền ăn tính theo công chuẩn 26 ngày (nghỉ 1 ngày trừ mức/26, đủ hoặc hơn 26 ngày công vẫn chỉ nhận đủ 100%) — hiện đặt GS 1.260.000đ, SEWS 1.000.000đ; Phụ cấp bảo quản xe/gửi xe theo đúng tải trọng xe (1,9/5/8 tấn, khác 3 mức thì không có) — hiện chỉ đặt cho dự án GS. Sửa số tiền hoặc thêm dự án ngay ở màn hình Phụ cấp, không cần sửa code.</li>
        <li>Xe <b>Khoán dầu</b>: Thưởng/phạt = (Tổng km × Định mức xe / 100 − Dầu chạy thực tế) × Đơn giá dầu kỳ đó — Dầu chạy thực tế = Tồn đầu kỳ + Đổ trong kỳ − Tồn cuối kỳ; âm nghĩa là chạy vượt định mức, bị trừ vào lương. Xe <b>Không khoán</b> không thưởng/phạt.</li>
        <li>Lái xe <b>Đã nghỉ việc</b> không xuất hiện trong bảng lương nếu trong kỳ không phát sinh chuyến, khấu trừ hay thưởng.</li>
      </ul>
      <h3 class="spaced">Còn cần công ty xác nhận</h3>
      <ul>
        <li>Kỳ lương đang hiểu là kỳ <i>chốt dữ liệu</i> 16 → 15. Nếu ngày 15 là ngày <i>trả lương</i> của kỳ trước thì cần chỉnh lại cách gán kỳ.</li>
      </ul>
    </div>

    <div class="panel">
      <h3>Sao lưu dữ liệu</h3>
      <p class="muted" style="margin:0 0 10px;">${canRestore
        ? 'Bản offline lưu dữ liệu trong trình duyệt máy này — xoá dữ liệu duyệt web là mất. Nên tải file sao lưu sau mỗi kỳ chốt lương.'
        : 'Dữ liệu đang lưu dùng chung trên claude.ai. Tải file sao lưu để giữ một bản ngoài hệ thống sau mỗi kỳ chốt lương.'}</p>
      <div class="actions">
        <button class="btn" id="backup-export">Tải file sao lưu (.json)</button>
        ${canRestore?'<button class="btn" id="backup-import">Phục hồi từ file sao lưu</button><input type="file" id="backup-file" accept=".json,application/json" hidden>':''}
      </div>
      ${hasLegacyLocalData ? `
      <div class="hint" style="margin-top:12px;">Trình duyệt này còn dữ liệu cũ lưu từ trước khi nối Supabase (localStorage)
        — xuất thành file SQL để nạp 1 lần vào Supabase (sau khi đã chạy supabase_setup.sql tạo bảng trống), không cần
        nhập tay lại từ đầu.</div>
      <div class="actions" style="margin-top:8px;"><button class="btn" id="export-supabase-sql">Xuất SQL nạp vào Supabase</button></div>`
      : ''}
    </div>`;
}

function bindGuide(){
  document.getElementById('backup-export').onclick = ()=>{
    const data = {};
    Object.keys(COLLECTIONS).forEach(key=>{
      data[COLLECTIONS[key]] = Object.fromEntries(state[key].map(({id, ...rest})=>[id, rest]));
    });
    saveFile(`SaoLuu_LuongLaiXe_${todayISO()}.json`,
      JSON.stringify({ app:'vit-trans-payroll', version:1, exportedAt:new Date().toISOString(), data }, null, 2));
    toast('Đã tạo file sao lưu toàn bộ dữ liệu.');
  };
  const exportSqlBtn = document.getElementById('export-supabase-sql');
  if(exportSqlBtn) exportSqlBtn.onclick = ()=>{
    const { sql, totalRows } = buildSupabaseSeedSql();
    if(!totalRows){ toast('Chưa có dữ liệu nào để xuất.', 'danger'); return; }
    saveFile(`NapSupabase_LuongLaiXe_${todayISO()}.sql`, sql);
    toast(`Đã tạo file SQL cho ${totalRows} dòng dữ liệu — dán vào Supabase SQL Editor để chạy (sau supabase_setup.sql).`);
  };
  const importBtn = document.getElementById('backup-import');
  if(!importBtn) return;
  const fileInput = document.getElementById('backup-file');
  importBtn.onclick = ()=>fileInput.click();
  fileInput.onchange = async ()=>{
    const file = fileInput.files[0];
    if(!file) return;
    let parsed;
    try{ parsed = JSON.parse(await file.text()); }
    catch(e){ toast('File sao lưu không đọc được.', 'danger'); return; }
    if(!parsed || parsed.app !== 'vit-trans-payroll' || !parsed.data){
      toast('Đây không phải file sao lưu của hệ thống này.', 'danger'); return;
    }
    if(!confirm('Phục hồi sẽ thay thế toàn bộ dữ liệu hiện tại bằng dữ liệu trong file sao lưu. Tiếp tục?')) return;
    lsSaveAll(parsed.data);
    location.reload();
  };
}

/* =========================================================================
   KHỞI ĐỘNG
   ========================================================================= */
appPeriod = todayPeriod();
render();
initStorage();
