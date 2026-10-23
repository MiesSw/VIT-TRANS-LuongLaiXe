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
  // "Chuyến" (loại phổ biến nhất) để xám trầm cho các loại đặc biệt nổi lên;
  // "Trả điểm" là phần phụ của "Chuyến" nên cùng họ xám (viền). Không dùng
  // xanh lá/cam/đỏ — đó là màu trạng thái (ổn/thiếu dữ liệu/lỗi).
  const cls = type==='surge' ? 'pink' : type==='return' ? 'teal' : type==='standby' ? 'violet' : type==='point' ? 'outline' : type==='off' ? 'solid' : 'neutral';
  return `<span class="badge ${cls}">${esc(tripTypeLabel(type))}</span>`;
}
const DEDUCTION_TYPES= ['Tạm ứng','Phạt vi phạm','Bồi thường','Khác'];
// Mọi đơn vị đều áp dụng tự động theo ĐÚNG dự án lái xe thực chạy trong kỳ
// (xem Chuyến đi) — không cần gán riêng, chỉ cần dự án đó có đơn giá trong
// bảng của loại phụ cấp (xem calcPhuCap).
const ALLOWANCE_UNITS= [
  {v:'perPeriod', l:'Cố định theo kỳ'},
  {v:'perTrip',   l:'Theo chuyến (mọi chuyến được tính lương)'},
  {v:'perDay',    l:'Theo ngày công (tự động đếm ngày có chuyến)'},
  {v:'perOccurrence', l:'Theo lần phát sinh (nhập số lần mỗi kỳ)'},
  {v:'perPeriodMinDays', l:'Tự động theo dự án — nhận trọn khi VƯỢT số ngày công tối thiểu'},
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
// Các mốc tải trọng dùng chung cho mọi loại phụ cấp tính theo tải trọng xe.
const CAPACITY_TIERS = [1.9, 5, 8, 15];
// QUY TẮC SO MỐC TẢI TRỌNG DÙNG CHUNG: mốc ghi "X tấn" nghĩa là xe ĐẾN X tấn
// (≤ X) — xe khớp mốc NHỎ NHẤT còn lớn hơn hoặc bằng tải trọng xe (VD mốc
// 1,9/5/8: xe 3,5T dùng mốc 5T). Áp dụng cho bậc thang km × tải trọng và phụ
// cấp theo tải trọng (trước đây 2 nơi này bắt khớp ĐÚNG số tấn, xe 3,5T/10T
// bị bỏ qua không báo). Trả về giá trị mốc (số) hoặc null nếu xe chưa có tải
// trọng / nặng hơn mốc cao nhất.
function capacityTierFor(tiers, capacity){
  if(capacity==null || capacity==='') return null;
  const cap = safeNum(capacity);
  const nums = (tiers||[]).filter(t=>t!=='' && t!=null).map(Number).filter(Number.isFinite);
  const fit = nums.filter(t => cap <= t + 1e-9).sort((a,b)=>a-b);
  return fit.length ? fit[0] : null;
}
// Đơn giá của một loại phụ cấp áp dụng cho dự án (+ tải trọng xe nếu có) —
// dự án chưa cấu hình đơn giá riêng thì trả về null (không áp dụng, 0đ).
function allowanceRateFor(type, project, capacity){
  if(!type || !type.rates) return null;
  const entry = type.rates[project];
  if(entry==null) return null;
  if(type.unit==='perPeriodByCapacity'){
    const keys = Object.keys(entry).filter(k=>entry[k]!=null && entry[k]!=='' && safeNum(entry[k]));
    const tier = capacityTierFor(keys, capacity);
    if(tier===null) return null;
    const key = keys.find(k=>Number(k)===tier);
    return safeNum(entry[key]);
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
  {v:'route',          l:'Theo tuyến'},
  {v:'km',              l:'Theo km'},
  {v:'fixed',           l:'Lương cứng'},
  {v:'tripPlusExtras',  l:'Theo chuyến + bốc xếp'},
];
function calcMethodLabel(v){ return (CUSTOMER_CALC_METHODS.find(m=>m.v===v)||{}).l || v; }

/* ---------------------------- Trạng thái ứng dụng ---------------------------- */
const state = {
  drivers:[], vehicles:[], routes:[], customers:[], allowanceTypes:[], allowanceConfigs:[],
  allowanceUsage:[], trips:[], deductions:[], fuelLogs:[], fuelPrices:[], periodLocks:[],
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
// Danh sách cảnh báo dữ liệu ĐANG HIỆN ở Bảng lương (xem buildWarnings()) —
// giữ ở biến module-level để bindPayroll() đọc lại được hàm "go" của đúng
// dòng cảnh báo vừa bấm (hàm không nhét vừa vào thuộc tính data-* của HTML
// được, nên lưu nguyên mảng object ở đây, DOM chỉ cần data-warn-idx).
let payrollWarnings = [];
// Khối "cảnh báo dữ liệu" ở Bảng lương mặc định ẨN danh sách chi tiết (chỉ
// hiện dòng tổng số cảnh báo) — bấm vào mới xổ ra từng dòng, đỡ chiếm chỗ
// ngay khi vào trang nếu có nhiều cảnh báo tồn đọng.
let warningsOpen = false;
const filters = {
  payroll:{ driver:'', project:'', q:'' },
  trips:  { driver:'', project:'', q:'' },
  deduct: { driver:'', q:'' },
  usage:  { driver:'' },
  fuel:   { driver:'' },
  routes: { project:'' },
  drivers: { q:'' },
  vehicles: { q:'' },
  customers: { q:'' },
};
// Trước đây mỗi trang Chuyến đi/Khấu trừ có 1 dropdown riêng "Chỉ kỳ đang
// xem"/"Tất cả các kỳ" (filters.trips.scope/filters.deduct.scope) — giờ gộp
// chung thành 1 công tắc DUY NHẤT ngay trong ô "Kỳ lương đang xem" ở thanh
// bên (xem #side-period-all trong index.html), áp dụng chung cho cả 2 trang.
// CHỈ ảnh hưởng Chuyến đi/Khấu trừ — Bảng lương/Chấm công phụ cấp/Nhiên liệu
// vẫn luôn tính theo đúng 1 kỳ cụ thể (appPeriod), không có khái niệm "tất
// cả các kỳ" vì bản chất là tổng hợp theo kỳ.
let periodScopeAll = false;
// Collection nào đọc lỗi từ nơi lưu (VD bảng "period_locks" chưa được tạo trên
// Supabase vì chưa chạy file nâng cấp SQL) — key -> thông báo lỗi.
const storageErrors = {};

/* ---------------------------- Tiện ích ---------------------------- */
function pad2(n){ return String(n).padStart(2,'0'); }
function safeNum(v){ const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function fmtMoney(n){ return Math.round(safeNum(n)).toLocaleString('vi-VN'); }
// Giữ lại đúng CHỮ SỐ trong 1 chuỗi (bỏ hết dấu chấm phân cách hàng nghìn
// vừa tự chèn, hoặc bất kỳ ký tự nào khác gõ nhầm) — dùng để tự định dạng
// lại các ô tiền kiểu "400.000" NGAY KHI ĐANG GÕ (xem bindRoutes()), vì gõ
// tiếp sau khi đã có dấu chấm thì phải bóc hết dấu chấm cũ ra trước, không
// thì parseFloat() sẽ hiểu nhầm dấu chấm là dấu thập phân (VD "400.000" bị
// đọc thành 400 thay vì 400000).
function digitsOnly(str){ return String(str||'').replace(/[^\d]/g, ''); }
// Ô nhập TIỀN dùng chung (form Lái xe, Khách hàng, Khấu trừ, Đơn giá dầu) —
// tự chèn dấu chấm hàng nghìn khi đang gõ giống Lương theo tuyến (trước
// đây mỗi form một kiểu, có nơi phải gõ "9000000" không dấu). Giá trị thật
// đọc bằng readMoney() (bỏ dấu chấm), không dùng safeNum(el.value).
function moneyInputHtml(id, value, attrs, extraClass){
  const v = (value===null || value===undefined || value==='') ? '' : fmtMoney(value);
  return `<input type="text" inputmode="numeric" autocomplete="off" id="${id}" class="money-input${extraClass?' '+extraClass:''}" value="${esc(v)}" ${attrs||''}>`;
}
function formatMoneyInputValue(raw){
  const neg = /^\s*-/.test(raw);
  const d = digitsOnly(raw);
  return d ? (neg?'-':'') + Number(d).toLocaleString('vi-VN') : (neg?'-':'');
}
function bindMoneyInputs(root){
  (root||document).querySelectorAll('input.money-input').forEach(el=>{
    if(el._moneyBound) return;
    el._moneyBound = true;
    el.addEventListener('input', ()=>{
      const before = el.value, caretFromEnd = before.length - (el.selectionStart||0);
      const after = formatMoneyInputValue(before);
      if(after!==before){
        el.value = after;
        const pos = Math.max(0, after.length - caretFromEnd);
        try{ el.setSelectionRange(pos, pos); }catch(e){}
      }
    });
  });
}
function parseMoney(raw){
  const v = String(raw==null?'':raw).trim();
  const d = digitsOnly(v);
  if(!d) return null;
  return (v.startsWith('-') ? -1 : 1) * Number(d);
}
function readMoney(id){ const el = document.getElementById(id); return el ? parseMoney(el.value) : null; }
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
  return `${pad2(m)}/${y}`;
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
  const tier = capacityTierFor(tiers, capacity);
  if(tier===null) return -1;
  return tiers.findIndex(t => t!=='' && t!=null && Number(t)===tier);
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
// "Phụ cấp đường dài" theo NGÀY chạy NTF — cộng thêm vào Lương cố định một
// khoản tra theo bảng "Phụ cấp đường dài" của NTF (theo đúng tải trọng xe
// chạy ngày đó / 28 ngày — LONG_HAUL_STANDARD_DAYS, xem longHaulGroupTotal ở
// dưới), KHÔNG phụ thuộc lái xe có bật "Lương cứng" hay không vì đơn giá lấy
// từ cấu hình khách hàng NTF chứ không phải mức lương cứng của lái xe. Áp
// dụng ĐỒNG NHẤT cho MỌI lái xe (đã bỏ khái niệm "Khách hàng gốc của xe" —
// xác nhận với người dùng ngày 2026-10-20, chọn quy tắc chặt hơn trong 2
// phương án): chỉ ngày nào chạy TRỌN NGÀY cho NTF (100% chuyến trong ngày
// đều ghi Khách hàng = NTF, không xen lẫn khách khác — xem fullDayLongHaulDayTrips)
// mới được tính, không còn phân biệt "xe có thuộc về NTF" hay không nữa.
function calcLuongCoDinh(driverCode, trips){
  const driver = driverByCode(driverCode);
  const total = (driver && driver.hasFixedSalary) ? safeNum(driver.fixedSalaryAmount) : 0;
  const workDays = tripDaysCount(trips);
  const paidDays = Math.min(workDays, FIXED_SALARY_STANDARD_DAYS);
  const base = total ? Math.round(total * paidDays / FIXED_SALARY_STANDARD_DAYS) : 0;

  // "Phụ cấp đường dài theo ngày" — trước đây gắn cứng mã 'NTF'; giờ áp dụng
  // cho MỌI khách hàng bật ô "Tính theo ngày chạy trọn khách này" ở hồ sơ
  // khách hàng (longHaulFullDay, xem customerHasFullDayLongHaul). Cách tính
  // GIỮ NGUYÊN như cũ: mỗi ngày lái xe chạy trọn cho đúng 1 khách hàng đó.
  const ntfDays = fullDayLongHaulDayTrips(trips);
  const ntfDayResult = longHaulGroupTotal(ntfDays, t=>{
    const cust = customerByCode(t.project);
    const veh = vehicleByPlate(t.plate);
    return cust ? longHaulMonthlyAmount(cust, veh ? veh.capacity : 0) : null;
  });
  const ntfDayQty = ntfDayResult.qty, ntfDayAmount = ntfDayResult.amount;
  // Danh sách từng ngày (để hiện chi tiết ở Bảng lương, xem renderPayrollRow)
  // — số tiền/ngày ở đây chỉ mang tính THAM KHẢO (monthly/28 làm tròn riêng
  // từng dòng), số tiền THẬT lấy ở ntfDayAmount (làm tròn 1 lần trên tổng
  // theo nhóm cùng mức tháng, xem longHaulGroupTotal) — cộng dồn các dòng
  // tham khảo có thể lệch vài đồng so với ntfDayAmount do làm tròn khác chỗ.
  const ntfDayLines = ntfDays.map(t=>{
    const cust = customerByCode(t.project);
    const veh = vehicleByPlate(t.plate);
    const monthly = cust ? longHaulMonthlyAmount(cust, veh ? veh.capacity : 0) : null;
    return { date: t.date, plate: t.plate, project: t.project, capacity: veh ? veh.capacity : null,
      amount: monthly ? Math.round(monthly / LONG_HAUL_STANDARD_DAYS) : 0 };
  }).filter(l=>l.amount>0).sort((a,b)=>String(a.date).localeCompare(String(b.date)));

  // "Lương trực" — khách hàng "Theo tuyến" có cấu hình 3 ô Lương trực RIÊNG
  // (standbyUpTo5/8/15 — trước đây dùng chung 3 ô longHaulUpTo5/8/15 với
  // "Phụ cấp đường dài", đổi cách tính khách hàng là 2 khoản lẫn sang nhau;
  // xem standbyTiersFor): mỗi NGÀY lái xe có ít nhất 1 chuyến Loại "Trực"
  // ghi đúng khách hàng đó được cộng = mức tháng theo tải trọng xe chạy ngày
  // đó / 28 ngày — CỘNG THẲNG vào Lương cố định (không phải Phụ cấp), xác
  // nhận với người dùng ngày 2026-10-20. Tính riêng theo TỪNG dự án.
  let standbyAmount = 0, standbyQty = 0;
  const standbyLines = [];
  distinct(trips.filter(t=>!isOffTrip(t)).map(t=>t.project)).forEach(project=>{
    const cust = customerByCode(project);
    if(!cust || cust.calcMethod!=='route' || !customerHasStandbyConfig(cust)) return;
    const days = standbyDayTrips(trips, project);
    if(!days.length) return;
    const result = longHaulGroupTotal(days, t=>{
      const veh = vehicleByPlate(t.plate);
      return standbyMonthlyAmount(cust, veh ? veh.capacity : 0);
    });
    if(result.qty<=0) return;
    standbyQty += result.qty;
    standbyAmount += result.amount;
    days.forEach(t=>{
      const veh = vehicleByPlate(t.plate);
      const monthly = standbyMonthlyAmount(cust, veh ? veh.capacity : 0);
      const amount = monthly ? Math.round(monthly / LONG_HAUL_STANDARD_DAYS) : 0;
      if(amount>0) standbyLines.push({ date: t.date, plate: t.plate, capacity: veh ? veh.capacity : null, project, amount });
    });
  });
  standbyLines.sort((a,b)=>String(a.date).localeCompare(String(b.date)));

  if(!total && !ntfDayAmount && !standbyAmount){
    return { actual:0, total:0, base:0, workDays:0, standardDays:FIXED_SALARY_STANDARD_DAYS,
      ntfDayQty:0, ntfDayAmount:0, ntfDayLines:[], standbyQty:0, standbyAmount:0, standbyLines:[] };
  }
  return { actual: base + ntfDayAmount + standbyAmount, total, base, workDays, standardDays:FIXED_SALARY_STANDARD_DAYS,
    ntfDayQty, ntfDayAmount, ntfDayLines, standbyQty, standbyAmount, standbyLines };
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
  const cap = cust.surgeOuterKmCap!=null && cust.surgeOuterKmCap!=='' ? safeNum(cust.surgeOuterKmCap) : 200;
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
    // "Lương theo tuyến" (VD NTF có 1 tuyến cố định) — chuyến nào ghi
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
  return tieredMonthlyAmount(longHaulTiersFor(cust), capacity);
}
function tieredMonthlyAmount(tiers, capacity){
  if(!tiers.length) return null;
  const cap = safeNum(capacity);
  const tier = tiers.find(t => cap <= t.upToCapacity);
  return safeNum(tier ? tier.amount : tiers[tiers.length-1].amount);
}
// "Lương trực" — 3 ô RIÊNG (standbyUpTo5/8/15) của khách hàng "Theo tuyến",
// tách khỏi 3 ô "Phụ cấp đường dài" (longHaulUpTo5/8/15) của khách "Theo
// km" để đổi cách tính khách hàng không làm 2 khoản lẫn sang nhau. Dữ liệu
// cũ (trước khi tách — Lương trực còn nằm ở longHaulUpTo*) vẫn đọc được: khách
// "Theo tuyến" chưa có ô Lương trực riêng nào thì dùng tạm 3 ô cũ.
function standbyTiersFor(cust){
  if(!cust) return [];
  const own = [
    { upToCapacity:5,  amount: cust.standbyUpTo5 },
    { upToCapacity:8,  amount: cust.standbyUpTo8 },
    { upToCapacity:15, amount: cust.standbyUpTo15 },
  ];
  const hasOwnField = own.some(t => t.amount !== undefined && t.amount !== null && t.amount !== '');
  if(hasOwnField || cust.calcMethod !== 'route') return own.filter(t => t.amount!=null && t.amount!=='');
  return longHaulTiersFor(cust);
}
function customerHasStandbyConfig(cust){ return standbyTiersFor(cust).length>0; }
function standbyMonthlyAmount(cust, capacity){ return tieredMonthlyAmount(standbyTiersFor(cust), capacity); }
// Khách hàng có bật "Phụ cấp đường dài theo ngày chạy trọn khách này" — dữ
// liệu cũ chưa có ô này (undefined/null) thì giữ đúng như trước: chỉ NTF.
function customerHasFullDayLongHaul(cust){
  if(!cust) return false;
  if(cust.longHaulFullDay===true) return true;
  if(cust.longHaulFullDay===false) return false;
  return cust.code==='NTF';
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
// Ngày lái xe chạy TRỌN NGÀY riêng cho NTF (mọi chuyến THẬT trong ngày đó
// đều ghi Khách hàng = NTF, không xen lẫn khách khác) — áp dụng ĐỒNG NHẤT
// cho mọi lái xe (xem calcLuongCoDinh/calcPhuCap): mỗi ngày như vậy được
// cộng "Phụ cấp đường dài" tra theo đúng tải trọng xe chạy ngày đó / 28
// ngày. LOẠI TRỪ chuyến Loại "Nghỉ" trước khi xét — nếu không, 1 ngày chỉ
// có đúng 1 dòng "Nghỉ" ghi Khách hàng NTF (xe không hoạt động) vẫn bị tính
// nhầm là "ngày trọn vẹn cho NTF" vì không còn dòng nào khác để so sánh
// (every() trên mảng chỉ có 1 phần tử luôn đúng) — xe nghỉ thì không được
// tính bất cứ khoản gì, kể cả khoản này. Trả về 1 chuyến đại diện mỗi ngày
// (để tra xe/tải trọng).
function fullDayLongHaulDayTrips(trips){
  const byDate = {};
  trips.filter(t=>!isOffTrip(t)).forEach(t=>{ (byDate[t.date] = byDate[t.date] || []).push(t); });
  return Object.keys(byDate).filter(d=>{
    const first = byDate[d][0].project;
    return customerHasFullDayLongHaul(customerByCode(first)) && byDate[d].every(t=>t.project===first);
  }).map(d => byDate[d][0]);
}
// Ngày lái xe có ÍT NHẤT 1 chuyến Loại "Trực" ghi đúng khách hàng "project"
// đó — dùng cho "Lương trực" (xem calcPhuCap), khác NTF ở chỗ không cần
// TRỌN NGÀY, chỉ cần có 1 chuyến Trực đúng khách hàng là tính ngày đó. Trả
// về 1 chuyến đại diện mỗi ngày (để tra xe/tải trọng).
function standbyDayTrips(trips, project){
  const byDate = {};
  trips.filter(t=>t.project===project && tripTypeOf(t)==='standby').forEach(t=>{ (byDate[t.date] = byDate[t.date] || []).push(t); });
  return Object.keys(byDate).map(d=>byDate[d][0]);
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

// Dự án "chính" của lái xe trong kỳ — CHỈ dùng làm phương án dự phòng cho 2
// loại phụ cấp nhập TAY (perOccurrence/perOccurrenceByProject, xem "Chấm
// công phụ cấp") vì màn hình đó chỉ cho nhập ĐÚNG 1 số lượng/kỳ, không tách
// được theo từng dự án đã chạy như các loại tự động khác bên dưới (xem
// calcPhuCap) — lấy khách hàng có nhiều NGÀY công nhất trong kỳ. Mọi chỗ
// khác đều tính thẳng theo dự án của TỪNG chuyến thực tế, không qua hàm này
// (đã bỏ khái niệm "Khách hàng gốc của xe" — xác nhận với người dùng ngày
// 2026-10-20: "lái xe chạy dự án nào thì tính dự án đó", không còn gán 1 dự
// án cố định cho cả lái xe/xe nữa).
function driverMainProject(trips){
  const days = {};
  trips.filter(t=>!isOffTrip(t)).forEach(t=>{ (days[t.project] = days[t.project] || new Set()).add(t.date); });
  let best = '', bestN = 0;
  Object.keys(days).forEach(p=>{ const n = days[p].size; if(n>bestN){ best = p; bestN = n; } });
  return best;
}
// Dự án để tra đơn giá cho phụ cấp NHẬP TAY (Tăng ca, Ca đêm…) — lái xe
// không có chuyến nào trong kỳ (VD cả kỳ chỉ đi tăng ca/ca đêm) trước đây bị
// ẩn khỏi Chấm công phụ cấp, nhập không được; giờ lấy khách hàng của chuyến
// GẦN NHẤT của lái xe đó (trước hoặc trong kỳ) để vẫn tra được đơn giá.
function driverManualProject(driverCode, trips, period){
  const main = driverMainProject(trips);
  if(main) return main;
  const lastDay = period ? period+'-31' : '9999-12-31';
  const past = state.trips.filter(t=>t.driverCode===driverCode && !isOffTrip(t) && t.status!==TRIP_CANCELLED && String(t.date)<=lastDay)
    .sort(byDateDesc);
  return past.length ? past[0].project : '';
}
function driverVehicleCapacity(driverCode){
  return (vehicleOfDriver(driverCode) || {}).capacity;
}

// (4) Phụ cấp — đơn giá nằm ở LOẠI phụ cấp, cấu hình riêng theo TỪNG DỰ ÁN
//     (mục Cấu hình › Phụ cấp) — dự án nào chưa có đơn giá thì không áp dụng.
//     Tính THEO ĐÚNG DỰ ÁN lái xe thực chạy trong kỳ (lấy từ Chuyến đi, xem
//     driverMainProject() ở trên) — 1 lái xe chạy nhiều dự án trong cùng 1
//     kỳ (VD 20 ngày GHN + 5 ngày Tăng cường cho BEST) thì mỗi đơn vị tự
//     tính TÁCH RIÊNG theo đúng dự án + đơn giá của dự án đó rồi cộng lại,
//     không còn gộp về 1 dự án duy nhất cho cả kỳ nữa. Số lượng theo từng
//     đơn vị: "Cố định theo kỳ"/"đủ ngày công tối thiểu"/"theo tải trọng xe"
//     -> áp dụng 1 lần cho MỖI dự án có cấu hình đơn giá mà lái xe có chạy
//     trong kỳ | "Theo chuyến"/"Theo ngày công"/"tỷ lệ ngày công" -> tính
//     riêng số chuyến/ngày của TỪNG dự án | "Theo lần phát sinh"/"giờ mỗi
//     kỳ" -> nhập tay ở Chấm công phụ cấp, CHỈ nhập được 1 số/kỳ nên quy về
//     dự án chính (driverMainProject) | "theo km" -> tra theo tải trọng/km
//     thực tế của từng chuyến, vốn đã không qua dự án cố định từ trước.
function calcPhuCap(driver, trips, period){
  const capacity = driverVehicleCapacity(driver.code);
  const mainProject = driverManualProject(driver.code, trips, period);
  const projectsRun = distinct(trips.filter(t=>!isOffTrip(t)).map(t=>t.project));
  const lines = [];
  const issues = []; // lý do thiếu đơn giá phụ cấp — hiện thành cảnh báo ở dòng lương
  let total = 0;

  // Phụ cấp thâm niên — đặt thẳng trên hồ sơ Lái xe (giống Lương cứng),
  // không qua hệ Loại phụ cấp/tick gán ở Cấu hình › Phụ cấp. Luôn nhận trọn
  // mức đã đặt mỗi kỳ, không phụ thuộc ngày công/số chuyến.
  const seniority = safeNum(driver.seniorityAllowance);
  if(seniority>0){
    lines.push({ name:'Phụ cấp thâm niên', target: driver.code, unit:'perPeriod', qty:1, rate:seniority, amount:seniority });
    total += seniority;
  }

  state.allowanceTypes.forEach(at=>{
    if(at.unit==='perPeriod'){
      projectsRun.forEach(project=>{
        const rate = allowanceRateFor(at, project);
        if(rate===null) return;
        lines.push({ name: `${at.name} (${project})`, target: driver.code, unit:at.unit, qty:1, rate, amount:rate });
        total += rate;
      });
    } else if(at.unit==='perTrip'){
      projectsRun.forEach(project=>{
        const rate = allowanceRateFor(at, project);
        if(rate===null) return;
        const qty = trips.filter(t=>!isOffTrip(t) && t.project===project).length;
        if(qty<=0) return;
        const amount = rate * qty;
        lines.push({ name: `${at.name} (${project})`, target: driver.code, unit:at.unit, qty, rate, amount });
        total += amount;
      });
    } else if(at.unit==='perDay'){
      projectsRun.forEach(project=>{
        const rate = allowanceRateFor(at, project);
        if(rate===null) return;
        const days = tripDaysCount(trips.filter(t=>t.project===project));
        if(days<=0) return;
        const amount = rate * days;
        lines.push({ name: `${at.name} (${project})`, target: driver.code, unit:at.unit, qty:days, rate, amount });
        total += amount;
      });
    } else if(at.unit==='perOccurrence'){
      const rate = allowanceRateFor(at, mainProject);
      if(rate===null) return;
      const usage = state.allowanceUsage.find(u=>u.targetType==='driver' && u.targetId===driver.code
        && u.allowanceTypeId===at.id && u.period===period);
      const qty = usage ? safeNum(usage.quantity) : 0;
      if(qty<=0) return;
      const amount = rate * qty;
      lines.push({ name: at.name, target: driver.code, unit:at.unit, qty, rate, amount });
      total += amount;
    } else if(at.unit==='perPeriodMinDays'){
      projectsRun.forEach(project=>{
        const rate = allowanceRateFor(at, project);
        if(rate===null) return;
        const days = tripDaysCount(trips.filter(t=>t.project===project));
        const minDays = safeNum(at.minDays) || 15;
        if(days > minDays){
          lines.push({ name: `${at.name} (${project})`, target: driver.code, unit:at.unit, qty:1, rate, amount:rate });
          total += rate;
        }
      });
    } else if(at.unit==='perProratedMonth'){
      projectsRun.forEach(project=>{
        const rate = allowanceRateFor(at, project);
        if(rate===null) return;
        const standardDays = safeNum(at.standardDays) || 26;
        const days = tripDaysCount(trips.filter(t=>t.project===project));
        const paidDays = Math.min(days, standardDays);
        const amount = Math.round(rate * paidDays / standardDays);
        if(amount>0){
          lines.push({ name:`${at.name} (${project})`, target: driver.code, unit:at.unit,
            qty: days, rate: Math.round(rate/standardDays), amount });
          total += amount;
        }
      });
    } else if(at.unit==='perPeriodByCapacity'){
      projectsRun.forEach(project=>{
        const rate = allowanceRateFor(at, project, capacity);
        if(rate===null){
          // Dự án CÓ đơn giá loại này nhưng xe không khớp mốc nào (chưa nhập
          // tải trọng, hoặc nặng hơn mốc cao nhất) — báo thay vì im lặng bỏ qua.
          const entry = at.rates ? at.rates[project] : null;
          if(entry && Object.keys(entry).some(k=>safeNum(entry[k]))){
            issues.push(`${at.name} (${project}): xe ${capacity==null||capacity===''?'chưa có tải trọng':capacity+' tấn'} không khớp mốc tải trọng nào đã cấu hình`);
          }
          return;
        }
        lines.push({ name: `${at.name} (${project})`, target: driver.code, unit:at.unit, qty:1, rate, amount:rate });
        total += rate;
      });
    } else if(at.unit==='perTripByKmCapacity'){
      // Không dùng dự án cố định — tính riêng cho TỪNG CHUYẾN vì mỗi chuyến
      // có thể đi số km khác nhau (dù cùng 1 dự án).
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
      // Nhập tay số giờ/lần phát sinh mỗi kỳ ở "Chấm công phụ cấp" — vì
      // không có dữ liệu chuyến để tự đếm, và chỉ nhập được 1 số/kỳ nên quy
      // về dự án chính (driverMainProject) như perOccurrence ở trên.
      const rate = allowanceRateFor(at, mainProject);
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
  // ngưỡng km của khách hàng "Theo km" (xem isLongHaulSurgeTrip ở trên). Loại
  // trừ các NGÀY đã được cộng khoản này theo NGÀY ở Lương cố định rồi (xem
  // calcLuongCoDinh — áp dụng đồng nhất cho mọi lái xe: ngày chạy TRỌN NGÀY
  // riêng cho 1 khách bật "theo ngày", xem fullDayLongHaulDayTrips) để không cộng trùng 2 lần cho cùng 1
  // ngày. Làm tròn 1 lần trên tổng (xem longHaulGroupTotal) để đủ 28
  // chuyến/tháng ra đúng tròn mức tháng.
  const ntfOnlyDates = new Set(fullDayLongHaulDayTrips(trips).map(t=>t.date));
  const longHaulTrips = trips.filter(t=>!ntfOnlyDates.has(t.date) && isLongHaulSurgeTrip(t));
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

  return { total, lines, issues };
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
  (phuCap.issues||[]).forEach(msg=>warnings.push(msg));
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
    // Xe THỰC CHẠY trong kỳ (theo chuyến) — cột "Biển kiểm soát" ở Bảng lương
    // hiện các xe này thay vì xe đang gán hiện tại (có thể đã đổi sau kỳ).
    plates: distinct(trips.filter(t=>!isOffTrip(t)).map(t=>t.plate)),
    deductionLines, fuelLines: fuel.lines,
    warnings,
  };
}

// Bảng lương bỏ qua lái xe đã nghỉ việc mà không phát sinh gì trong kỳ,
// tránh trả lương cố định cho người đã nghỉ.
function payrollRows(period){
  // Kỳ đã chốt: luôn trả đúng bản đã lưu lúc chốt (xem CHỐT KỲ bên dưới) —
  // sửa giá tuyến/tải trọng xe/xe phụ trách/phụ cấp sau đó không làm đổi
  // bảng lương đã trả.
  const lock = periodLockOf(period);
  if(lock && Array.isArray(lock.rows)) return lock.rows;
  return payrollRowsLive(period);
}
function payrollRowsLive(period){
  return state.drivers
    .map(d=>calcPayrollForDriver(d, period))
    .filter(r => r.driver.status !== STATUS_RESIGNED
      || r.trips.length || r.cancelled || r.khauTru || r.thuong || r.coDinh || r.phuCap)
    .sort((a,b)=> String(a.driver.code).localeCompare(String(b.driver.code)));
}
/* ---------------------------- CHỐT KỲ ----------------------------
   Bấm "Chốt kỳ này" ở Bảng lương: lưu nguyên bảng lương đang tính (từng lái
   xe + chi tiết chuyến/phụ cấp/khấu trừ/nhiên liệu, kèm đơn giá từng chuyến
   tại thời điểm chốt) vào collection "periodLocks". Từ đó:
   - Bảng lương/xuất file của kỳ đó luôn đọc bản đã chốt (payrollRows).
   - Không thêm/sửa/xoá được chuyến, khấu trừ, nhiên liệu, chấm công phụ cấp
     có ngày thuộc kỳ đó (guardPeriodEdit) — muốn sửa phải "Mở chốt kỳ".
   Cấu hình (giá tuyến, xe, lái xe, phụ cấp) vẫn sửa bình thường, chỉ ảnh
   hưởng các kỳ CHƯA chốt. */
function periodLockOf(period){ return (state.periodLocks||[]).find(l=>l.period===period) || null; }
function isPeriodLocked(period){ return !!periodLockOf(period); }
function lockedPeriodMsg(period){
  return `Kỳ ${periodLabelVi(period)} đã chốt lương — muốn sửa, vào Bảng lương bấm "Mở chốt kỳ" trước.`;
}
// Trả về true (và báo lỗi) nếu có ngày nào thuộc kỳ đã chốt.
function guardPeriodEdit(dates){
  const locked = distinct((dates||[]).map(d=>getPeriod(d))).filter(isPeriodLocked);
  if(locked.length){ toast(lockedPeriodMsg(locked[0]), 'danger'); return true; }
  return false;
}
function snapshotPayrollRows(period){
  return payrollRowsLive(period).map(r=>{
    const copy = JSON.parse(JSON.stringify(r));
    copy.trips = r.trips.map(t=>Object.assign(JSON.parse(JSON.stringify(t)), {
      _price: tripUnitPrice(t), _label: tripCustomerLabel(t, true),
    }));
    copy.plateLabels = (r.plates||[]).map(p=>{ const v = vehicleByPlate(p); return { plate:p, capacity: v ? v.capacity : null }; });
    return copy;
  });
}
async function lockPeriod(period){
  if(storageErrors.periodLocks){ toast(`Chưa chốt được: database chưa có bảng Chốt kỳ — chạy file "${DB_UPGRADE_FILE}" trong Supabase trước.`, 'danger'); return; }
  const warnCount = buildWarnings(period).length;
  const msg = (warnCount ? `Kỳ này còn ${warnCount} cảnh báo dữ liệu chưa xử lý.\n\n` : '')
    + `Chốt kỳ ${periodLabelVi(period)}? Sau khi chốt, bảng lương kỳ này được giữ nguyên và không thêm/sửa/xoá được chuyến, khấu trừ, nhiên liệu, chấm công của kỳ này nữa (trừ khi Mở chốt).`;
  if(!confirm(msg)) return;
  try{
    await addDoc('periodLocks', { period, lockedAt: new Date().toISOString(),
      lockedBy: (SUPABASE_ENABLED && Auth.currentEmail()) || '', rows: snapshotPayrollRows(period) });
    toast(`Đã chốt kỳ ${periodLabelVi(period)}.`);
  }catch(e){ toast('Chốt kỳ lỗi: '+((e&&e.message)||e), 'danger'); }
}
async function unlockPeriod(period){
  const lock = periodLockOf(period);
  if(!lock) return;
  if(SUPABASE_ENABLED && !Auth.isAdmin()){ toast('Chỉ tài khoản admin mới mở chốt kỳ được.', 'danger'); return; }
  if(!confirm(`Mở chốt kỳ ${periodLabelVi(period)}? Bảng lương kỳ này sẽ tính lại theo dữ liệu và cấu hình HIỆN TẠI (có thể khác số đã trả).`)) return;
  try{ await deleteDoc('periodLocks', lock.id); toast(`Đã mở chốt kỳ ${periodLabelVi(period)}.`); }
  catch(e){ toast('Mở chốt lỗi: '+((e&&e.message)||e), 'danger'); }
}
function fmtDateTime(iso){
  const d = new Date(iso);
  if(isNaN(d)) return iso||'';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())} ${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
}

function filteredPayrollRows(period){
  const f = filters.payroll, q = f.q.trim().toLowerCase();
  return payrollRows(period)
    .filter(r=> !f.driver || r.driver.code===f.driver)
    .filter(r=> !f.project || r.projects.includes(f.project))
    .filter(r=> !q || String(r.driver.code).toLowerCase().includes(q)
      || String(r.driver.name||'').toLowerCase().includes(q));
}

/* =========================================================================
   KIỂM TRA DỮ LIỆU — hiện ở đầu trang Bảng lương
   ========================================================================= */
// Bấm vào 1 dòng cảnh báo ở Bảng lương (xem renderPayroll()/bindPayroll())
// gọi đúng 1 trong các hàm "goto..." này — luôn tự bỏ hết bộ lọc/kỳ đang
// chặn tầm nhìn (periodScopeAll=true, xoá driver/project/q đang lọc dở, hoặc
// đổi hẳn sang đúng kỳ lương có dữ liệu lỗi) rồi mới setSection() + mở sẵn đúng
// khung Sửa của bản ghi gây lỗi (tra lại bằng id NGAY TẠI THỜI ĐIỂM BẤM,
// không giữ tham chiếu object cũ — dữ liệu có thể đã đổi do người khác sửa
// hoặc do poll nền tải lại từ lúc cảnh báo được tính tới lúc bấm).
function gotoTrip(tripId){
  periodScopeAll = true;
  Object.assign(filters.trips, { driver:'', project:'', q:'' });
  setSection('trips');
  const t = state.trips.find(x=>x.id===tripId);
  if(t) openTripModal(t, null);
}
// Cảnh báo liên quan TỪ 2 CHUYẾN trở lên (trùng mã chuyến, cùng 1 ngày vừa
// Trực/Nghỉ vừa chạy chuyến…) — mở Lịch lái xe chỉ hiện đúng các chuyến đó
// (bỏ qua kỳ/bộ lọc đang chọn) để xem cạnh nhau và so sánh, thay vì mở thẳng
// khung sửa của 1 chuyến. Thanh "Đang lọc theo cảnh báo" có nút Bỏ lọc.
function gotoTripGroup(ids, label){
  Object.assign(filters.trips, { driver:'', project:'', q:'' });
  filters.trips.focus = { ids: [...ids], label };
  selectedTripIds.clear();
  setSection('trips');
}
function gotoTripSearch(code){
  const ids = state.trips.filter(t=>t.tripCode===code).map(t=>t.id);
  gotoTripGroup(ids, `Mã chuyến "${code}" bị trùng ở ${ids.length} chuyến`);
}
function gotoDriver(code){
  filters.drivers.q = '';
  setSection('cfg-drivers');
  const d = driverByCode(code);
  if(d) openDriverModal(d);
}
function gotoVehicle(plate){
  filters.vehicles.q = '';
  setSection('cfg-vehicles');
  const v = vehicleByPlate(plate);
  if(v) openVehicleModal(v);
}
function gotoDeduction(id){
  periodScopeAll = true;
  filters.deduct.driver = '';
  setSection('deductions');
  const d = state.deductions.find(x=>x.id===id);
  if(d) openDeductionModal(d);
}
function gotoFuel(period){
  appPeriod = period; // trang Nhiên liệu không có scope="Tất cả các kỳ" riêng — phải nhảy đúng kỳ mới thấy dòng lỗi
  setSection('fuel');
}
function gotoRoutes(project){
  filters.routes.project = project;
  setSection('cfg-routes');
}
function gotoAllowanceConfig(){ setSection('cfg-allowance'); }

// period: chỉ xét chuyến/khấu trừ/nhiên liệu của ĐÚNG kỳ đó (Bảng lương đang
// xem) — trước đây gộp mọi kỳ nên cảnh báo của kỳ cũ đã trả lương vẫn hiện
// mãi. Cảnh báo cấu hình (lái xe, xe, tuyến) không theo kỳ, luôn hiện.
function buildWarnings(period){
  const w = [];
  const codeSeen = new Map();
  const inPeriod = d => !period || getPeriod(d)===period;
  const periodTrips = state.trips.filter(t=>inPeriod(t.date));
  periodTrips.forEach(t=>{
    const ref = `Chuyến ${t.tripCode||t.id} ngày ${fmtDate(t.date)}`;
    const go = ()=>gotoTrip(t.id);
    if(!driverByCode(t.driverCode)) w.push({text:`${ref}: mã lái xe "${t.driverCode}" không có trong danh sách lái xe.`, go});
    if(!vehicleByPlate(t.plate)) w.push({text:`${ref}: biển số "${t.plate}" không có trong danh sách xe.`, go});
    if(!customerByCode(t.project)) w.push({text:`${ref}: mã khách hàng "${t.project}" chưa có trong mục Khách hàng.`, go});
    const method = customerCalcMethod(t.project);
    const zeroRevenue = isZeroRevenueTrip(t); // Trả hàng/Trực luôn 0đ, không cần đủ Tuyến đường/km
    if(!zeroRevenue && (method==='route' || method==='tripPlusExtras') && !findRoute(t.project, t.route)){
      w.push({text:`${ref}: chưa có đơn giá cho "${t.project} — ${t.route}".`, go});
    }
    // Khách "Theo km" có thể có 1 vài tuyến chạy giá cố định ở "Lương theo
    // tuyến" (xem tripBasePrice) — chuyến nào đã khớp đúng tuyến đó thì tính
    // theo đơn giá tuyến, không cần Số km/Khu vực nữa nên bỏ qua các cảnh
    // báo dưới đây.
    const matchedKmRoute = (method==='km' && t.route) ? findRoute(t.project, t.route) : null;
    if(!zeroRevenue && method==='km' && !isSurgeTrip(t) && !matchedKmRoute){
      if(t.km===null || t.km===undefined || t.km===''){
        w.push({text:`${ref}: khách hàng tính theo km nhưng chuyến chưa nhập số km.`, go});
      }else{
        const veh = vehicleByPlate(t.plate);
        const cust = customerByCode(t.project);
        if(cust && (cust.kmRegions||[]).length>1 && !kmRegionFor(cust, t.surgeZone)){
          w.push({text:`${ref}: khách hàng có nhiều khu vực giá km nhưng chuyến chưa chọn đúng khu vực.`, go});
        }else if(veh && cust && kmBracketRateFor(cust, t.surgeZone, safeNum(t.km), veh.capacity)===null){
          w.push({text:`${ref}: chưa có đơn giá bậc thang km cho ${fmtMoney(t.km)}km / tải trọng ${veh.capacity} tấn — vào Cấu hình › Khách hàng › Sửa "${t.project}" để thêm.`, go});
        }
      }
    }
    if(method==='km' && isSurgeTrip(t)){
      const cust = customerByCode(t.project);
      if(cust && tripSurgeKmPrice(cust, t)===null){
        w.push({text:`${ref}: chưa cấu hình đủ đơn giá tăng cường (Nội thành/Ngoại tỉnh), chưa nhập số km, hoặc vượt ngưỡng km mà chưa có đơn giá bậc thang km cho đúng khoảng km/tải trọng xe này — vào Cấu hình › Khách hàng › Sửa "${t.project}" để thêm.`, go});
      }
    }
    if(t.tripCode) codeSeen.set(t.tripCode, (codeSeen.get(t.tripCode)||0)+1);
  });
  codeSeen.forEach((n,code)=>{ if(n>1) w.push({text:`Mã chuyến "${code}" bị trùng ở ${n} chuyến.`, go:()=>gotoTripSearch(code)}); });
  // Ngày mâu thuẫn của cùng 1 lái xe: vừa Nghỉ vừa có chuyến, hoặc vừa Trực
  // vừa chạy Chuyến/Tăng cường — thường là nhập nhầm loại chuyến.
  const byDriverDay = new Map();
  periodTrips.filter(t=>t.status!==TRIP_CANCELLED).forEach(t=>{
    const k = t.driverCode+'|'+t.date;
    if(!byDriverDay.has(k)) byDriverDay.set(k, []);
    byDriverDay.get(k).push(t);
  });
  byDriverDay.forEach(list=>{
    const types = list.map(tripTypeOf);
    const t0 = list[0];
    const who = `Lái xe ${t0.driverCode} ngày ${fmtDate(t0.date)}`;
    if(types.includes('off') && types.some(x=>x!=='off')){
      w.push({text:`${who}: vừa ghi Nghỉ vừa có chuyến khác trong ngày — kiểm tra lại loại chuyến.`, go:()=>gotoTripGroup(list.map(t=>t.id), `${who}: vừa Nghỉ vừa có chuyến`)});
    }
    if(types.includes('standby') && types.some(x=>x==='normal' || x==='surge')){
      w.push({text:`${who}: vừa ghi Trực vừa chạy chuyến — kiểm tra lại loại chuyến.`, go:()=>gotoTripGroup(list.map(t=>t.id), `${who}: vừa Trực vừa chạy chuyến`)});
    }
  });
  // Xe chạy trong kỳ nhưng chưa nhập tải trọng — giá km, rớt điểm, Lương
  // trực, phụ cấp theo tải trọng đều cần tải trọng xe.
  distinct(periodTrips.map(t=>t.plate)).forEach(plate=>{
    const v = vehicleByPlate(plate);
    if(v && (v.capacity==null || v.capacity==='')) w.push({text:`Xe ${plate}: chưa nhập tải trọng (tấn) — cần cho giá km, rớt điểm, Lương trực và phụ cấp theo tải trọng.`, go:()=>gotoVehicle(plate)});
  });
  state.drivers.forEach(d=>{
    if(d.plate && !vehicleByPlate(d.plate)) w.push({text:`Lái xe ${d.code}: biển số phụ trách "${d.plate}" không tồn tại.`, go:()=>gotoDriver(d.code)});
  });
  state.vehicles.forEach(v=>{
    if(v.fuelManagement===FUEL_MANAGED && !safeNum(v.fuelNorm)) w.push({text:`Xe ${v.plate}: khoán dầu nhưng chưa nhập định mức tiêu hao.`, go:()=>gotoVehicle(v.plate)});
  });
  state.allowanceConfigs.forEach(c=>{
    if(!driverByCode(c.targetId)) w.push({text:`Gán phụ cấp: mã lái xe "${c.targetId}" không tồn tại.`, go:gotoAllowanceConfig});
  });
  state.deductions.filter(d=>inPeriod(d.date)).forEach(d=>{
    if(!driverByCode(d.driverCode)) w.push({text:`Khấu trừ ngày ${fmtDate(d.date)}: mã lái xe "${d.driverCode}" không tồn tại.`, go:()=>gotoDeduction(d.id)});
  });
  state.fuelLogs.filter(f=>!period || f.period===period).forEach(f=>{
    if(!vehicleByPlate(f.plate)) w.push({text:`Chấm nhiên liệu kỳ ${f.period}: biển số "${f.plate}" không tồn tại.`, go:()=>gotoFuel(f.period)});
  });
  const pairs = new Map();
  state.routes.forEach(r=>{
    const k = r.project+'|'+r.route;
    const cur = pairs.get(k);
    pairs.set(k, { project:r.project, route:r.route, n:(cur?cur.n:0)+1 });
  });
  pairs.forEach(({project, route, n})=>{
    if(n>1) w.push({text:`Trùng cấu hình đơn giá cho "${project} — ${route}" (${n} dòng).`, go:()=>gotoRoutes(project)});
  });
  return w;
}

/* =========================================================================
   LƯU TRỮ — tự chọn giữa dữ liệu dùng chung (claude.ai) và localStorage
   ========================================================================= */
const COLLECTIONS = {
  drivers:'drivers', vehicles:'vehicles', routes:'routes', customers:'customers', allowanceTypes:'allowanceTypes',
  allowanceConfigs:'allowanceConfigs', allowanceUsage:'allowanceUsage', trips:'trips',
  deductions:'deductions', fuelLogs:'fuelLogs', fuelPrices:'fuelPrices', periodLocks:'periodLocks',
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
    '29H-111.11':{plate:'29H-111.11',capacity:5,vehicleType:'Xe tải thùng',ownership:'Xe công ty',fuelManagement:FUEL_MANAGED,fuelNorm:22,status:'Đang hoạt động'},
    '51C-222.22':{plate:'51C-222.22',capacity:5,vehicleType:'Xe tải thùng',ownership:'Xe công ty',fuelManagement:FUEL_UNMANAGED,status:'Đang hoạt động'},
    '51D-333.33':{plate:'51D-333.33',capacity:10,vehicleType:'Xe tải thùng',ownership:'Xe thuê ngoài',fuelManagement:FUEL_MANAGED,fuelNorm:28,status:'Đang hoạt động'},
    '30F-444.44':{plate:'30F-444.44',capacity:8,vehicleType:'Xe tải thùng',ownership:'Xe công ty',fuelManagement:FUEL_UNMANAGED,status:'Đang hoạt động'},
    '29C-555.55':{plate:'29C-555.55',capacity:5,vehicleType:'Xe tải thùng',ownership:'Xe công ty',fuelManagement:FUEL_UNMANAGED,status:'Đang hoạt động'},
    '30G-666.66':{plate:'30G-666.66',capacity:8,vehicleType:'Xe tải thùng',ownership:'Xe công ty',fuelManagement:FUEL_UNMANAGED,status:'Đang hoạt động'},
    '51H-777.77':{plate:'51H-777.77',capacity:5,vehicleType:'Xe tải thùng',ownership:'Xe công ty',fuelManagement:FUEL_UNMANAGED,status:'Đang hoạt động'},
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
  // phụ cấp giờ áp dụng thẳng theo dự án lái xe thực chạy trong kỳ, không
  // còn cần gán tay.
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
   RLS ở phía database — xem supabase_setup.sql/auth_migration.sql). Mọi
   request kèm theo access token của phiên đăng nhập (Auth module bên dưới)
   để RLS biết auth.uid() là ai — không đăng nhập thì bị chặn hết.
   ========================================================================= */
const SUPABASE_URL = 'https://vacyyyqgnqwuastjimlz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhY3l5eXFnbnF3dWFzdGppbWx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNTEwNDQsImV4cCI6MjEwNDgyNzA0NH0.-HkI4Y8PS_oYbKdZ9ygNTRuXZNgLlIUkpBlDZbzr2ME';
// Đặt cả hằng trên thành '' để tắt hẳn, quay lại chạy offline (localStorage).
const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
// File SQL nâng cấp database đang chạy thật cho bản app.js này (thêm cột
// Lương trực riêng, ô "Phụ cấp đường dài theo ngày", bảng Chốt kỳ).
const DB_UPGRADE_FILE = 'nang_cap_2026-10_chot_ky.sql';

/* =========================================================================
   ĐĂNG NHẬP (Supabase Auth) — CHỈ áp dụng khi SUPABASE_ENABLED. Mỗi người
   dùng có 1 tài khoản email/mật khẩu riêng (admin tạo qua Supabase
   Dashboard → Authentication → Add user, xem README mục "Đăng nhập & phân
   quyền người dùng"). Phiên đăng nhập lưu ở localStorage, tự làm mới trước
   khi hết hạn — hết hạn hẳn (refresh cũng lỗi) thì quay lại màn hình đăng
   nhập (tải lại trang cho gọn, không cố gắng "vá" trạng thái đang chạy dở).
   ========================================================================= */
const AUTH_SESSION_KEY = 'vittrans_auth_session';
const Auth = (()=>{
  let session = null; // { access_token, refresh_token, expires_at(giây), user:{id,email} }
  let profile = null; // dòng "profiles" tương ứng (role, is_active)
  let refreshTimer = null;

  function load(){
    try{ session = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)) || null; }catch(e){ session = null; }
  }
  function save(s){
    session = s;
    try{ localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(s)); }catch(e){}
  }
  function clear(){
    session = null; profile = null;
    try{ localStorage.removeItem(AUTH_SESSION_KEY); }catch(e){}
    if(refreshTimer){ clearTimeout(refreshTimer); refreshTimer = null; }
  }
  function accessToken(){ return session ? session.access_token : null; }
  function isLoggedIn(){ return !!session; }
  function isAdmin(){ return !!(profile && profile.role === 'admin' && profile.is_active); }
  function currentEmail(){ return session ? session.user.email : ''; }
  function currentUserId(){ return session ? session.user.id : null; }

  async function authFetch(path, body){
    const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      method:'POST', headers:{ apikey:SUPABASE_ANON_KEY, 'Content-Type':'application/json' }, body: JSON.stringify(body||{}),
    });
    const json = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(json.error_description || json.msg || json.error || 'Đăng nhập lỗi.');
    return json;
  }
  function fromAuthJson(json){
    return { access_token:json.access_token, refresh_token:json.refresh_token,
      expires_at: Math.floor(Date.now()/1000) + json.expires_in, user:{ id:json.user.id, email:json.user.email } };
  }
  function scheduleRefresh(){
    if(refreshTimer){ clearTimeout(refreshTimer); refreshTimer = null; }
    if(!session) return;
    const ms = Math.max(5000, (session.expires_at*1000) - Date.now() - 60000); // làm mới trước 60s khi hết hạn
    refreshTimer = setTimeout(()=>{ refresh().catch(()=>{}); }, ms);
  }
  async function refresh(){
    if(!session || !session.refresh_token) throw new Error('Không có phiên để làm mới.');
    const json = await authFetch('/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    save(fromAuthJson(json));
    scheduleRefresh();
    return session.access_token;
  }
  async function signIn(email, password){
    const json = await authFetch('/token?grant_type=password', { email, password });
    save(fromAuthJson(json));
    scheduleRefresh();
    await loadProfile();
  }
  async function signOut(){
    try{ if(session) await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method:'POST', headers:{ apikey:SUPABASE_ANON_KEY, Authorization:'Bearer '+session.access_token } }); }catch(e){}
    clear();
  }
  async function loadProfile(){
    if(!session){ profile = null; return null; }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=*`, {
      headers:{ apikey:SUPABASE_ANON_KEY, Authorization:'Bearer '+session.access_token },
    });
    if(res.ok){ const rows = await res.json(); profile = rows[0] || null; }
    return profile;
  }
  // Gọi 1 request Supabase REST bất kỳ, tự thử làm mới token đúng 1 lần nếu
  // gặp 401 (token hết hạn) rồi gọi lại — tránh phải đăng nhập lại chỉ vì
  // trùng lúc token hết hạn giữa 2 lượt làm mới theo lịch (scheduleRefresh).
  // Làm mới cũng lỗi luôn (refresh token hết hạn/bị thu hồi) thì coi như
  // phiên đăng nhập không còn dùng được — tải lại trang để quay về màn hình
  // đăng nhập, không cố giữ app chạy tiếp ở trạng thái nửa vời.
  async function withAuthRetry(doFetch){
    let res = await doFetch();
    if(res.status === 401 && session){
      try{ await refresh(); res = await doFetch(); }
      catch(e){ clear(); alert('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.'); location.reload(); }
    }
    return res;
  }

  load();
  if(session) scheduleRefresh();
  return {
    isLoggedIn, isAdmin, currentEmail, currentUserId, accessToken, signIn, signOut, loadProfile, withAuthRetry,
    getProfile: ()=>profile,
  };
})();

// Tên bảng Postgres (snake_case) ứng với từng "path" collection (camelCase,
// giữ nguyên như key của COLLECTIONS) — vì schema.sql/supabase_setup.sql cố
// tình đặt tên bảng chuẩn snake_case, khác hẳn key JS.
const SUPA_TABLE = {
  drivers:'drivers', vehicles:'vehicles', routes:'routes', customers:'customers',
  allowanceTypes:'allowance_types', allowanceConfigs:'allowance_configs', allowanceUsage:'allowance_usage',
  trips:'trips', deductions:'deductions', fuelLogs:'fuel_logs', fuelPrices:'fuel_prices',
  periodLocks:'period_locks',
};
// Khoá chính THẬT của từng bảng: 'code' (khách hàng/lái xe — khoá tự nhiên
// có sẵn), 'id' SERIAL do Postgres tự sinh (xe/tuyến), hoặc 'id' TEXT do
// PHÍA CLIENT tự sinh (các bảng còn lại — Postgres không tự sinh chuỗi
// ngẫu nhiên được, phải mint bằng lsMintId() trước khi INSERT).
const SUPA_PK = {
  customers:'code', drivers:'code', vehicles:'id', routes:'id',
  allowanceTypes:'id', allowanceConfigs:'id', allowanceUsage:'id',
  trips:'id', deductions:'id', fuelLogs:'id', fuelPrices:'id', periodLocks:'id',
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
    standbyUpTo5:'standby_up_to_5', standbyUpTo8:'standby_up_to_8', standbyUpTo15:'standby_up_to_15',
    longHaulFullDay:'long_haul_full_day',
    kmRegions:'km_regions' },
  drivers: { driverType:'driver_type', hasFixedSalary:'has_fixed_salary', fixedSalaryAmount:'fixed_salary_amount',
    seniorityAllowance:'seniority_allowance' },
  vehicles: { vehicleType:'vehicle_type',
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
  periodLocks: { lockedAt:'locked_at', lockedBy:'locked_by' },
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
  // Token đăng nhập có thể đổi giữa 2 lần gọi (làm mới theo lịch hoặc do
  // withAuthRetry) — luôn đọc MỚI NHẤT tại thời điểm gọi, không chốt cứng 1
  // object header dùng lại cho mọi request như bản cũ (fallback về anon key
  // khi chưa đăng nhập chỉ để không có URL rỗng, request đó sẽ vẫn bị RLS
  // chặn nếu bảng yêu cầu auth.uid()).
  const headers = extra => ({
    apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer '+(Auth.accessToken()||SUPABASE_ANON_KEY),
    'Content-Type':'application/json', ...extra,
  });
  const sbFetch = (url, opts={}) => Auth.withAuthRetry(()=>fetch(url, { ...opts, headers: headers(opts.extraHeaders) }));
  const tableOf = key => SUPA_TABLE[key] || key;
  const pkOf = key => SUPA_PK[key] || 'id';
  async function apiFail(action, key, res){
    let body = ''; try{ body = await res.text(); }catch(e){}
    // Database chưa chạy file nâng cấp (thiếu cột/bảng mới mà app.js bản này
    // cần) — PostgREST trả PGRST204/PGRST205/42P01. Báo rõ cách khắc phục thay
    // vì nguyên văn lỗi kỹ thuật.
    if(/PGRST20[45]|42P01|42703|schema cache|does not exist/i.test(body)){
      throw new Error(`Database Supabase chưa được nâng cấp cho bản app này — chạy file "${DB_UPGRADE_FILE}" trong Supabase › SQL Editor rồi thử lại.`);
    }
    throw new Error(`Supabase lỗi khi ${action} "${key}": ${res.status} ${body}`);
  }
  // PostgREST/Supabase mặc định chỉ trả về TỐI ĐA 1000 dòng mỗi request (cấu
  // hình "Max Rows" ở Settings → API), kể cả khi không truyền limit — bảng
  // nào vượt mốc đó (VD trips sau nhiều tháng nhập liệu) sẽ bị cắt mất phần
  // dư, và vì request gốc không có order= nên Postgres trả về theo thứ tự
  // quét bất kỳ (KHÔNG chắc là dòng cũ/mới) — dòng bị cắt có thể là bất kỳ
  // dòng nào, không nhất thiết là dòng thêm sau cùng. Phải tự phân trang
  // (order= theo khoá chính cho ổn định qua các lần gọi + limit/offset) lấy
  // hết toàn bộ, không được dựa vào server tự trả đủ.
  async function fetchRows(key){
    const pk = pkOf(key);
    const pageSize = 1000;
    let offset = 0, all = [];
    while(true){
      const res = await sbFetch(
        `${BASE}/${tableOf(key)}?select=*&order=${pk}.asc&limit=${pageSize}&offset=${offset}`
      );
      if(!res.ok) await apiFail('đọc', key, res);
      const page = await res.json();
      all = all.concat(page);
      if(page.length < pageSize) break;
      offset += pageSize;
    }
    return all;
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
            // không có realtime — làm mới định kỳ 6s. Riêng bảng Chốt kỳ (mỗi
            // dòng chứa nguyên bản chụp bảng lương, khá nặng, lại hiếm khi đổi)
            // chỉ làm mới mỗi 60s; chốt/mở chốt trên máy này vẫn thấy ngay
            // nhờ refreshNow() sau mỗi lần ghi.
            if(!stopped) setTimeout(poll, key==='periodLocks' ? 60000 : 6000);
          }
          poll();
          return ()=>{ stopped = true; if(refreshers[key]===doFetch) delete refreshers[key]; };
        },
        async add(data){
          const row = toSupaRow(key, data);
          if(!SUPA_AUTO_ID[key] && pkOf(key)==='id' && row.id==null) row.id = lsMintId();
          const res = await sbFetch(`${BASE}/${tableOf(key)}`, {
            method:'POST', extraHeaders:{ Prefer:'return=representation' }, body: JSON.stringify(row),
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
          const res = await sbFetch(url, {
            method:'POST', extraHeaders:{ Prefer:prefer }, body: JSON.stringify(rows),
          });
          if(!res.ok) await apiFail('thêm hàng loạt', key, res);
          const saved = await res.json();
          await refreshNow(key);
          return saved.map(s=>({ id: String(s[pkOf(key)]) }));
        },
        // Xoá hàng loạt trong ĐÚNG 1 request DELETE (bộ lọc "id=in.(...)" —
        // PostgREST hỗ trợ sẵn) thay vì N request deleteDoc() nối tiếp như
        // trước (mỗi lượt xoá còn tự làm mới lại TOÀN BỘ bảng sau khi xoá,
        // xem refreshNow() — xoá 50 dòng kiểu cũ = 50 lượt xoá + 50 lượt tải
        // lại cả bảng, nối tiếp nhau, rất chậm). Chỉ làm mới lại 1 LẦN DUY
        // NHẤT sau khi toàn bộ đã xoá xong.
        async deleteMany(ids){
          if(!ids.length) return;
          const pk = pkOf(key);
          const list = ids.map(id=>encodeURIComponent(id)).join(',');
          const res = await sbFetch(`${BASE}/${tableOf(key)}?${pk}=in.(${list})`, { method:'DELETE' });
          if(!res.ok) await apiFail('xoá hàng loạt', key, res);
          await refreshNow(key);
        },
      };
    },
    doc(fullPath){
      const i = fullPath.lastIndexOf('/');
      const key = fullPath.slice(0,i), id = fullPath.slice(i+1);
      const table = tableOf(key), pk = pkOf(key);
      async function patch(row){
        const res = await sbFetch(`${BASE}/${table}?${pk}=eq.${encodeURIComponent(id)}`, {
          method:'PATCH', body: JSON.stringify(row),
        });
        if(!res.ok) await apiFail('cập nhật', key, res);
      }
      return {
        async set(data){ await patch(toSupaRow(key, data)); await refreshNow(key); },
        async update(data){ await patch(toSupaRow(key, data)); await refreshNow(key); },
        async delete(){
          const res = await sbFetch(`${BASE}/${table}?${pk}=eq.${encodeURIComponent(id)}`, { method:'DELETE' });
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
    'surge_outer_km_cap','long_haul_up_to_5','long_haul_up_to_8','long_haul_up_to_15',
    'standby_up_to_5','standby_up_to_8','standby_up_to_15','long_haul_full_day','km_regions'],
  drivers: ['code','name','phone','driver_type','status','has_fixed_salary','fixed_salary_amount','seniority_allowance','plate'],
  vehicles: ['plate','capacity','vehicle_type','ownership','status','fuel_management','fuel_norm'],
  routes: ['project','route_name','route','price','surcharge_price'],
  allowanceTypes: ['id','name','unit','min_days','standard_days','rates'],
  allowanceConfigs: ['id','target_type','target_id','allowance_type_id'],
  allowanceUsage: ['id','target_type','target_id','allowance_type_id','period','quantity'],
  trips: ['id','date','trip_code','driver_code','plate','project','route','origin','destination','km',
    'km_region','surge_zone','loading_count','point_count','trip_type','revenue','status'],
  deductions: ['id','date','driver_code','type','amount','reason'],
  fuelLogs: ['id','plate','period','odo_start','odo_end','stock_start','purchased','stock_end'],
  fuelPrices: ['id','period','price'],
  periodLocks: ['id','period','locked_at','locked_by','rows'],
};
const SUPA_JSONB_COLS = { customers:['km_regions'], allowanceTypes:['rates'], periodLocks:['rows'] };
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
// trách, không phải chiều ngược lại như trước).
const SUPA_INSERT_ORDER = ['customers','vehicles','drivers','routes','allowanceTypes',
  'allowanceConfigs','allowanceUsage','trips','deductions','fuelLogs','fuelPrices','periodLocks'];
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
      // nút Xoá ở "Lương theo tuyến" bấm không có phản ứng gì.
      const next = snap.docs.map(d=>({ ...d.data(), id:d.id }));
      // Chỉ vẽ lại trang khi dữ liệu THỰC SỰ đổi — poll chạy mỗi 6s cho TỪNG
      // bảng riêng (13 bảng lệch nhau) nên nếu vẽ lại vô điều kiện mỗi lần
      // poll (như bản cũ), trang bị vẽ lại dồn dập dù chẳng có gì mới, khiến
      // ô combo lọc (Lái xe/Khách hàng) đang mở gợi ý bị "giật" liên tục —
      // dù có cơ chế khôi phục trạng thái combo (xem render()), vẽ lại quá
      // dồn vẫn gây chớp/ngắt rõ rệt. So sánh JSON để biết có đổi hay không
      // — an toàn vì fetchRows() đã order= theo khoá chính (ổn định thứ tự
      // giữa 2 lần gọi), không bị báo "đổi" giả do Postgres trả về khác thứ
      // tự dù dữ liệu như cũ.
      if(JSON.stringify(next) === JSON.stringify(state[key])) return;
      state[key] = next;
      scheduleRender();
    }, err=>{
      console.error('Lỗi dữ liệu', path, err);
      // Bảng chưa có trên database (chưa chạy file nâng cấp) — ghi nhận để
      // màn hình liên quan báo rõ thay vì im lặng không có dữ liệu.
      if(!storageErrors[key]){ storageErrors[key] = (err && err.message) || String(err); scheduleRender(); }
    });
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
  const onConflict = opts && opts.onConflict;
  if(onConflict){
    // Không có API bulk upsert thật (chế độ cloud claude.ai / fallback
    // localStorage) — khớp theo state hiện có để CẬP NHẬT bản ghi trùng
    // (theo khoá tự nhiên như 'code'/'plate') thay vì luôn INSERT mới,
    // tránh tạo bản ghi trùng lặp khi Nhập Excel cập nhật dữ liệu đã có.
    return await Promise.all(dataArray.map(d=>{
      const existing = (state[key]||[]).find(x=>x[onConflict]===d[onConflict]);
      return existing ? updateDoc(key, existing.id, d) : col.add(d);
    }));
  }
  return await Promise.all(dataArray.map(d=>col.add(d)));
}
// Xoá HÀNG LOẠT trong 1 lượt (dùng cho nút "Xoá đã chọn") — cùng lý do với
// addManyDocs(): makeSupabaseDb() có deleteMany() thật (1 request); các chế
// độ lưu trữ khác không có API bulk riêng nên dùng Promise.all() chạy song
// song thay vì vòng lặp tuần tự từng id.
async function deleteManyDocs(key, ids){
  if(!ids.length) return;
  const col = colOf(key);
  if(typeof col.deleteMany === 'function') return await col.deleteMany(ids);
  await Promise.all(ids.map(id=>deleteDoc(key, id)));
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
      {id:'cfg-users', label:'Người dùng', icon:'fa-user-gear', adminOnly:true},
  ]},
  { group:null, items:[ {id:'guide', label:'Hướng dẫn sử dụng', icon:'fa-circle-question'} ] },
];

// Thu gọn thanh bên KHÔNG ẩn hết (width:0 như trước) mà chừa lại 1 dải hẹp
// vừa đúng logo công ty — mỗi mục chỉ còn icon, tên đầy đủ xem qua "title"
// (tooltip khi rê chuột), xem thêm CSS #app.sidebar-collapsed.
function renderNav(){
  document.getElementById('navroot').innerHTML = NAV.map(g=>{
    const items = g.items.filter(it=>!it.adminOnly || Auth.isAdmin());
    return items.length ? `
    <div class="navgroup${g.group?'':' plain'}">
      ${g.group?`<div class="navgroup-title">${esc(g.group)}</div>`:''}
      <div class="navlist">
        ${items.map(it=>`<button class="navitem${currentSection===it.id?' active':''}" data-nav="${it.id}" title="${esc(it.label)}">
          <i class="nav-icon fa-solid ${it.icon}" aria-hidden="true"></i><span>${esc(it.label)}</span>
        </button>`).join('')}
      </div>
    </div>` : '';
  }).join('');
}

function syncPeriodUi(){
  const input = document.getElementById('side-period');
  if(input.value !== appPeriod) input.value = appPeriod;
  input.disabled = periodScopeAll; // đang xem "Tất cả các kỳ" thì chọn tháng cụ thể không còn ý nghĩa ở Chuyến đi/Khấu trừ — mờ đi cho rõ, Bảng lương/Nhiên liệu... vẫn dùng đúng appPeriod bên dưới như cũ
  document.getElementById('side-period-display').textContent = periodLabelVi(appPeriod);
  document.getElementById('side-period-cap').textContent = periodCaption(appPeriod);
  document.getElementById('side-period-all').checked = periodScopeAll;
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
  'cfg-users':    { render: renderUsers,           bind: bindUsers },
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
  // combo (gõ-để-tìm, VD ô "Khách hàng" ở Lương theo tuyến) KHÔNG giữ
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
  // "Người dùng" chỉ dành cho admin — nếu mất quyền admin (hoặc URL cũ còn
  // lưu section này từ lúc còn admin) giữa chừng thì tự quay về Bảng lương
  // thay vì vẽ ra 1 trang trống/lỗi do renderUsers() không được phép gọi.
  if(currentSection === 'cfg-users' && !Auth.isAdmin()) currentSection = 'payroll';
  const section = SECTIONS[currentSection] || SECTIONS.payroll;
  mainEl.innerHTML = section.render();
  section.bind();
  bindMoneyInputs(mainEl);
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
function setPeriod(p){ appPeriod = p; filters.trips.focus = null; render(); }

document.getElementById('app').addEventListener('click', e=>{
  const nav = e.target.closest('[data-nav]');
  if(nav){ filters.trips.focus = null; setSection(nav.dataset.nav); }
});
// Bấm vào ô hiện kỳ lương (nút .period-display) xổ ra bảng chọn riêng
// (.period-popup — công tắc "Tất cả các kỳ" + input tháng thật mở lịch gốc
// của trình duyệt), chỉ đóng lại khi: chọn xong 1 tháng, hoặc bấm RA NGOÀI
// hẳn khung .period-picker — không tự đóng theo thời gian/polling nền (đúng
// quy tắc dùng chung cho mọi dropdown trong app, xem bindCombo()). Khung
// này nằm trong thanh bên (nav#sidebar), KHÔNG bị render() vẽ lại (render()
// chỉ thay #main) nên không cần cơ chế khôi phục trạng thái như combo lọc
// trong #main.
function openPeriodPopup(){
  document.getElementById('period-popup').hidden = false;
  document.getElementById('side-period-display').setAttribute('aria-expanded', 'true');
}
function closePeriodPopup(){
  document.getElementById('period-popup').hidden = true;
  document.getElementById('side-period-display').setAttribute('aria-expanded', 'false');
}
document.getElementById('side-period-display').onclick = ()=>{
  document.getElementById('period-popup').hidden ? openPeriodPopup() : closePeriodPopup();
};
document.addEventListener('click', e=>{
  if(!document.getElementById('period-picker').contains(e.target)) closePeriodPopup();
});
document.getElementById('side-period').addEventListener('change', e=>{
  if(e.target.value){ setPeriod(e.target.value); closePeriodPopup(); }
});
document.getElementById('side-prev').onclick = ()=> setPeriod(shiftPeriod(appPeriod,-1));
document.getElementById('side-next').onclick = ()=> setPeriod(shiftPeriod(appPeriod, 1));
document.getElementById('side-period-all').addEventListener('change', e=>{
  periodScopeAll = e.target.checked; filters.trips.focus = null; render();
});

/* Ẩn/hiện thanh bên — nhớ lựa chọn giữa các lần mở lại trên cùng máy. */
const SIDEBAR_COLLAPSED_KEY = 'vittrans_sidebar_collapsed';
function applySidebarCollapsed(collapsed){
  document.getElementById('app').classList.toggle('sidebar-collapsed', collapsed);
  document.getElementById('sidebar-toggle').textContent = collapsed ? '›' : '‹';
}
applySidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
const MOBILE_MQ = window.matchMedia('(max-width:880px)');
function syncMobileNavToggle(){
  const btn = document.getElementById('sidebar-toggle');
  const app = document.getElementById('app');
  if(MOBILE_MQ.matches) btn.textContent = app.classList.contains('mobile-nav-open') ? '✕ Đóng menu' : '☰ Menu';
  else btn.textContent = app.classList.contains('sidebar-collapsed') ? '›' : '‹';
}
if(MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener('change', syncMobileNavToggle);
syncMobileNavToggle();
// Điện thoại: chọn 1 mục menu xong thì tự đóng menu lại.
document.getElementById('navroot').addEventListener('click', e=>{
  if(MOBILE_MQ.matches && e.target.closest('[data-nav]')){ document.getElementById('app').classList.remove('mobile-nav-open'); syncMobileNavToggle(); }
});
document.getElementById('sidebar-toggle').onclick = ()=>{
  if(MOBILE_MQ.matches){
    document.getElementById('app').classList.toggle('mobile-nav-open');
    syncMobileNavToggle();
    return;
  }
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
// Bắt sự kiện ở pha CAPTURE (chạy trước onclick của chính nút): bấm bất kỳ
// nút nào trong khung sửa (Lưu, Lưu & thêm tiếp, Nhập…) thì chốt chữ đang gõ
// dở trong các ô combo trước — để nút đọc đúng giá trị người dùng vừa gõ.
document.getElementById('modalbox').addEventListener('click', e=>{
  if(e.target.closest('button')) flushCombosIn(document.getElementById('modalbox'));
}, true);
function openModal(html, opts){
  const box = document.getElementById('modalbox');
  box.innerHTML = MODAL_CLOSE_X_HTML + html;
  box.classList.toggle('modal-wide', !!(opts && opts.wide));
  document.getElementById('overlay').hidden = false;
  bindMoneyInputs(box);
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
  bindMoneyInputs(box);
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
// activeOnly: chỉ hiện lái xe còn làm / xe còn chạy (dùng ở khung NHẬP chuyến,
// khấu trừ — không cho chọn nhầm người đã nghỉ việc / xe đã ngừng chạy). Giá
// trị đang có sẵn (keep) vẫn giữ trong danh sách để sửa bản ghi cũ không bị mất.
function driverComboOptions(emptyLabel, codes, activeOnly, keep){
  let base = codes ? state.drivers.filter(d=>codes.includes(d.code)) : state.drivers;
  if(activeOnly) base = base.filter(d=>d.status!==STATUS_RESIGNED || d.code===keep);
  const opts = [...base].sort((a,b)=>String(a.code).localeCompare(String(b.code)))
    .map(d=>({v:d.code, l:d.code+' — '+d.name+(d.status===STATUS_RESIGNED?' (đã nghỉ việc)':'')}));
  return emptyLabel!=null ? [{v:'', l:emptyLabel}, ...opts] : opts;
}
const VEHICLE_STOPPED = 'Ngừng chạy';
function vehicleComboOptions(emptyLabel, activeOnly, keep){
  let base = state.vehicles;
  if(activeOnly) base = base.filter(v=>v.status!==VEHICLE_STOPPED || v.plate===keep);
  const opts = [...base].sort((a,b)=>String(a.plate).localeCompare(String(b.plate)))
    .map(v=>({v:v.plate, l:v.plate+(v.status===VEHICLE_STOPPED?' (ngừng chạy)':'')}));
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
  // Chưa chọn gì (value rỗng/null) → trả về CHUỖI RỖNG, không trả nhãn của
  // mục rỗng trong options (VD "Lái xe"/"— Chọn —", chỉ để hiện trong danh
  // sách gợi ý cho người dùng bấm xoá lọc) — nếu trả nhãn đó, nó sẽ trở
  // thành value THẬT của ô input (không phải placeholder), bấm đúp chọn
  // được/copy được y như đã gõ chữ, dù ô đang "trống". Để chuỗi rỗng thì
  // trình duyệt tự hiện placeholder (xám, không chọn/copy được) đúng như ý
  // placeholder sinh ra — đặt ngay tại comboField() mỗi chỗ gọi.
  if(value==null || value==='') return '';
  const o = options.find(x=>String(x.v)===String(value));
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
    // Mục rỗng ("— Chọn —"/"Lái xe"...) = bỏ chọn: để ô trống cho hiện
    // placeholder, không ghi nhãn của mục rỗng thành chữ thật trong ô.
    text.value = o.v==='' ? '' : o.l;
    close();
    hidden.dispatchEvent(new Event('change', {bubbles:true}));
    if(onPick) onPick(o.v);
  }
  // Chốt chữ đang gõ thành giá trị THẬT của ô — gọi khi rời ô (blur) VÀ ngay
  // trước khi bấm 1 nút trong khung sửa (xem flushCombosIn ở openModal):
  // trước đây gõ đúng "LX07" rồi bấm Lưu ngay (không Enter) thì blur chạy
  // chậm 120ms, SAU khi Lưu đã đọc giá trị cũ → lưu nhầm lái xe cũ mà vẫn báo
  // thành công. Gõ khớp đúng 1 mục → chọn mục đó; xoá trống → bỏ chọn (nếu
  // ô có mục rỗng); gõ dở/không khớp → trả lại giá trị cũ.
  function flush(){
    if(!text.isConnected) return; // khung đã đóng/vẽ lại — không làm gì nữa
    const typed = text.value.trim();
    const currentLabel = comboLabelOf(options, hidden.value);
    if(typed === currentLabel){ close(); return; }
    if(!typed){
      const empty = options.find(o=>o.v==='');
      if(empty && hidden.value!==''){ pick(empty); return; }
      close(); text.value = currentLabel; return;
    }
    const exact = options.find(o=>
      String(o.l).toLowerCase()===typed.toLowerCase() || String(o.v).toLowerCase()===typed.toLowerCase());
    if(exact){ pick(exact); return; }
    close(); text.value = currentLabel;
  }
  text._comboFlush = flush;
  function highlight(){
    list.querySelectorAll('[data-i]').forEach((el,i)=>{
      el.classList.toggle('active', i===active);
      if(i===active) el.scrollIntoView({block:'nearest'});
    });
  }
  text.onfocus = ()=>{ text.select(); openList(''); };
  text.oninput = ()=>{ active = -1; openList(text.value); };
  // Gõ ĐÚNG hẳn 1 mục rồi bấm ra ngoài/Tab sang ô khác cũng được nhận như 1
  // lượt chọn — xem flush() ở trên.
  text.onblur = ()=>setTimeout(flush, 120);
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
// Chốt mọi ô combo trong 1 vùng (VD khung sửa) — xem flush() trong bindCombo.
function flushCombosIn(root){
  if(!root) return;
  root.querySelectorAll('.combo-input').forEach(el=>{ if(typeof el._comboFlush==='function') el._comboFlush(); });
}
function driverFilterField(id, value, codes){
  return `<div class="field">${comboField(id, driverComboOptions('Lái xe', codes), value, 'Lái xe')}</div>`;
}
function rowActions(id){
  return `<button class="btn sm" data-edit="${id}">Sửa</button> <button class="btn sm danger" data-del="${id}">Xoá</button>`;
}
function bindRowActions(onEdit, onDelete){
  document.querySelectorAll('[data-edit]').forEach(b=>{ b.onclick = ()=>onEdit(b.dataset.edit); });
  document.querySelectorAll('[data-del]').forEach(b=>{ b.onclick = ()=>onDelete(b.dataset.del); });
}

/* =========================================================================
   MÀN HÌNH: NGƯỜI DÙNG (chỉ admin thấy trong nav, xem renderNav()/render())
   — quản lý QUYỀN của tài khoản đã có, KHÔNG tạo tài khoản mới trong app
   (tạo qua Supabase Dashboard → Authentication → Add user, xem README) vì
   tạo tài khoản cần service_role key — không thể làm an toàn từ trình
   duyệt. Dữ liệu KHÔNG đi qua db/state chung (không polling định kỳ như
   các collection khác) — tự tải lại mỗi khi vào trang, đủ dùng vì đây là
   màn hình ít thao tác.
   ========================================================================= */
async function fetchProfiles(){
  const res = await Auth.withAuthRetry(()=>fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.asc`, {
    headers:{ apikey:SUPABASE_ANON_KEY, Authorization:'Bearer '+(Auth.accessToken()||SUPABASE_ANON_KEY) },
  }));
  if(!res.ok) throw new Error('Không tải được danh sách người dùng.');
  return res.json();
}
async function patchProfile(id, patch){
  const res = await Auth.withAuthRetry(()=>fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
    method:'PATCH',
    headers:{ apikey:SUPABASE_ANON_KEY, Authorization:'Bearer '+(Auth.accessToken()||SUPABASE_ANON_KEY),
      'Content-Type':'application/json', Prefer:'return=minimal' },
    body: JSON.stringify(patch),
  }));
  if(!res.ok) throw new Error('Cập nhật quyền lỗi (chỉ admin mới sửa được).');
}
function renderUsers(){
  return `
    <div class="pagehead">
      <div><h1>Người dùng</h1><p>Quản lý quyền truy cập của từng tài khoản đã đăng nhập.</p></div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Email</th><th>Ngày tạo</th><th>Quyền</th><th>Trạng thái</th></tr></thead>
      <tbody id="users-tbody"><tr><td colspan="4" class="empty">Đang tải…</td></tr></tbody>
    </table></div>`;
}
function bindUsers(){
  loadUsersTable();
}
async function loadUsersTable(){
  const tbody = document.getElementById('users-tbody');
  if(!tbody) return;
  const myId = Auth.currentUserId();
  try{
    const rows = await fetchProfiles();
    const tbodyNow = document.getElementById('users-tbody');
    if(!tbodyNow) return; // đã chuyển sang màn hình khác trong lúc chờ tải
    tbodyNow.innerHTML = rows.map(u=>{
      const isSelf = u.id === myId;
      return `<tr data-user-id="${esc(u.id)}">
        <td>${esc(u.email)}${isSelf?' <span class="badge neutral">Bạn</span>':''}</td>
        <td class="muted">${u.created_at?fmtDate(u.created_at):''}</td>
        <td><select class="user-role" data-user-id="${esc(u.id)}"${isSelf?' disabled title="Không tự đổi quyền của chính mình"':''}>
          <option value="user"${u.role==='user'?' selected':''}>Nhân viên</option>
          <option value="admin"${u.role==='admin'?' selected':''}>Admin (toàn quyền)</option>
        </select></td>
        <td><label class="checkrow-inline"><input type="checkbox" class="user-active" data-user-id="${esc(u.id)}"${u.is_active?' checked':''}${isSelf?' disabled title="Không tự khoá chính mình"':''}> Đang hoạt động</label></td>
      </tr>`;
    }).join('') || `<tr><td colspan="4" class="empty">Chưa có người dùng nào — tạo tài khoản qua Supabase Dashboard rồi đăng nhập thử 1 lần.</td></tr>`;
    tbodyNow.querySelectorAll('.user-role').forEach(sel=>{
      sel.onchange = async ()=>{
        sel.disabled = true;
        try{ await patchProfile(sel.dataset.userId, { role: sel.value }); toast('Đã đổi quyền.'); }
        catch(e){ toast(String(e.message||e), 'danger'); }
        finally{ loadUsersTable(); }
      };
    });
    tbodyNow.querySelectorAll('.user-active').forEach(chk=>{
      chk.onchange = async ()=>{
        chk.disabled = true;
        try{ await patchProfile(chk.dataset.userId, { is_active: chk.checked }); toast(chk.checked?'Đã mở lại tài khoản.':'Đã khoá tài khoản.'); }
        catch(e){ toast(String(e.message||e), 'danger'); }
        finally{ loadUsersTable(); }
      };
    });
  }catch(e){
    tbody.innerHTML = `<tr><td colspan="4" class="empty">Lỗi tải danh sách: ${esc(e.message||e)}</td></tr>`;
  }
}

/* =========================================================================
   MÀN HÌNH: BẢNG LƯƠNG
   ========================================================================= */
function renderPayroll(){
  const period = appPeriod;
  const rows = filteredPayrollRows(period);
  const lock = periodLockOf(period);
  // Kỳ đã chốt: bảng lương là bản đã lưu, cảnh báo dữ liệu hiện tại không còn
  // liên quan (sửa dữ liệu kỳ đó cũng đã bị khoá) nên không hiện nữa.
  const warnings = lock ? [] : buildWarnings(period);
  payrollWarnings = warnings; // bindPayroll() đọc lại .go() của đúng dòng vừa bấm qua data-warn-idx
  const sum = k => rows.reduce((s,r)=>s+r[k],0);
  const totalNet = sum('thucNhan'), totalGross = sum('tongThuNhap');
  const projects = allProjects();

  return `
    <div class="pagehead">
      <div>
        <h1>Bảng lương lái xe</h1>
        <p>Tổng hợp lương từng lái xe trong kỳ đang xem.</p>
      </div>
      <div class="actions">
        ${lock
          ? `<button class="btn" data-act="unlock-period">Mở chốt kỳ</button>`
          : `<button class="btn" data-act="lock-period"${storageErrors.periodLocks?` title="${esc('Database chưa có bảng Chốt kỳ — chạy file '+DB_UPGRADE_FILE)}"`:''}>Chốt kỳ này</button>`}
        <button class="btn" data-act="export-csv">Xuất CSV</button>
        <button class="btn primary" data-act="export-xlsx">Xuất Excel (.xlsx)</button>
      </div>
    </div>
    ${lock ? `<div class="lockbox"><b>Kỳ ${esc(periodLabelVi(period))} đã chốt</b> lúc ${esc(fmtDateTime(lock.lockedAt))}${lock.lockedBy?` bởi ${esc(lock.lockedBy)}`:''}.
      Số liệu bên dưới là bản đã chốt — không đổi khi sửa cấu hình. Chuyến, khấu trừ, nhiên liệu, chấm công của kỳ này đang bị khoá.</div>` : ''}

    ${warnings.length ? `<div class="warnbox">
      <button type="button" class="warnbox-toggle" id="warnbox-toggle" aria-expanded="${warningsOpen?'true':'false'}">
        <span class="warnbox-caret">${warningsOpen?'▾':'▸'}</span> <b>${warnings.length} cảnh báo dữ liệu kỳ này</b> — nên xử lý trước khi chốt lương
      </button>
      ${warningsOpen?`
      <ul>${warnings.map((w,i)=>`<li><button type="button" class="linkbtn warn-goto" data-warn-idx="${i}">${esc(w.text)}</button></li>`).join('')}</ul>
      `:''}
    </div>` : ''}

    <div class="filterbar">
      ${driverFilterField('f-driver', filters.payroll.driver)}
      <div class="field">${comboField('f-project', customerComboOptions('Khách hàng', projects), filters.payroll.project, 'Khách hàng')}</div>
      <div class="field grow"><input type="text" id="f-q" placeholder="Mã hoặc tên lái xe…" value="${esc(filters.payroll.q)}"></div>
    </div>

    <div class="tablewrap">
      <table class="payroll-table">
        <thead><tr>
          <th class="th-tools">${payrollCollapseAllBtn()}</th><th class="nowrap">Mã lái xe</th><th class="nowrap">Họ tên</th><th>Biển kiểm soát</th>
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

function platePillHtml(plate, capacity){
  if(!plate) return '<span class="muted">—</span>';
  return `<span class="platecell">${esc(plate)}${capacity?` <span class="badge neutral">${esc(capacity)}T</span>`:''}</span>`;
}
function renderPayrollRow(r){
  const key = r.driver.code;
  const open = expandedRows.has(key);
  // Xe THỰC CHẠY trong kỳ (theo chuyến; kỳ đã chốt lấy đúng bản lúc chốt) —
  // lái xe không có chuyến nào thì mới hiện xe đang gán (chữ mờ).
  const plateList = r.plateLabels || (r.plates||[]).map(p=>{ const v = vehicleByPlate(p); return { plate:p, capacity: v ? v.capacity : null }; });
  const assigned = vehicleOfDriver(key);
  const plateCell = plateList.length
    ? plateList.map(v=>`<span class="platecell">${esc(v.plate)}${v.capacity?` <span class="badge neutral">${esc(v.capacity)}T</span>`:''}</span>`).join('<br>')
    : (assigned ? `<span class="muted">${esc(assigned.plate)}</span>` : '<span class="muted">—</span>');
  // Tải trọng xe cho cột BKS trong bảng chi tiết — kỳ đã chốt lấy đúng tải
  // trọng lúc chốt (plateLabels), kỳ chưa chốt tra theo xe hiện tại.
  const capacityOfPlate = plate => {
    const snap = plateList.find(v=>v.plate===plate);
    if(snap) return snap.capacity;
    const v = vehicleByPlate(plate);
    return v ? v.capacity : null;
  };
  const plateListCell = plateList.length ? plateList.map(v=>platePillHtml(v.plate, v.capacity)).join('<br>') : '<span class="muted">—</span>';
  const out = [`
    <tr class="${r.warnings.length?'row-warn':''}">
      <td>${payrollStatusToggle(key, r.warnings, open)}</td>
      <td class="nowrap">${esc(r.driver.code)}</td>
      <td class="nowrap">${esc(r.driver.name)}${r.driver.status===STATUS_RESIGNED?' <span class="badge danger">Đã nghỉ</span>':''}</td>
      <td class="nowrap">${plateCell}</td>
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
        ${renderPayrollSubrow(key, 'codinh', 'Lương cố định',
          [r.coDinhInfo.total ? `${r.coDinhInfo.workDays}/${r.coDinhInfo.standardDays} ngày công` : '',
           r.coDinhInfo.ntfDayQty ? `${r.coDinhInfo.ntfDayQty} ngày` : '',
           r.coDinhInfo.standbyQty ? `${r.coDinhInfo.standbyQty} ngày Trực` : ''].filter(Boolean).join(' + '),
          r.coDinhInfo.actual, ()=>`
          <table><thead><tr><th>Khoản</th><th class="nowrap">Biển kiểm soát</th><th>Chi tiết</th><th class="num">Thành tiền</th></tr></thead>
          <tbody>
            ${r.coDinhInfo.total ? `<tr><td>Lương cứng theo ngày công</td>
              <td class="nowrap">${plateListCell}</td>
              <td>${r.coDinhInfo.workDays}/${r.coDinhInfo.standardDays} ngày × (${fmtMoney(r.coDinhInfo.total)} đ / ${r.coDinhInfo.standardDays} ngày)</td>
              <td class="num">${fmtMoney(r.coDinhInfo.base)}</td></tr>` : ''}
            ${r.coDinhInfo.ntfDayLines.length ? r.coDinhInfo.ntfDayLines.map(l=>`<tr><td>Phụ cấp đường dài theo ngày (${esc(l.project||'NTF')})</td>
              <td class="nowrap">${platePillHtml(l.plate, l.capacity)}</td>
              <td>${fmtDate(l.date)}</td>
              <td class="num">${fmtMoney(l.amount)}</td></tr>`).join('') : ''}
            ${r.coDinhInfo.standbyLines.length ? r.coDinhInfo.standbyLines.map(l=>`<tr><td>Lương trực (${esc(l.project)})</td>
              <td class="nowrap">${platePillHtml(l.plate, l.capacity)}</td>
              <td>${fmtDate(l.date)}</td>
              <td class="num">${fmtMoney(l.amount)}</td></tr>`).join('') : ''}
            ${!r.coDinhInfo.total && !r.coDinhInfo.ntfDayLines.length && !r.coDinhInfo.standbyLines.length ? '<tr><td colspan="4" class="muted">Không có</td></tr>' : ''}
          </tbody></table>
          ${r.coDinhInfo.ntfDayLines.length || r.coDinhInfo.standbyLines.length?'<div class="hint">Phụ cấp đường dài/Lương trực làm tròn 1 lần trên tổng — cộng từng dòng trên có thể lệch vài đồng so với tổng thực tế.</div>':''}`)}
        ${renderPayrollSubrow(key, 'trips', 'Lương chuyến', `${r.trips.length} chuyến${r.cancelled?` (+${r.cancelled} huỷ)`:''}`, r.chuyen+r.tangCuong, ()=>`
          <table><thead><tr><th>Ngày</th><th class="nowrap">Biển kiểm soát</th><th>Khách hàng — Chi tiết</th><th>Loại</th><th class="num">Đơn giá</th></tr></thead>
          <tbody>${r.trips.length ? r.trips.map(t=>{
            const price = t._price!==undefined ? t._price : tripUnitPrice(t);
            return `<tr><td class="nowrap">${fmtDate(t.date)}</td><td class="nowrap">${platePillHtml(t.plate, capacityOfPlate(t.plate))}</td><td>${t._label!==undefined ? t._label : tripCustomerLabel(t, true)}${tripPointNoteHtml(t)}</td>
              <td>${tripTypeBadge(t)}</td>
              <td class="num">${price===null?'<span class="badge warn">Thiếu giá</span>':fmtMoney(price)}</td></tr>`;
          }).join('') : '<tr><td colspan="5" class="muted">Không có chuyến</td></tr>'}</tbody></table>`)}
        ${renderPayrollSubrow(key, 'phucap', 'Phụ cấp', `${r.phuCapLines.length} khoản`, r.phuCap, ()=>`
          <table><thead><tr><th>Loại</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
          <tbody>${r.phuCapLines.length ? r.phuCapLines.map(l=>`<tr><td>${esc(l.name)}</td>
            <td class="num">${l.qty}</td><td class="num">${fmtMoney(l.rate)}</td><td class="num">${fmtMoney(l.amount)}</td></tr>`).join('')
            : '<tr><td colspan="4" class="muted">Không có</td></tr>'}</tbody></table>`)}
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
  const warnToggle = document.getElementById('warnbox-toggle');
  if(warnToggle) warnToggle.onclick = ()=>{ warningsOpen = !warningsOpen; render(); };
  document.querySelectorAll('.warn-goto').forEach(b=>{
    b.onclick = ()=>{ const w = payrollWarnings[Number(b.dataset.warnIdx)]; if(w && w.go) w.go(); };
  });
  document.querySelectorAll('[data-toggle]').forEach(b=>{
    b.onclick = ()=>{ const k=b.dataset.toggle; expandedRows.has(k)?expandedRows.delete(k):expandedRows.add(k); render(); };
  });
  const collapseAll = document.querySelector('[data-act="collapse-all"]');
  if(collapseAll) collapseAll.onclick = ()=>{ expandedRows.clear(); render(); };
  document.querySelector('[data-act="export-csv"]').onclick = exportPayrollCsv;
  document.querySelector('[data-act="export-xlsx"]').onclick = exportPayrollXlsx;
  const lockBtn = document.querySelector('[data-act="lock-period"]');
  if(lockBtn) lockBtn.onclick = ()=>lockPeriod(appPeriod);
  const unlockBtn = document.querySelector('[data-act="unlock-period"]');
  if(unlockBtn) unlockBtn.onclick = ()=>unlockPeriod(appPeriod);
}
// Xuất file khi kỳ (chưa chốt) còn cảnh báo dữ liệu — hỏi lại trước, tránh
// xuất bảng lương thiếu giá/thiếu chấm nhiên liệu mà không để ý.
function confirmExportWithWarnings(){
  if(isPeriodLocked(appPeriod)) return true;
  const n = buildWarnings(appPeriod).length + filteredPayrollRows(appPeriod).filter(r=>r.warnings.length).length;
  return !n || confirm(`Kỳ này còn cảnh báo dữ liệu chưa xử lý (xem đầu trang Bảng lương và các dòng có dấu ⚠). Vẫn xuất file?`);
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
  aoa.push([], ['DANH SÁCH XE'], ['Biển số']);
  [...state.vehicles].sort((a,b)=>String(a.plate).localeCompare(String(b.plate)))
    .forEach(v=>aoa.push([v.plate]));
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
  if(!confirmExportWithWarnings()) return;
  saveFile(`BangLuong_${appPeriod}.csv`, '﻿'+toCsv(payrollAoA(filteredPayrollRows(appPeriod))));
  toast('Đã tạo file CSV bảng lương kỳ '+periodCaption(appPeriod));
}
function exportPayrollXlsx(){
  if(!confirmExportWithWarnings()) return;
  const rows = filteredPayrollRows(appPeriod);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payrollAoA(rows)), 'Bang luong');

  // "Tuyến" = nguyên Tuyến đường đã cấu hình trong Lương theo tuyến; "Điểm
  // đi"/"Điểm đến" = đúng 2 ô riêng trên chuyến (để trống nếu chuyến chưa
  // nhập) — tách 3 cột riêng biệt, không gộp lại như cột hiển thị rút gọn ở
  // Lịch lái xe (xem tripOriginDestLabel).
  const tripsAoa = [['Ngày','Mã chuyến','Mã LX','Biển số','Khách hàng','Tuyến','Km','Bốc xếp','Điểm giao','Loại chuyến','Đơn giá','Doanh thu','Điểm đi','Điểm đến']];
  rows.forEach(r=>r.trips.forEach(t=>tripsAoa.push([fmtDate(t.date), t.tripCode||'', t.driverCode, t.plate, t.project, t.route||'',
    t.km ?? '', t.loadingCount||'', t.pointCount||'', tripTypeLabel(tripTypeOf(t)), (t._price!==undefined ? t._price : tripUnitPrice(t)) ?? '', safeNum(t.revenue),
    t.origin||'', t.destination||''])));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tripsAoa), 'Chi tiet chuyen');

  const allowAoa = [['Mã LX','Loại phụ cấp','Đơn vị tính','Số lượng','Đơn giá','Thành tiền']];
  rows.forEach(r=>r.phuCapLines.forEach(l=>allowAoa.push([r.driver.code, l.name, unitLabel(l.unit), l.qty,
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
// Bộ lọc "Lái xe"/"Khách hàng" ở Chuyến đi tự RÀNG BUỘC lẫn nhau theo đúng
// dữ liệu chuyến thật (trong đúng kỳ/phạm vi đang xem) — chọn 1 lái xe chỉ
// chạy cho GHN thì ô Khách hàng chỉ còn hiện GHN, và ngược lại chọn GHN thì
// ô Lái xe chỉ còn hiện những lái xe từng có chuyến cho GHN. Luôn CHÈN THÊM
// mã đang chọn vào danh sách dù không khớp bộ lọc còn lại (VD vừa đổi lái xe
// sang người chưa từng chạy đúng khách hàng đang chọn) để ô không bị trống
// trơn/trông như mất lựa chọn — tự để người dùng thấy và chủ động đổi lại.
function tripFacetCodes(){
  const f = filters.trips;
  const scoped = state.trips.filter(t=>periodScopeAll || getPeriod(t.date)===appPeriod);
  let driverCodes = f.project ? distinct(scoped.filter(t=>t.project===f.project).map(t=>t.driverCode)) : null;
  let projectCodes = f.driver ? distinct(scoped.filter(t=>t.driverCode===f.driver).map(t=>t.project)) : null;
  if(driverCodes && f.driver && !driverCodes.includes(f.driver)) driverCodes = [...driverCodes, f.driver];
  if(projectCodes && f.project && !projectCodes.includes(f.project)) projectCodes = [...projectCodes, f.project];
  return { driverCodes, projectCodes };
}
function renderTrips(){
  const f = filters.trips, q = f.q.trim().toLowerCase();
  const { driverCodes, projectCodes } = tripFacetCodes();
  const focus = f.focus || null;
  const focusIds = focus ? new Set(focus.ids) : null;
  const list = state.trips.filter(t=>{
    if(focusIds) return focusIds.has(t.id);
    if(!periodScopeAll && getPeriod(t.date)!==appPeriod) return false;
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
      <div><h1>Lịch lái xe</h1><p>Ghi nhận từng chuyến xe chạy hằng ngày — nguồn dữ liệu chính để tính lương lái xe.</p></div>
      <div class="actions">${importButtons('trip')}
        <button class="btn danger" data-act="bulk-delete"${selectedTripIds.size?'':' hidden'}>Xoá đã chọn${selectedTripIds.size?` (${selectedTripIds.size})`:''}</button>
        <button class="btn primary" data-act="add">+ Thêm chuyến</button></div>
    </div>
    ${focus ? `<div class="focusbar"><span><b>Đang lọc theo cảnh báo:</b> ${esc(focus.label)} — hiện ${list.length} chuyến để so sánh (không theo kỳ/bộ lọc bên dưới).</span>
      <button class="btn sm" data-act="clear-focus">Bỏ lọc</button></div>` : ''}
    <div class="filterbar">
      ${driverFilterField('f-driver', f.driver, driverCodes)}
      <div class="field">${comboField('f-project', customerComboOptions('Khách hàng', projectCodes), f.project, 'Khách hàng')}</div>
      <div class="field grow"><input type="text" id="f-q" placeholder="Mã chuyến / lái xe / biển số…" value="${esc(f.q)}"></div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th style="width:32px;"><input type="checkbox" id="trip-select-all"${allSelected?' checked':''}></th><th>Ngày</th><th class="nowrap">Lái xe</th><th>Biển số</th><th>Khách hàng — Chi tiết</th>
        <th>Điểm đi → đến</th><th>Loại</th><th class="num">Đơn giá</th><th></th></tr></thead>
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
          <td class="num nowrap">${price===null?'<span class="badge warn">Thiếu giá</span>':fmtMoney(price)}</td>
          <td>${isPeriodLocked(getPeriod(t.date))?'<span class="badge neutral" title="Kỳ đã chốt lương — không sửa/xoá được">Đã chốt</span>':rowActions(t.id)}</td></tr>`;
      }).join('') || `<tr><td colspan="9" class="empty">${periodScopeAll?'Chưa có chuyến nào.':'Chưa có chuyến nào trong kỳ đang xem.'}</td></tr>`}
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
    // Không hiện thêm "(Trả điểm — không tính thêm)"/loại chuyến ở đây nữa —
    // cột "Loại" riêng (tripTypeBadge) đã hiện đúng loại chuyến này rồi, nhắc
    // lại ở đây chỉ dư thừa/rối mắt.
    if(isZeroRevenueTrip(t)) return esc(t.project);
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
  // Chuyến không ghi tuyến (VD Trực/Nghỉ) — chỉ hiện mã khách hàng, không để "GHN —" thừa dấu gạch.
  if(!String(t.route||'').trim()) return esc(t.project);
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

// Thứ tự ô theo đúng thứ tự cần trả lời: Ngày → Loại chuyến (quyết định cần
// những ô nào bên dưới) → Lái xe/Xe → Khách hàng → các ô theo cách tính của
// khách hàng. Loại Trực/Nghỉ tự ẩn các ô không dùng (Tuyến, Số km, Khu vực,
// Bốc xếp, Số điểm giao) — xem syncTypeVisibility trong openTripModal.
function tripModalHtml(t, isNew){
  return `
    <h3>${isNew?'Thêm chuyến':'Sửa chuyến'}</h3>
    <div class="modal-grid">
      ${ERROR_SLOT}
      <div class="modal-field"><label for="m-date">Ngày *</label><input type="date" id="m-date" value="${esc(t.date||'')}"></div>
      <div class="modal-field"><label for="m-code">Mã chuyến</label><input type="text" id="m-code" value="${esc(t.tripCode||'')}"></div>
      <div class="modal-field full"><label for="m-triptype">Loại chuyến</label><select id="m-triptype">${selectOptions(TRIP_TYPES, tripTypeOf(t))}</select></div>
      <div class="modal-field"><label for="m-driver-text">Lái xe *</label>${comboField('m-driver', driverComboOptions('— Chọn —', null, true, t.driverCode), t.driverCode, 'Gõ mã hoặc tên lái xe…')}</div>
      <div class="modal-field"><label for="m-plate-text">Biển số xe *</label>${comboField('m-plate', vehicleComboOptions('— Chọn —', true, t.plate), t.plate, 'Gõ biển số…')}</div>
      <div class="modal-field full"><label for="m-project-text">Khách hàng *</label>${comboField('m-project', customerComboOptions('— Chọn —'), t.project, 'Gõ mã hoặc tên khách hàng…')}</div>
      <div id="m-method-fields" class="modal-grid full" style="padding:0;"></div>
      <div class="modal-field"><label for="m-origin">Điểm đi</label><input type="text" id="m-origin" value="${esc(t.origin||'')}"></div>
      <div class="modal-field"><label for="m-dest">Điểm đến</label><input type="text" id="m-dest" value="${esc(t.destination||'')}"></div>
      <div class="modal-field" id="m-point-wrap"><label for="m-point">Số điểm giao</label><input type="number" min="0" step="1" id="m-point" value="${t.pointCount!=null?t.pointCount:''}">
        <div class="hint">Điểm đầu tiên không tính; từ điểm thứ 2 tự cộng phụ cấp rớt điểm.</div></div>
      <div class="full hint" id="m-preview"></div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="m-cancel">Huỷ</button>
      ${isNew?'<button class="btn" id="m-save-more">Lưu &amp; thêm tiếp</button>':''}
      <button class="btn primary" id="m-save">Lưu</button>
    </div>`;
}

// Ngày mặc định khi thêm chuyến MỚI: ngày vừa nhập gần nhất nếu vẫn thuộc kỳ
// đang xem → hôm nay nếu hôm nay thuộc kỳ đang xem → mùng 1 của kỳ đang xem
// (trước đây luôn là hôm nay, đang xem kỳ cũ bấm Thêm là dễ nhập nhầm kỳ).
let lastEnteredTripDate = null;
function defaultEntryDate(lastDate){
  if(lastDate && getPeriod(lastDate)===appPeriod) return lastDate;
  if(todayPeriod()===appPeriod) return todayISO();
  return appPeriod ? appPeriod+'-01' : todayISO();
}
// Khoá so trùng 1 chuyến — cùng ngày, lái xe, xe, khách hàng, tuyến, loại,
// số km. "Trả điểm" không xét (1 lượt có thể có nhiều dòng Trả điểm giống
// hệt nhau là đúng).
function tripDupKey(t){
  return [t.date, t.driverCode, t.plate, t.project, String(t.route||'').trim(), tripTypeOf(t),
    (t.km===null||t.km===undefined||t.km==='') ? '' : safeNum(t.km)].join('|');
}
function findDuplicateTrip(t, excludeId){
  if(tripTypeOf(t)==='point') return null;
  const key = tripDupKey(t);
  return state.trips.find(x=>x.id!==excludeId && x.status!==TRIP_CANCELLED && tripDupKey(x)===key) || null;
}

function openTripModal(trip, prefill){
  const isNew = !trip;
  const base = trip || Object.assign({ date: defaultEntryDate(lastEnteredTripDate), status:'Hoàn thành', isSurge:false }, prefill||{});
  if(isNew && !base.tripCode) base.tripCode = nextTripCode(base.date);
  openModal(tripModalHtml(base, isNew));

  const $ = id => document.getElementById(id);
  let codeTouched = !isNew;

  function currentMethod(){ return customerCalcMethod($('m-project').value); }

  // Mỗi khách hàng cần các ô nhập khác nhau: route/tripPlusExtras cần chọn
  // Tuyến (tra bảng giá); km cần nhập số km; fixed không cần ô nào thêm.
  function methodFieldsHtml(method, seed){
    // Trực/Nghỉ: không chạy chuyến nên không cần Tuyến/Số km/Khu vực/Bốc xếp.
    const seedType = tripTypeOf(seed||{});
    if(seedType==='standby' || seedType==='off') return '';
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
      // cấu hình ở "Lương theo tuyến" (xem routeCustomerCodes/tripBasePrice)
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
      comboField('m-route', routeOpts, (seed && seed.route) || '', !$('m-project').value ? 'Chọn Khách hàng trước' : routeOpts.length>1?'Gõ tên tuyến…':'Chưa có tuyến cho khách hàng này')}</div>`;
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
      // Nói rõ luôn khoản Lương trực sẽ cộng (nếu khách hàng có cấu hình) —
      // trước đây chỉ nhắc ngày công, người nhập không biết ngày Trực có tiền.
      const cust = customerByCode(draft.project);
      let standbyNote;
      if(cust && cust.calcMethod==='route' && customerHasStandbyConfig(cust)){
        const monthly = standbyMonthlyAmount(cust, veh ? veh.capacity : 0);
        standbyNote = `Lương trực ${esc(draft.project)}: ${fmtMoney(monthly)} đ/tháng ÷ ${LONG_HAUL_STANDARD_DAYS} ngày ≈ <b>${fmtMoney(Math.round(monthly/LONG_HAUL_STANDARD_DAYS))} đ</b> cho ngày này${veh?'':' (chọn Biển số để tra đúng mức theo tải trọng)'}, cộng vào Lương cố định.`;
      }else{
        standbyNote = 'Khách hàng này chưa cấu hình Lương trực nên ngày Trực không có tiền trực.';
      }
      $('m-preview').innerHTML = `Trực — 0đ tiền chuyến. ${standbyNote} Lái xe có lương cứng: ngày này tính 1 ngày công.`;
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
      $('m-preview').innerHTML = '<span class="warn">Chưa có đơn giá cho cặp Khách hàng + Tuyến này — vào Cấu hình › Lương theo tuyến để thêm.</span>' + dropHtml;
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
    html += dropHtml;
    $('m-preview').innerHTML = html;
  }
  function onProjectChange(seed){ refreshMethodFields(seed||{ tripType: $('m-triptype').value }); refreshPreview(); }

  refreshMethodFields(base);
  refreshPreview();

  const driverOpts = driverComboOptions('— Chọn —', null, true, base.driverCode);
  const plateOpts = vehicleComboOptions('— Chọn —', true, base.plate);
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
  $('m-plate').onchange = ()=>{ refreshPreview(); };
  $('m-project').onchange = ()=>onProjectChange();
  function syncTypeVisibility(){
    const type = $('m-triptype').value;
    $('m-point-wrap').hidden = (type==='standby' || type==='off');
  }
  syncTypeVisibility();
  $('m-triptype').onchange = ()=>{ if($('m-error')) $('m-error').hidden = true; syncTypeVisibility(); refreshMethodFields(currentDraft()); refreshPreview(); };
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
      // Trực/Nghỉ: ô Số điểm giao bị ẩn (không chạy chuyến) — lưu 0.
      pointCount: (draft.tripType==='standby' || draft.tripType==='off') ? 0 : draft.pointCount,
      origin: $('m-origin').value.trim(), destination: $('m-dest').value.trim(),
      tripType: draft.tripType,
    };
    if(isNew) data.status = 'Hoàn thành'; // chuyến mới luôn tính lương — sai thì xoá, không đánh dấu Huỷ nữa
    if(!data.date || !data.driverCode || !data.plate || !data.project){
      modalError('Cần nhập đủ: Ngày, Lái xe, Biển số và Khách hàng.');
      return;
    }
    // Kỳ đã chốt — không thêm chuyến mới vào, không sửa/chuyển chuyến cũ ra/vào.
    if(isPeriodLocked(getPeriod(data.date)) || (trip && isPeriodLocked(getPeriod(trip.date)))){
      modalError(lockedPeriodMsg(isPeriodLocked(getPeriod(data.date)) ? getPeriod(data.date) : getPeriod(trip.date)));
      return;
    }
    // Khách "Theo km": ô Số km có dấu * nhưng trước đây vẫn lưu được khi để
    // trống (chuyến bị thiếu giá). Bắt buộc với chuyến thường (trừ khi chạy
    // đúng 1 tuyến giá cố định) và chuyến tăng cường Ngoại tỉnh.
    if(method==='km' && !isZeroRevenueTrip(draft) && (data.km===null || data.km===undefined)){
      const matchedRoute = data.route && findRoute(data.project, data.route);
      if(!isSurgeTrip(draft) && !matchedRoute){ modalError('Khách hàng này tính theo km — cần nhập Số km.'); return; }
      if(isSurgeTrip(draft) && data.surgeZone==='outer'){ modalError('Chuyến tăng cường Ngoại tỉnh cần nhập Số km.'); return; }
    }
    // Trả hàng/Trực luôn 0đ (xem tripUnitPrice) nên không bắt buộc chọn Tuyến
    // đường/Khu vực như chuyến thường — chỉ cần ngày/lái xe/xe/khách hàng
    // để tính đúng ngày công cho Lương cố định.
    if(!isZeroRevenueTrip(draft) && (method==='route'||method==='tripPlusExtras') && !data.route){
      modalError('Khách hàng này tính lương theo tuyến — cần chọn Tuyến đường.');
      return;
    }
    // Nhập trùng: đã có chuyến giống hệt (cùng ngày, lái xe, xe, khách, tuyến,
    // loại, số km) — hỏi lại, vì có thể đúng là chạy 2 lượt cùng tuyến.
    const dup = findDuplicateTrip(data, trip ? trip.id : null);
    if(dup && !confirm(`Đã có chuyến ${dup.tripCode||''} giống hệt (cùng ngày ${fmtDate(dup.date)}, lái xe, xe, khách hàng, tuyến, loại chuyến). Vẫn lưu thêm chuyến này?`)) return;
    if(trip) await updateDoc('trips', trip.id, data); else await addDoc('trips', data);
    lastEnteredTripDate = data.date;
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
  // Gõ sai/không nhận ra (VD "Trưc", "Tang ca") — trước đây tự hiểu là
  // "Chuyến" không báo; giờ trả undefined để bảng soát báo lỗi, giữ chữ gốc.
  return undefined;
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
// field dùng riêng để tô màu lỗi đúng ô cần sửa (xem importCellClass).
function importErrorCellHtml(errors){
  if(!errors.length) return '<span class="badge good">OK</span>';
  return `<span class="import-err-icon" data-tip="${esc(errors.map(e=>e.message).join(' '))}">⚠</span>`;
}
// Class tô màu lỗi cho đúng ô input cần bổ sung/sửa/bỏ bớt — field khớp tên
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
function validateTripImportRow(row, usedCodes, seenKeys){
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
  const parsedType = parseTripType(tripTypeRaw);
  if(parsedType===undefined) err(TRIP_TYPE_HEADER, `Loại chuyến "${String(tripTypeRaw).trim()}" không hợp lệ — chỉ nhận: ${TRIP_TYPES.map(t=>t.l).join(', ')}.`);
  if(date && isPeriodLocked(getPeriod(date))) err('Ngày', lockedPeriodMsg(getPeriod(date)));
  const zeroRevenue = ZERO_REVENUE_TRIP_TYPES.includes(parsedType);
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
    // VÀ khớp đúng 1 tuyến đã cấu hình ở "Lương theo tuyến" thì chuyến đó
    // tính theo đơn giá tuyến (xem tripBasePrice), không cần Khu vực nữa.
    if(method==='km' && routeName) matchedKmRoute = findRoute(project, routeName);
  }
  const isSurge = parsedType === 'surge';
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
  // Khách "Theo km": thiếu Số km thì chuyến thiếu giá — bắt buộc như ở form
  // nhập tay (trừ chuyến 0đ, chuyến chạy đúng tuyến giá cố định, tăng cường
  // Nội thành).
  const kmRaw = row['Số km'];
  const kmEmpty = kmRaw==='' || kmRaw===undefined || kmRaw===null;
  if(method==='km' && !zeroRevenue && kmEmpty && !matchedKmRoute && (!isSurge || surgeZone==='outer')){
    err('Số km', `Khách hàng ${project} tính theo km — cần nhập Số km.`);
  }
  let code = String(row['Mã chuyến']||'').trim();
  if(code && usedCodes.has(code)) err('Mã chuyến', `Mã chuyến "${code}" đã tồn tại — sửa lại hoặc xoá trống để tự đặt mã khác.`);
  // Nhập lại cùng 1 file (hoặc 2 dòng giống hệt) — trước đây tự đặt mã mới
  // nên chuyến bị nhân đôi, lương nhân đôi. Chuyến đúng là chạy thêm 1 lượt
  // giống hệt thì điền Mã chuyến riêng cho dòng đó để nhập.
  if(!code && date && driverCode && plate && project && parsedType && parsedType!=='point'){
    const probe = { date, driverCode, plate, project, route: (needRoute || method==='km') ? routeName : '', tripType: parsedType,
      km: method==='km' ? (kmEmpty ? null : safeNum(kmRaw)) : null };
    const key = tripDupKey(probe);
    const existing = findDuplicateTrip(probe, null);
    if(existing) err('Mã chuyến', `Trùng với chuyến ${existing.tripCode||''} đã có (cùng ngày, lái xe, xe, khách, tuyến, loại). Nếu đúng là chạy thêm 1 lượt, điền Mã chuyến riêng cho dòng này.`);
    else if(seenKeys && seenKeys.has(key)) err('Mã chuyến', 'Trùng với 1 dòng phía trên trong file (cùng ngày, lái xe, xe, khách, tuyến, loại). Nếu đúng là 2 lượt, điền Mã chuyến riêng cho dòng này.');
    if(!errors.length && seenKeys) seenKeys.add(key);
  }
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
    pointCount: (parsedType==='standby' || parsedType==='off') ? 0 : safeNum(row['Số điểm giao']),
    origin: String(row['Điểm đi']||'').trim() || (parts?parts.origin:''),
    destination: String(row['Điểm đến']||'').trim() || (parts?parts.destination:''),
    tripType: parsedType,
    // Trực/Nghỉ không chạy chuyến — không tính điểm giao (giống form nhập tay).
    status: 'Hoàn thành',
  };
  return { errors:[], data };
}
async function importTripsExcel(rows){
  const meaningful = rows.filter(row=>!isBlankTripImportRow(row));
  if(!meaningful.length){ alert('File không có dữ liệu chuyến.'); return; }
  const normalized = meaningful.map(row=>normalizeTripTypeColumn({ ...row, 'Ngày': parseSheetDate(row['Ngày']) }));
  const usedCodes = new Set(state.trips.map(t=>t.tripCode).filter(Boolean));
  const seenKeys = new Set();
  const checked = normalized.map(row=>({ row, ...validateTripImportRow(row, usedCodes, seenKeys) }));
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
    const seenKeys = new Set();
    draft.forEach(d=>{
      const { errors, data } = validateTripImportRow(d.row, usedCodes, seenKeys);
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
        ${parseTripType(r[TRIP_TYPE_HEADER])===undefined ? `<option value="${esc(r[TRIP_TYPE_HEADER])}" selected>"${esc(r[TRIP_TYPE_HEADER])}" — chọn lại</option>` : ''}
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
  // Dùng ĐÚNG cùng 1 cặp danh sách mã đã lọc như lúc renderTrips() vẽ HTML
  // (xem tripFacetCodes()) — bindCombo() tự vẽ lại danh sách gợi ý theo
  // "options" truyền vào đây mỗi khi gõ/mở ô, không đọc lại từ HTML đã có
  // sẵn, nên phải khớp đúng nếu không gõ tìm sẽ lại hiện ra TOÀN BỘ danh
  // sách chưa lọc, không còn ràng buộc Lái xe ↔ Khách hàng nữa.
  const { driverCodes, projectCodes } = tripFacetCodes();
  bindCombo('f-driver', driverComboOptions('Lái xe', driverCodes));
  bindCombo('f-project', customerComboOptions('Khách hàng', projectCodes));
  // Đổi bất kỳ bộ lọc nào = thoát chế độ "lọc theo cảnh báo".
  $('f-driver').onchange = e=>{ filters.trips.focus = null; filters.trips.driver = e.target.value; render(); };
  $('f-project').onchange = e=>{ filters.trips.focus = null; filters.trips.project = e.target.value; render(); };
  $('f-q').oninput = e=>{ filters.trips.focus = null; filters.trips.q = e.target.value; render(); };
  const clearFocus = document.querySelector('[data-act="clear-focus"]');
  if(clearFocus) clearFocus.onclick = ()=>{ filters.trips.focus = null; render(); };
  bindImportButtons('trip', exportTripTemplate, importTripsExcel);
  document.querySelector('[data-act="add"]').onclick = ()=>{
    if(!state.customers.length){ toast('Cần cấu hình Khách hàng trước khi nhập chuyến.', 'danger'); setSection('cfg-customers'); return; }
    openTripModal(null, null);
  };
  bindRowActions(
    id => openTripModal(state.trips.find(t=>t.id===id), null),
    async id => {
      const t = state.trips.find(x=>x.id===id);
      if(guardPeriodEdit([t.date])) return;
      if(confirm(`Xoá chuyến ${t.tripCode||''} ngày ${fmtDate(t.date)}?`)){ await deleteDoc('trips', id); toast('Đã xoá chuyến.'); }
    }
  );
  // Tick chọn hàng loạt để xoá nhiều chuyến 1 lần — cập nhật thẳng DOM (nút
  // "Xoá đã chọn"/ô chọn tất cả) thay vì gọi render() lại toàn trang mỗi lần
  // tick 1 dòng, để không nhảy cuộn trang mỗi lần chọn.
  function updateBulkDeleteUI(){
    const btn = document.querySelector('[data-act="bulk-delete"]');
    if(btn){
      btn.hidden = selectedTripIds.size===0; // chỉ hiện khi có ít nhất 1 chuyến đang tick, không chỉ làm mờ như trước
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
    if(guardPeriodEdit(ids.map(id=>(state.trips.find(t=>t.id===id)||{}).date).filter(Boolean))) return;
    if(!confirm(`Xoá ${ids.length} chuyến đã chọn? Không thể hoàn tác.`)) return;
    await deleteManyDocs('trips', ids);
    selectedTripIds.clear();
    toast(`Đã xoá ${ids.length} chuyến.`);
  };
}

/* =========================================================================
   MÀN HÌNH: CHẤM CÔNG PHỤ CẤP (số lượng theo kỳ)
   ========================================================================= */
const usageDraft = new Map();              // giữ số đang gõ, không mất khi trang vẽ lại
const usageKey = (c, period) => `${c.targetType}|${c.targetId}|${c.allowanceTypeId}|${period}`;

// Một dòng phụ cấp của một lái xe, cho đúng dự án lái xe thực chạy trong kỳ:
// "Theo ngày công" tự tính từ Chuyến đi (không sửa được); "Theo lần phát
// sinh" (perOccurrence/perOccurrenceByProject) nhập tay, giữ nguyên cơ chế
// chấm công + usageDraft như trước.
function allowanceLinesForDriver(driverCode, period){
  const trips = state.trips.filter(t=>t.driverCode===driverCode && getPeriod(t.date)===period && t.status!==TRIP_CANCELLED);
  const mainProject = driverManualProject(driverCode, trips, period);
  const projectsRun = distinct(trips.filter(t=>!isOffTrip(t)).map(t=>t.project));
  const lines = [];
  state.allowanceTypes.filter(t=>t.unit==='perDay' || unitNeedsManualUsage(t.unit)).forEach(type=>{
    const c = { targetType:'driver', targetId:driverCode, allowanceTypeId:type.id };
    if(type.unit==='perDay'){
      // "Theo ngày công" tự tính từ Chuyến đi — tách riêng 1 dòng CHO MỖI dự
      // án lái xe có chạy trong kỳ (đúng đơn giá của dự án đó), không gộp về
      // 1 dự án duy nhất nữa (xem calcPhuCap).
      projectsRun.forEach(project=>{
        const rate = allowanceRateFor(type, project);
        if(rate==null) return;
        const days = tripDaysCount(trips.filter(t=>t.project===project));
        if(days<=0) return;
        lines.push({ config:c, type, rate, auto:true, key:null, savedId:null, savedQty:days, qty:days, project });
      });
      return;
    }
    // "Theo lần phát sinh"/"giờ mỗi kỳ" nhập tay — chỉ nhập được 1 số/kỳ nên
    // quy về dự án chính (driverMainProject), giống calcPhuCap.
    const rate = allowanceRateFor(type, mainProject);
    if(rate==null) return;
    const saved = state.allowanceUsage.find(u=>u.targetType==='driver' && u.targetId===driverCode
      && u.allowanceTypeId===type.id && u.period===period);
    const key = usageKey(c, period);
    const savedQty = saved ? safeNum(saved.quantity) : 0;
    lines.push({ config:c, type, rate, auto:false, key, savedId: saved ? saved.id : null, savedQty,
      qty: usageDraft.has(key) ? usageDraft.get(key) : savedQty });
  });
  return lines.sort((a,b)=> String(a.type.name).localeCompare(String(b.type.name)));
}
function allowanceUsageDriverRows(period){
  return state.drivers
    .map(d=>({ driver:d, lines: allowanceLinesForDriver(d.code, period) }))
    // Lái xe đã nghỉ việc chỉ hiện khi kỳ này còn chuyến hoặc đã chấm công.
    .filter(r=>r.lines.length && (r.driver.status!==STATUS_RESIGNED || r.lines.some(l=>l.auto || l.savedQty)))
    .sort((a,b)=> String(a.driver.code).localeCompare(String(b.driver.code)));
}
function lineAmount(l){ return safeNum(l.rate) * safeNum(l.qty); }

function renderAllowanceUsage(){
  const f = filters.usage;
  const allRows = allowanceUsageDriverRows(appPeriod);
  const rows = f.driver ? allRows.filter(r=>r.driver.code===f.driver) : allRows;
  const allLines = rows.flatMap(r=>r.lines);
  const dirty = allLines.filter(l=>!l.auto && l.qty!==l.savedQty).length;
  return `
    <div class="pagehead">
      <div><h1>Chấm công phụ cấp</h1>
        <p>Nhập số lần/số giờ của phụ cấp nhập tay (Tăng ca, Ca đêm…) cho từng lái xe. Bảng chỉ gồm phụ cấp theo ngày công và phụ cấp nhập tay — tổng phụ cấp đầy đủ xem ở Bảng lương.</p></div>
      ${allRows.length?`<div class="actions">${importButtons('usage')}</div>`:''}
    </div>
    ${allRows.length?`<div class="filterbar">${driverFilterField('f-driver', f.driver)}</div>`:''}
    <div class="tablewrap"><table>
      <thead><tr><th></th><th>Mã LX</th><th>Họ tên</th><th class="num">Số khoản</th><th class="num">Thành tiền (các khoản này)</th></tr></thead>
      <tbody>${rows.length ? rows.map(r=>renderAllowanceDriverRow(r)).join('')
        : `<tr><td colspan="5" class="empty">${f.driver?'Lái xe này không có phụ cấp nào cần chấm công kỳ này.':'Chưa có lái xe nào cần chấm công phụ cấp kỳ này. Vào Cấu hình › Phụ cấp để gán hoặc thêm loại tự động theo dự án.'}</td></tr>`}
      </tbody></table></div>
    ${isPeriodLocked(appPeriod)?`<div class="lockbox">${esc(lockedPeriodMsg(appPeriod))}</div>`:''}
    ${rows.length?`<div class="savebar">
      <button class="btn primary" id="usage-save"${dirty && !isPeriodLocked(appPeriod)?'':' disabled'}>Lưu chấm công kỳ này</button>
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
      <tbody>${r.lines.map(l=>`<tr><td>${esc(l.type.name)}${l.project?` <span class="muted">(${esc(l.project)})</span>`:''}</td><td>${esc(unitLabel(l.type.unit))}</td>
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
  if(document.getElementById('f-driver-text')){
    bindCombo('f-driver', driverComboOptions('Lái xe'));
    document.getElementById('f-driver').onchange = e=>{ filters.usage.driver = e.target.value; render(); };
  }
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
    if(guardPeriodEdit([appPeriod+'-01'])) return;
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
// Kỳ mới chưa chấm: Km đầu kỳ / Tồn đầu kỳ tự lấy từ Km cuối / Tồn cuối của
// kỳ TRƯỚC (đã lưu) — gợi ý sẵn (chữ nghiêng), sửa được, chỉ ghi vào dữ liệu
// khi bấm Lưu cho xe đó. Không ghi đè ô đã có số lưu hoặc đang gõ.
function fuelSuggestions(plate, period, savedVals, draft){
  const prev = vehicleFuelLog(plate, shiftPeriod(period, -1));
  const out = {};
  if(!prev) return out;
  [['odoStart','odoEnd'], ['stockStart','stockEnd']].forEach(([field, from])=>{
    if((savedVals[field]==null || savedVals[field]==='') && (draft||{})[field]===undefined && prev[from]!=null && prev[from]!=='') out[field] = prev[from];
  });
  return out;
}
function fuelRowsFor(period){
  const price = fuelPriceDraft.has(period) ? fuelPriceDraft.get(period) : fuelPriceOf(period);
  return fuelManagedVehicles().sort((a,b)=>String(a.plate).localeCompare(String(b.plate))).map(v=>{
    const saved = vehicleFuelLog(v.plate, period);
    const savedVals = Object.fromEntries(FUEL_FIELDS.map(k=>[k, saved ? (saved[k]??null) : null]));
    const draft = fuelDraft.get(fuelDraftKey(period, v.plate)) || {};
    const suggested = fuelSuggestions(v.plate, period, savedVals, draft);
    const vals = {...savedVals, ...suggested, ...draft};
    const own = {...savedVals, ...draft};
    const hasAnyValue = FUEL_FIELDS.some(k=>own[k]!=null && own[k]!=='');
    return {
      vehicle:v, period, savedId: saved?saved.id:null, savedVals, vals, price, suggested,
      dirty: FUEL_FIELDS.some(k=>draft[k]!==undefined),
      hasAnyValue, calc: computeFuelPreview(v, vals, price),
    };
  });
}
function renderFuel(){
  const period = appPeriod;
  const f = filters.fuel;
  const savedPrice = fuelPriceOf(period);
  const priceDirty = fuelPriceDraft.has(period);
  const price = priceDirty ? fuelPriceDraft.get(period) : savedPrice;
  const allRows = fuelRowsFor(period);
  const rows = f.driver ? allRows.filter(r=>driversOfVehicle(r.vehicle.plate).some(d=>d.code===f.driver)) : allRows;
  const unmanagedCount = state.vehicles.length - allRows.length;
  const dirtyCount = allRows.filter(r=>r.dirty).length + (priceDirty?1:0);
  const locked = isPeriodLocked(period);
  return `
    <div class="pagehead">
      <div><h1>Nhiên liệu</h1>
        <p>Theo dõi tiêu hao dầu và thưởng/phạt tiết kiệm cho xe khoán dầu.</p></div>
      ${allRows.length?`<div class="actions">${importButtons('fuel')}</div>`:''}
    </div>
    <div class="filterbar">
      <div class="field"><label for="fuel-price">Đơn giá dầu kỳ này (đ/lít)</label>
        ${moneyInputHtml('fuel-price', price||null, `style="width:130px;"${locked?' disabled':''}`, 'qty-input'+(priceDirty?' dirty':''))}</div>
      ${allRows.length?driverFilterField('f-driver', f.driver):''}
    </div>
    ${unmanagedCount?`<div class="hint" style="margin:-6px 0 14px;">${unmanagedCount} xe "Không khoán" không hiện ở đây — cấp dầu theo thực tế, không thưởng/phạt.</div>`:''}
    ${locked?`<div class="lockbox">${esc(lockedPeriodMsg(period))}</div>`:''}
    <div class="tablewrap"><table>
      <thead><tr><th>Xe</th><th>Lái xe phụ trách</th>
        <th class="num">Km đầu kỳ</th><th class="num">Km cuối kỳ</th>
        <th class="num">Tồn đầu (lít)</th><th class="num">Đổ trong kỳ (lít)</th><th class="num">Tồn cuối (lít)</th>
        <th class="num">Kết quả</th></tr></thead>
      <tbody>${rows.length ? rows.map(r=>renderFuelRow(r, locked)).join('')
        : `<tr><td colspan="8" class="empty">${f.driver?'Lái xe này không phụ trách xe nào khoán dầu.':'Chưa có xe nào đặt "Khoán dầu". Vào Cấu hình › Xe để bật.'}</td></tr>`}
      </tbody></table></div>
    ${allRows.length?`<div class="savebar">
      <button class="btn primary" id="fuel-save"${dirtyCount && !locked?'':' disabled'}>Lưu chấm nhiên liệu kỳ này</button>
      <span class="status${dirtyCount?' dirty':''}">${dirtyCount?`● ${dirtyCount} mục đang sửa chưa lưu`:'Đã lưu, không có thay đổi'}</span>
    </div>`:''}`;
}
function fuelFieldDirty(r, field){ const d = fuelDraft.get(fuelDraftKey(r.period, r.vehicle.plate)); return !!(d && d[field]!==undefined); }
function fuelNumInput(r, field, locked){
  const suggested = r.suggested && r.suggested[field]!==undefined;
  return `<input type="text" inputmode="decimal" id="fuel-${idSafe(r.vehicle.plate)}-${field}" class="qty-input${fuelFieldDirty(r,field)?' dirty':''}${suggested?' suggested':''}"
    data-fuel-plate="${esc(r.vehicle.plate)}" data-fuel-field="${field}" value="${r.vals[field]!=null?r.vals[field]:''}"${suggested?' title="Lấy từ cuối kỳ trước — sửa nếu khác"':''}${locked?' disabled':''}>`;
}
// 4 cột tính toán (Tổng km, Dầu định mức, Dầu thực tế, Tiết kiệm) gộp vào 1
// cột "Kết quả" — bảng cũ 12 cột, cột Thưởng/phạt bị đẩy khuất ngoài màn hình.
function renderFuelRow(r, locked){
  const v = r.vehicle;
  const c = r.calc;
  const result = r.hasAnyValue
    ? `<div class="strong">${fmtMoney(c.amount)} đ</div>
       <div class="muted fuel-calc">${fmtMoney(c.totalKm)} km · định mức ${fmtMoney(c.normFuel)} L · thực tế ${fmtMoney(c.actualFuel)} L · ${c.savedFuel>=0?'tiết kiệm':'vượt'} ${fmtMoney(Math.abs(c.savedFuel))} L</div>`
    : '<span class="muted">—</span>';
  return `<tr>
    <td><b>${esc(v.plate)}</b><div class="muted">${esc(v.fuelNorm)}L/100km</div></td>
    <td>${vehicleDriversLabel(v.plate)}</td>
    <td class="num">${fuelNumInput(r,'odoStart',locked)}</td>
    <td class="num">${fuelNumInput(r,'odoEnd',locked)}</td>
    <td class="num">${fuelNumInput(r,'stockStart',locked)}</td>
    <td class="num">${fuelNumInput(r,'purchased',locked)}</td>
    <td class="num">${fuelNumInput(r,'stockEnd',locked)}</td>
    <td class="num">${result}</td>
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
  if($('f-driver-text')){
    bindCombo('f-driver', driverComboOptions('Lái xe'));
    $('f-driver').onchange = e=>{ filters.fuel.driver = e.target.value; render(); };
  }
  $('fuel-price').oninput = e=>{
    const val = parseMoney(e.target.value);
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
    if(guardPeriodEdit([period+'-01'])) return;
    if(fuelPriceDraft.has(period) && fuelPriceDraft.get(period)==null){
      toast('Đơn giá dầu không được để trống.', 'danger');
      return;
    }
    btn.disabled = true;
    try{
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
        const vals = {...savedVals, ...fuelSuggestions(plate, period, savedVals, draft), ...draft};
        const data = { plate, period, ...Object.fromEntries(FUEL_FIELDS.map(k=>[k, safeNum(vals[k])])) };
        if(saved) await updateDoc('fuelLogs', saved.id, data); else await addDoc('fuelLogs', data);
        fuelDraft.delete(key);
      }
      toast('Đã lưu chấm nhiên liệu kỳ '+periodCaption(period));
      scheduleRender();
    }catch(e){
      toast('Lưu chấm nhiên liệu lỗi: '+((e&&e.message)||e), 'danger');
    }finally{
      btn.disabled = false;
    }
  };
}

/* =========================================================================
   MÀN HÌNH: KHẤU TRỪ (kỳ luôn suy ra từ ngày phát sinh)
   ========================================================================= */
function renderDeductions(){
  const f = filters.deduct;
  const list = state.deductions
    .filter(d=> (periodScopeAll || getPeriod(d.date)===appPeriod) && (!f.driver || d.driverCode===f.driver))
    .sort(byDateDesc);
  return `
    <div class="pagehead">
      <div><h1>Khấu trừ</h1><p>Ghi nhận các khoản trừ vào lương của từng lái xe.</p></div>
      <div class="actions">${importButtons('deduct')}<button class="btn primary" data-act="add">+ Thêm khoản khấu trừ</button></div>
    </div>
    <div class="filterbar">${driverFilterField('f-driver', f.driver)}</div>
    <div class="tablewrap"><table>
      <thead><tr><th>Ngày</th><th>Thuộc kỳ</th><th>Lái xe</th><th>Loại khoản</th><th>Lý do</th><th class="num">Số tiền</th><th></th></tr></thead>
      <tbody>${list.map(d=>`<tr>
        <td>${fmtDate(d.date)}</td><td class="muted">${esc(periodCaption(getPeriod(d.date)))}</td>
        <td>${esc(d.driverCode)}${driverByCode(d.driverCode)?' — '+esc(driverByCode(d.driverCode).name):' <span class="badge warn">?</span>'}</td>
        <td><span class="badge neutral">${esc(d.type)}</span></td><td>${esc(d.reason||'')}</td>
        <td class="num">${fmtMoney(d.amount)}</td><td>${isPeriodLocked(getPeriod(d.date))?'<span class="badge neutral" title="Kỳ đã chốt lương — không sửa/xoá được">Đã chốt</span>':rowActions(d.id)}</td></tr>`).join('')
        || `<tr><td colspan="7" class="empty">Chưa có khoản khấu trừ nào${periodScopeAll?'':' trong kỳ đang xem'}.</td></tr>`}
      </tbody></table></div>`;
}
function openDeductionModal(rec){
  const d = rec || { date: defaultEntryDate(null), type: DEDUCTION_TYPES[0] };
  openModal(`<h3>${rec?'Sửa khoản khấu trừ':'Thêm khoản khấu trừ'}</h3>
    <div class="modal-grid">
      ${ERROR_SLOT}
      <div class="modal-field"><label for="m-date">Ngày phát sinh *</label><input type="date" id="m-date" value="${esc(d.date||'')}"></div>
      <div class="modal-field"><label for="m-driver-text">Lái xe *</label>${comboField('m-driver', driverComboOptions('— Chọn —', null, true, d.driverCode), d.driverCode, 'Gõ mã hoặc tên lái xe…')}</div>
      <div class="modal-field"><label for="m-type">Loại khoản</label><select id="m-type">${selectOptions(DEDUCTION_TYPES, d.type)}</select></div>
      <div class="modal-field"><label for="m-amount">Số tiền (đ) *</label>${moneyInputHtml('m-amount', d.amount)}</div>
      <div class="modal-field full"><label for="m-reason">Lý do</label><input type="text" id="m-reason" value="${esc(d.reason||'')}"></div>
      <div class="full hint" id="m-period-hint"></div>
    </div>${MODAL_BUTTONS}`);
  const $ = id=>document.getElementById(id);
  bindCombo('m-driver', driverComboOptions('— Chọn —', null, true, d.driverCode));
  function showPeriod(){
    const p = getPeriod($('m-date').value);
    $('m-period-hint').innerHTML = p ? `Sẽ trừ vào kỳ lương <b>${esc(periodCaption(p))}</b>.` : '';
  }
  showPeriod();
  $('m-date').onchange = showPeriod;
  $('m-cancel').onclick = closeModal;
  $('m-save').onclick = async ()=>{
    const data = { date:$('m-date').value, driverCode:$('m-driver').value, type:$('m-type').value,
      amount:safeNum(readMoney('m-amount')), reason:$('m-reason').value.trim() };
    if(!data.date || !data.driverCode || !data.amount){ modalError('Cần nhập đủ: Ngày, Lái xe và Số tiền.'); return; }
    if(isPeriodLocked(getPeriod(data.date)) || (rec && isPeriodLocked(getPeriod(rec.date)))){
      modalError(lockedPeriodMsg(isPeriodLocked(getPeriod(data.date)) ? getPeriod(data.date) : getPeriod(rec.date))); return;
    }
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
  if(date && isPeriodLocked(getPeriod(date))) err('Ngày', lockedPeriodMsg(getPeriod(date)));
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
  bindCombo('f-driver', driverComboOptions('Lái xe'));
  document.getElementById('f-driver').onchange = e=>{ filters.deduct.driver = e.target.value; render(); };
  bindImportButtons('deduct', exportDeductTemplate, importDeductExcel);
  document.querySelector('[data-act="add"]').onclick = ()=>openDeductionModal(null);
  bindRowActions(
    id => openDeductionModal(state.deductions.find(x=>x.id===id)),
    async id => {
      const rec = state.deductions.find(x=>x.id===id);
      if(rec && guardPeriodEdit([rec.date])) return;
      if(confirm('Xoá khoản khấu trừ này?')){ await deleteDoc('deductions', id); toast('Đã xoá khoản khấu trừ.'); }
    }
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
      <div><h1>Danh sách lái xe</h1><p>Quản lý hồ sơ từng lái xe.</p></div>
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
      <div class="modal-field full"><label for="m-fixed">Mức lương cứng (đ/tháng)</label>${moneyInputHtml('m-fixed', d.fixedSalaryAmount)}</div>
      <div class="modal-field full"><label for="m-seniority">Phụ cấp thâm niên (đ/kỳ)</label>${moneyInputHtml('m-seniority', d.seniorityAllowance)}</div>
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
    const fixed = safeNum(readMoney('m-fixed'));
    if(hasFixed && !fixed){ modalError('Đã bật lương cứng thì cần nhập mức lương lớn hơn 0.'); return; }
    const seniority = readMoney('m-seniority');
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
  // Cập nhật driver đã có: cột để trống trong file thì GIỮ NGUYÊN giá trị cũ
  // (đúng như đã ghi rõ trong exportDriverTemplate/toast) thay vì reset về mặc định.
  const existing = code ? driverByCode(code) : null;
  const typeRaw = String(row['Loại lái xe']||'').trim();
  const driverType = typeRaw ? DRIVER_TYPES.find(t=>t.toLowerCase()===typeRaw.toLowerCase()) : (existing ? existing.driverType : DRIVER_TYPES[0]);
  if(typeRaw && !driverType) err('Loại lái xe', `"${typeRaw}" không hợp lệ.` + importHint(DRIVER_TYPES));
  const plateRaw = String(row['Biển số xe phụ trách']||'').trim();
  if(plateRaw && !vehicleByPlate(plateRaw)) err('Biển số xe phụ trách', `Biển số "${plateRaw}" không có trong danh sách xe.` + importHint(state.vehicles.map(v=>v.plate)));
  const plate = plateRaw ? plateRaw : (existing ? (existing.plate||null) : null);
  const statusRaw = String(row['Trạng thái']||'').trim();
  const status = statusRaw ? DRIVER_STATUS.find(s=>s.toLowerCase()===statusRaw.toLowerCase()) : (existing ? existing.status : DRIVER_STATUS[0]);
  if(statusRaw && !status) err('Trạng thái', `"${statusRaw}" không hợp lệ.` + importHint(DRIVER_STATUS));
  const fixedRaw = String(row['Lương cứng (Có/Không)']||'').trim();
  const hasFixedSalary = fixedRaw ? sheetYes(fixedRaw) : (existing ? !!existing.hasFixedSalary : false);
  const fixedAmountRaw = row['Mức lương cứng'];
  const fixedAmountFilled = fixedAmountRaw!=null && String(fixedAmountRaw).trim()!=='';
  const fixedSalaryAmount = hasFixedSalary
    ? (fixedAmountFilled ? safeNum(fixedAmountRaw) : (existing && existing.hasFixedSalary ? existing.fixedSalaryAmount : null))
    : null;
  if(hasFixedSalary && !fixedSalaryAmount) err('Mức lương cứng', 'Đã chọn "Có" lương cứng thì cần nhập mức lương lớn hơn 0.' + importHint(['9000000']));
  const phoneRaw = String(row['SĐT']||'').trim();
  const phone = phoneRaw ? phoneRaw : (existing ? (existing.phone||'') : '');
  if(errors.length) return { errors, data:null };
  return { errors:[], data:{ code, name, phone, driverType, plate, status, hasFixedSalary, fixedSalaryAmount } };
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
      const usedTrips = state.trips.filter(t=>t.driverCode===d.code).length;
      const usedDeductions = state.deductions.filter(x=>x.driverCode===d.code).length;
      const used = usedTrips || usedDeductions;
      const parts = [];
      if(usedTrips) parts.push(`${usedTrips} chuyến`);
      if(usedDeductions) parts.push(`${usedDeductions} khấu trừ`);
      const msg = used
        ? `Lái xe ${d.code} đang gắn với ${parts.join(', ')}. Xoá sẽ khiến các bản ghi đó thiếu thông tin lái xe.\nNên chuyển trạng thái sang "Đã nghỉ việc" thay vì xoá. Vẫn xoá?`
        : `Xoá lái xe ${d.code} — ${d.name}?`;
      if(!confirm(msg)) return;
      try{ await deleteDoc('drivers', id); toast('Đã xoá lái xe.'); }
      catch(e){ toast('Xoá lái xe lỗi: '+((e&&e.message)||e), 'danger'); }
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
      return String(v.plate).toLowerCase().includes(q)
        || drivers.some(d=>String(d.code).toLowerCase().includes(q) || String(d.name||'').toLowerCase().includes(q));
    });
  return `
    <div class="pagehead">
      <div><h1>Danh sách xe</h1><p>Quản lý hồ sơ từng xe.</p></div>
      <div class="actions">${importButtons('vehicle')}<button class="btn primary" data-act="add">+ Thêm xe</button></div>
    </div>
    <div class="filterbar">
      <div class="field grow"><input type="text" id="f-q" placeholder="Biển số hoặc lái xe phụ trách…" value="${esc(filters.vehicles.q)}"></div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Biển số</th><th class="num">Tải trọng</th><th>Loại xe</th><th>Sở hữu</th><th>Lái xe phụ trách</th>
        <th>Nhiên liệu</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>${list.map(v=>`<tr>
        <td><b>${esc(v.plate)}</b></td><td class="num">${v.capacity?esc(v.capacity)+' tấn':''}</td>
        <td>${esc(v.vehicleType||'')}</td><td>${esc(v.ownership||'')}</td>
        <td>${vehicleDriversLabel(v.plate)}</td>
        <td>${v.fuelManagement===FUEL_MANAGED?`Khoán ${v.fuelNorm?esc(v.fuelNorm)+' L/100km':''}`:'<span class="muted">Không khoán</span>'}</td>
        <td><span class="badge ${v.status==='Đang hoạt động'?'good':(v.status==='Ngừng chạy'?'danger':'neutral')}">${esc(v.status||'')}</span></td>
        <td>${rowActions(v.id)}</td></tr>`).join('') || `<tr><td colspan="8" class="empty">${q?'Không tìm thấy xe phù hợp.':'Chưa có xe nào.'}</td></tr>`}
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
      <div class="modal-field"><label for="m-status">Trạng thái</label><select id="m-status">${selectOptions(VEHICLE_STATUS, v.status)}</select></div>
      <div class="modal-field"><label for="m-fuelmgmt">Quản lý nhiên liệu</label><select id="m-fuelmgmt">${
        FUEL_MANAGEMENT_OPTS.map(o=>`<option value="${o.v}"${o.v===v.fuelManagement?' selected':''}>${esc(o.l)}</option>`).join('')}</select></div>
      <div class="modal-field" id="m-fuelnorm-wrap"><label for="m-fuelnorm">Định mức tiêu hao (lít/100km)</label><input type="number" id="m-fuelnorm" value="${v.fuelNorm!=null?v.fuelNorm:''}"></div>
      <div class="full hint">Xe khoán dầu mỗi kỳ vào mục Nhiên liệu chấm km + tồn/đổ dầu để tự tính thưởng/phạt tiết kiệm.</div>
    </div>${MODAL_BUTTONS}`);
  const $ = id=>document.getElementById(id);
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
const VEHICLE_IMPORT_HEADER = ['Biển số','Tải trọng (tấn)','Loại xe','Sở hữu','Trạng thái','Khoán dầu (Có/Không)','Định mức tiêu hao (lít/100km)'];
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
  // Cập nhật xe đã có: cột để trống trong file thì GIỮ NGUYÊN giá trị cũ
  // (đúng như đã ghi rõ trong exportVehicleTemplate/toast) thay vì reset về mặc định.
  const existing = plate ? vehicleByPlate(plate) : null;
  const ownRaw = String(row['Sở hữu']||'').trim();
  const ownership = ownRaw ? OWNERSHIP_OPTS.find(o=>o.toLowerCase()===ownRaw.toLowerCase()) : (existing ? existing.ownership : OWNERSHIP_OPTS[0]);
  if(ownRaw && !ownership) err('Sở hữu', `"${ownRaw}" không hợp lệ.` + importHint(OWNERSHIP_OPTS));
  const statusRaw = String(row['Trạng thái']||'').trim();
  const status = statusRaw ? VEHICLE_STATUS.find(s=>s.toLowerCase()===statusRaw.toLowerCase()) : (existing ? existing.status : VEHICLE_STATUS[0]);
  if(statusRaw && !status) err('Trạng thái', `"${statusRaw}" không hợp lệ.` + importHint(VEHICLE_STATUS));
  const fuelRaw = String(row['Khoán dầu (Có/Không)']||'').trim();
  const fuelManagement = fuelRaw ? (sheetYes(fuelRaw) ? FUEL_MANAGED : FUEL_UNMANAGED) : (existing ? existing.fuelManagement : FUEL_UNMANAGED);
  const fuelNormRaw = row['Định mức tiêu hao (lít/100km)'];
  const fuelNormFilled = fuelNormRaw!=null && String(fuelNormRaw).trim()!=='';
  const fuelNorm = fuelManagement===FUEL_MANAGED
    ? (fuelNormFilled ? safeNum(fuelNormRaw) : (existing && existing.fuelManagement===FUEL_MANAGED ? existing.fuelNorm : null))
    : null;
  if(fuelManagement===FUEL_MANAGED && !fuelNorm) err('Định mức tiêu hao (lít/100km)', 'Đã chọn "Khoán dầu" thì cần nhập định mức tiêu hao lớn hơn 0.' + importHint(['22']));
  const rawCap = row['Tải trọng (tấn)'];
  const capFilled = rawCap!=null && String(rawCap).trim()!=='';
  const capacity = capFilled ? safeNum(rawCap) : (existing ? (existing.capacity!=null?existing.capacity:null) : null);
  const vehicleTypeRaw = String(row['Loại xe']||'').trim();
  const vehicleType = vehicleTypeRaw ? vehicleTypeRaw : (existing ? (existing.vehicleType||'') : '');
  if(errors.length) return { errors, data:null };
  return { errors:[], data:{ plate, capacity, vehicleType, ownership,
    status, fuelManagement, fuelNorm } };
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
      const usedTrips = state.trips.filter(t=>t.plate===v.plate).length;
      const usedFuelLogs = state.fuelLogs.filter(f=>f.plate===v.plate).length;
      const used = usedTrips || usedFuelLogs;
      const parts = [];
      if(usedTrips) parts.push(`${usedTrips} chuyến`);
      if(usedFuelLogs) parts.push(`${usedFuelLogs} kỳ chấm nhiên liệu`);
      const msg = used
        ? `Xe ${v.plate} đang gắn với ${parts.join(', ')}. Vẫn xoá?`
        : `Xoá xe ${v.plate}?`;
      if(!confirm(msg)) return;
      try{ await deleteDoc('vehicles', id); toast('Đã xoá xe.'); }
      catch(e){ toast('Xoá xe lỗi: '+((e&&e.message)||e), 'danger'); }
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
  if(c.calcMethod==='route') return `<span class="muted">Xem ở Lương theo tuyến</span>${customerHasStandbyConfig(c)?'<br><span class="muted">Có cấu hình Lương trực</span>':''}`;
  return '<span class="muted">Xem lương cứng ở hồ sơ lái xe</span>';
}
function renderCustomers(){
  const q = filters.customers.q.trim().toLowerCase();
  const list = [...state.customers].sort((a,b)=> String(a.code).localeCompare(String(b.code)))
    .filter(c=>!q || String(c.code).toLowerCase().includes(q) || String(c.name).toLowerCase().includes(q));
  return `
    <div class="pagehead">
      <div><h1>Khách hàng</h1><p>Quản lý danh sách khách hàng và cách tính lương chuyến.</p></div>
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

  // Khách hàng MỚI (chưa có rec) chọn "Theo km" — cho sao chép nguyên cấu
  // hình (đơn giá tăng cường, phụ cấp đường dài, bậc thang km × tải trọng
  // xe) từ 1 khách hàng CŨ cùng cách tính, đỡ phải gõ lại từ đầu khi 2 khách
  // hàng dùng chung 1 bảng giá hoặc gần giống nhau — chọn xong vẫn sửa lại
  // thoải mái trước khi lưu, không đụng gì tới khách hàng gốc (đã clone qua
  // cloneKmConfig()/giá trị nguyên thuỷ, không giữ tham chiếu).
  function copyFromKmHtml(){
    if(rec) return '';
    const sources = state.customers.filter(x=>x.calcMethod==='km' && x.code!==c.code);
    if(!sources.length) return '';
    return `<div class="modal-field full"><label for="m-copy-from">Sao chép cấu hình từ khách hàng khác (Theo km)</label>
      <select id="m-copy-from"><option value="">— Không, tự nhập từ đầu —</option>
        ${sources.map(x=>`<option value="${esc(x.code)}">${esc(x.code)} — ${esc(x.name)}</option>`).join('')}</select>
      <div class="hint">Chọn 1 khách hàng đã cấu hình sẵn "Theo km" để sao chép đơn giá tăng cường, phụ cấp đường dài và bậc thang km × tải trọng xe — sau đó vẫn sửa lại thoải mái, không ảnh hưởng khách hàng gốc.</div></div>`;
  }
  function fieldsHtml(method){
    if(method==='km') return `
      ${copyFromKmHtml()}
      <div class="modal-field"><label for="m-surge-inner">Tăng cường — Nội thành (đ/chuyến)</label>${moneyInputHtml('m-surge-inner', c.surgeInnerAmount)}</div>
      <div class="modal-field"><label for="m-surge-outer">Tăng cường — Ngoại tỉnh, trong ngưỡng (đ/chuyến)</label>${moneyInputHtml('m-surge-outer', c.surgeOuterFlatAmount)}</div>
      <div class="modal-field"><label for="m-surge-cap">Ngưỡng km (vượt quá mới tra bậc thang km)</label><input type="number" id="m-surge-cap" value="${c.surgeOuterKmCap!=null?c.surgeOuterKmCap:200}"></div>
      <div class="full hint">Chuyến thường tra theo bậc thang km × tải trọng xe bên dưới, đúng Khu vực (Nội thành/Ngoại tỉnh) chọn trên từng chuyến. Chuyến tăng cường KHÔNG tra bậc thang đó mà theo Khu vực chọn trên chuyến: Nội thành trả cố định; Ngoại tỉnh trong ngưỡng km trả cố định; vượt ngưỡng thì tra ĐÚNG bảng bậc thang km × tải trọng xe bên dưới (theo đúng Khu vực Ngoại tỉnh) theo số km và tải trọng xe thực tế của chuyến.</div>
      <div class="modal-field"><label for="m-lh-5">Phụ cấp đường dài — xe ≤5 tấn (đ/tháng)</label>${moneyInputHtml('m-lh-5', c.longHaulUpTo5)}</div>
      <div class="modal-field"><label for="m-lh-8">Phụ cấp đường dài — xe ≤8 tấn (đ/tháng)</label>${moneyInputHtml('m-lh-8', c.longHaulUpTo8)}</div>
      <div class="modal-field"><label for="m-lh-15">Phụ cấp đường dài — xe ≤15 tấn (đ/tháng)</label>${moneyInputHtml('m-lh-15', c.longHaulUpTo15)}</div>
      <div class="modal-field full checkrow"><input type="checkbox" id="m-lh-fullday"${customerHasFullDayLongHaul(c)?' checked':''}><label for="m-lh-fullday">Cộng thêm cho mỗi ngày lái xe chạy TRỌN NGÀY cho khách hàng này</label></div>
      <div class="full hint">Để trống cả 3 ô nếu khách hàng này không áp dụng. Mỗi lần cộng = mức tháng theo tải trọng xe / ${LONG_HAUL_STANDARD_DAYS}, cộng ở 2 trường hợp:
        (1) mỗi chuyến tăng cường Ngoại tỉnh vượt ngưỡng km → cộng vào <b>Phụ cấp</b>;
        (2) nếu tick ô trên: mỗi ngày mọi chuyến của lái xe đều ghi khách hàng này (trừ Nghỉ) → cộng vào <b>Lương cố định</b>; ngày đó không cộng thêm khoản (1).</div>
      <div class="modal-field full"><label>Bậc thang km × tải trọng xe theo từng khu vực (chuyến thường)</label>${kmRegionsHtml()}</div>`;
    if(method==='tripPlusExtras') return `
      <div class="modal-field"><label for="m-loading">Đơn giá bốc xếp (đ/lượt) *</label>${moneyInputHtml('m-loading', c.loadingPrice)}</div>
      <div class="full hint">Lương chuyến = đơn giá theo Tuyến (cấu hình ở "Lương theo tuyến") + số lượt bốc xếp × đơn giá bốc xếp. Phụ cấp rớt điểm (theo tải trọng xe) tính riêng, áp dụng chung cho mọi khách hàng — xem ở ô "Số điểm giao" trên từng chuyến.</div>`;
    if(method==='fixed') return `<div class="full hint">Lái xe làm cho khách hàng này nhận lương cứng theo kỳ — đặt mức lương ở hồ sơ Lái xe (mục "Lương cứng"). Chuyến vẫn ghi nhận để theo dõi vận hành nhưng không cộng thêm lương.</div>`;
    if(method==='route'){
      // Hiện đúng mức Lương trực đang áp dụng (kể cả dữ liệu cũ còn nằm ở 3
      // ô Phụ cấp đường dài trước khi tách — xem standbyTiersFor).
      const tiers = standbyTiersFor(c);
      const st = cap => { const t = tiers.find(x=>x.upToCapacity===cap); return t ? t.amount : null; };
      return `
      <div class="full hint">Đơn giá từng tuyến của khách hàng này đặt ở mục "Lương theo tuyến".</div>
      <div class="modal-field"><label for="m-st-5">Lương trực — xe ≤5 tấn (đ/tháng)</label>${moneyInputHtml('m-st-5', st(5))}</div>
      <div class="modal-field"><label for="m-st-8">Lương trực — xe ≤8 tấn (đ/tháng)</label>${moneyInputHtml('m-st-8', st(8))}</div>
      <div class="modal-field"><label for="m-st-15">Lương trực — xe ≤15 tấn (đ/tháng)</label>${moneyInputHtml('m-st-15', st(15))}</div>
      <div class="full hint">Để trống cả 3 ô nếu khách hàng này không trả lương trực. Có cấu hình thì mỗi ngày lái xe có dòng Loại "Trực" ghi khách hàng này được cộng vào Lương cố định = mức tháng theo tải trọng xe / ${LONG_HAUL_STANDARD_DAYS} ngày.</div>`;
    }
    return `<div class="full hint">Đơn giá từng tuyến của khách hàng này đặt ở mục "Lương theo tuyến".</div>`;
  }
  function refreshFields(){
    const method = $('m-method').value;
    $('m-method-fields').innerHTML = fieldsHtml(method);
    setModalWide(method==='km');
    if(method==='km'){
      bindKmGrid();
      const copyFrom = $('m-copy-from');
      if(copyFrom) copyFrom.onchange = ()=>{
        const src = customerByCode(copyFrom.value);
        if(!src) return;
        c.surgeInnerAmount = src.surgeInnerAmount;
        c.surgeOuterFlatAmount = src.surgeOuterFlatAmount;
        c.surgeOuterKmCap = src.surgeOuterKmCap;
        c.longHaulUpTo5 = src.longHaulUpTo5;
        c.longHaulUpTo8 = src.longHaulUpTo8;
        c.longHaulUpTo15 = src.longHaulUpTo15;
        c.longHaulFullDay = customerHasFullDayLongHaul(src);
        kmDraftLocal.regions = cloneKmConfig(src).regions;
        refreshFields();
        const kept = $('m-copy-from'); if(kept) kept.value = copyFrom.value; // refreshFields() vẽ lại select, giữ nguyên lựa chọn vừa chọn
        toast(`Đã sao chép cấu hình từ ${src.code} — vẫn sửa lại thoải mái trước khi lưu.`);
      };
    }
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
      data.surgeInnerAmount = readMoney('m-surge-inner');
      data.surgeOuterFlatAmount = readMoney('m-surge-outer');
      data.surgeOuterKmCap = $('m-surge-cap').value==='' ? null : safeNum($('m-surge-cap').value);
      data.longHaulUpTo5 = readMoney('m-lh-5');
      data.longHaulUpTo8 = readMoney('m-lh-8');
      data.longHaulUpTo15 = readMoney('m-lh-15');
      data.longHaulFullDay = $('m-lh-fullday').checked;
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
      const loading = safeNum(readMoney('m-loading'));
      if(!loading){ modalError('Cần nhập đơn giá bốc xếp lớn hơn 0.'); return; }
      data.loadingPrice = loading;
    }else if(method==='route'){
      // Lương trực lưu ở 3 ô RIÊNG; xoá 3 ô Phụ cấp đường dài (chỉ dùng cho
      // khách "Theo km") để đổi cách tính sau này không bị lẫn 2 khoản.
      data.standbyUpTo5 = readMoney('m-st-5');
      data.standbyUpTo8 = readMoney('m-st-8');
      data.standbyUpTo15 = readMoney('m-st-15');
      data.longHaulUpTo5 = null; data.longHaulUpTo8 = null; data.longHaulUpTo15 = null;
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
      const usedTrips = state.trips.filter(t=>t.project===c.code).length;
      const usedRoutes = state.routes.filter(r=>r.project===c.code).length;
      const used = usedTrips || usedRoutes;
      const parts = [];
      if(usedTrips) parts.push(`${usedTrips} chuyến`);
      if(usedRoutes) parts.push(`${usedRoutes} tuyến giá`);
      const msg = used
        ? `Khách hàng ${c.code} đang gắn với ${parts.join(', ')}. Xoá sẽ khiến các bản ghi đó không tra được cách tính lương. Vẫn xoá?`
        : `Xoá khách hàng ${c.code} — ${c.name}?`;
      if(!confirm(msg)) return;
      try{ await deleteDoc('customers', id); toast('Đã xoá khách hàng.'); }
      catch(e){ toast('Xoá khách hàng lỗi: '+((e&&e.message)||e), 'danger'); }
    }
  );
}

/* =========================================================================
   CẤU HÌNH: LƯƠNG THEO TUYẾN
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
      <div><h1>Lương theo tuyến</h1>
        <p>Quản lý đơn giá từng tuyến đường theo khách hàng.</p></div>
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
    <td class="num"><input type="text" inputmode="numeric" id="${eid('price')}" class="qty-input${cls('price')}"
      data-route-key="${esc(r.key)}" data-route-field="price" value="${r.price!=null?fmtMoney(r.price):''}"></td>
    <td class="num"><input type="text" inputmode="numeric" id="${eid('surchargePrice')}" class="qty-input${cls('surchargePrice')}"
      data-route-key="${esc(r.key)}" data-route-field="surchargePrice" value="${r.surchargePrice!=null?fmtMoney(r.surchargePrice):''}" placeholder="= giá thường"></td>
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
  // Kiểm trùng TRONG TỪNG khách hàng — 2 khách khác nhau có cùng tên tuyến
  // (VD cùng "Kho A → Kho B") là hợp lệ; trước đây ở chế độ xem tất cả khách
  // hàng bị báo trùng nhầm, không lưu được.
  const seen = new Map();
  all.forEach(r=>{ const n = String(r.route).trim(); if(n){ const k = r.project+'|'+n; seen.set(k, (seen.get(k)||0)+1); } });
  const dup = [...seen.entries()].find(([,n])=>n>1);
  if(dup){
    const [proj, name] = [dup[0].slice(0, dup[0].indexOf('|')), dup[0].slice(dup[0].indexOf('|')+1)];
    toast(`Tuyến "${name}" của ${proj} bị trùng ${dup[1]} dòng — mỗi tuyến chỉ để một dòng.`, 'danger'); return;
  }

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
  try{
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
  }catch(e){
    toast('Lưu bảng giá lỗi: '+((e&&e.message)||e), 'danger');
  }finally{
    btn.disabled = false;
  }
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
      let val;
      if(ROUTE_TEXT_FIELDS.includes(field)){
        val = input.value;
      }else{
        // Tự định dạng dấu chấm phân cách hàng nghìn NGAY KHI ĐANG GÕ (gõ
        // "400000" tự hiện "400.000") — bóc hết ký tự không phải số (kể cả
        // dấu chấm cũ vừa tự chèn) rồi chèn lại đúng vị trí. Giá trị LƯU vào
        // bản nháp vẫn là số thuần (digits), không phải chuỗi đã có dấu chấm.
        const digits = digitsOnly(input.value);
        input.value = digits ? Number(digits).toLocaleString('vi-VN') : '';
        val = digits ? Number(digits) : null;
      }
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
   dụng (0đ) cho lái xe thuộc dự án đó. MỌI loại đều áp dụng tự động theo
   ĐÚNG dự án lái xe thực chạy trong kỳ (xem Chuyến đi), không còn bước tick
   gán riêng từng lái xe (xem calcPhuCap).
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
    case 'perTripByKmCapacity': return { l:'Theo km', c:'teal' };
    case 'perTrip': return { l:'Theo chuyến', c:'violet' };
    case 'perOccurrence':
    case 'perOccurrenceByProject': return { l:'Theo giờ', c:'pink' };
    case 'perPeriod':
    case 'perPeriodMinDays':
    case 'perProratedMonth': return { l:'Theo tháng', c:'solid' };
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
      <div><h1>Phụ cấp</h1><p>Quản lý các loại phụ cấp và đơn giá theo từng khách hàng.</p></div>
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
      ? 'Áp dụng theo đúng dự án lái xe thực chạy trong kỳ, khớp bảng đơn giá bên dưới — số ngày công tự động đếm theo số ngày có chuyến trong "Lịch lái xe", không cần chấm công tay.'
      : unit==='perTripByKmCapacity'
        ? 'Áp dụng cho mọi lái xe có chuyến của đúng khách hàng đã chọn — tính riêng từng chuyến theo số km và tải trọng xe.'
      : unitNeedsManualUsage(unit)
        ? 'Áp dụng theo dự án chạy nhiều ngày nhất của lái xe trong kỳ, khớp bảng đơn giá bên dưới, nhưng mỗi kỳ vẫn phải vào "Chấm công phụ cấp" nhập số giờ/lần phát sinh (không tự đếm được).'
        : 'Áp dụng theo đúng dự án lái xe thực chạy trong kỳ, khớp bảng đơn giá bên dưới.';
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
  // "Phục hồi" ghi thẳng vào localStorage — chỉ có ý nghĩa khi app đang ĐỌC
  // từ localStorage (bản offline, hoặc tạm lưu máy này khi chưa kết nối được).
  const canRestore = storageMode === 'fallback' || storageMode === 'local';
  const hasLegacyLocalData = Object.keys(lsLoadAll()).length>0;
  const backupNote = {
    local: 'Bản offline lưu dữ liệu trong trình duyệt máy này — xoá dữ liệu duyệt web là mất. Tải file sao lưu sau mỗi kỳ chốt lương.',
    fallback: 'Chưa kết nối được dữ liệu dùng chung, đang tạm lưu trong trình duyệt máy này. Tải file sao lưu để không mất dữ liệu.',
    cloud: 'Dữ liệu đang lưu dùng chung trên claude.ai. Tải file sao lưu để giữ thêm 1 bản ngoài hệ thống sau mỗi kỳ chốt lương.',
    supabase: 'Dữ liệu đang lưu trên database Supabase của công ty. Tải file sao lưu để giữ thêm 1 bản ngoài hệ thống sau mỗi kỳ chốt lương.',
  }[storageMode] || '';
  const rule = (k, v) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`;
  return `
    <div class="pagehead"><div><h1>Hướng dẫn sử dụng</h1>
      <p>Thanh bên trái xếp theo đúng thứ tự công việc: cấu hình một lần → nhập liệu hằng ngày → chốt lương cuối kỳ. Bấm vào từng mục bên dưới để mở.</p></div></div>

    <div class="panel">
      <h3>Mỗi kỳ lương làm 4 bước</h3>
      <ol class="guide-steps">
        <li>Chọn kỳ ở ô <b>Kỳ lương đang xem</b> (thanh bên trái) — mọi màn hình đều theo kỳ này.</li>
        <li>Nhập đủ <b>Lịch lái xe</b>, <b>Khấu trừ</b>, <b>Nhiên liệu</b> (xe khoán dầu), <b>Chấm công phụ cấp</b> (phụ cấp nhập tay).</li>
        <li>Vào <b>Bảng lương</b>: xử lý hết cảnh báo đầu trang và các dòng có dấu ⚠, mở từng dòng để đối soát.</li>
        <li>Bấm <b>Chốt kỳ này</b>, rồi <b>Xuất Excel</b> (4 sheet: bảng lương, chi tiết chuyến, phụ cấp, khấu trừ) hoặc CSV.</li>
      </ol>
    </div>

    <details class="panel guide-sec" open>
      <summary>Quy tắc tính lương đang áp dụng</summary>
      <div class="tablewrap"><table class="guide-rules"><tbody>
        ${rule('Thực nhận', 'Lương cố định + Lương chuyến (gồm Tăng cường) + Phụ cấp + Thưởng/phạt nhiên liệu − Khấu trừ, làm tròn đến đồng.')}
        ${rule('Kỳ lương', 'Tháng dương lịch, mùng 1 → ngày cuối tháng. Chuyến và khấu trừ thuộc kỳ theo ngày ghi trên đó.')}
        ${rule('Lương cứng', `Mức đặt ở hồ sơ lái xe × số ngày có chuyến trong kỳ (mọi loại trừ Nghỉ) / ${FIXED_SALARY_STANDARD_DAYS}, tối đa ${FIXED_SALARY_STANDARD_DAYS} ngày. Cộng vào Lương cố định.`)}
        ${rule('Lương chuyến', 'Theo cách tính của khách hàng: <b>Theo tuyến</b> — đơn giá tuyến (chuyến Tăng cường dùng đơn giá tăng cường nếu có); <b>Theo km</b> — bậc thang km × tải trọng xe đúng Khu vực; <b>Theo chuyến + bốc xếp</b> — đơn giá tuyến + số lượt bốc xếp × đơn giá bốc xếp; <b>Lương cứng</b> — 0đ. Loại Trả hàng, Trực, Trả điểm, Nghỉ luôn 0đ tiền chuyến.')}
        ${rule('Tăng cường (khách Theo km)', 'Nội thành: mức cố định. Ngoại tỉnh trong ngưỡng km: mức cố định; vượt ngưỡng: tra bậc thang km × tải trọng của khối Ngoại tỉnh.')}
        ${rule('Phụ cấp đường dài (khách Theo km)', `Mức tháng theo tải trọng xe / ${LONG_HAUL_STANDARD_DAYS}, cộng ở 2 trường hợp: (1) mỗi chuyến tăng cường Ngoại tỉnh vượt ngưỡng km → cộng vào Phụ cấp; (2) khách bật ô "theo ngày chạy trọn" (mặc định NTF): mỗi ngày mọi dòng của lái xe (trừ Nghỉ, kể cả Trực/Trả hàng/Trả điểm) đều ghi khách đó → cộng vào Lương cố định, ngày đó không cộng thêm (1).`)}
        ${rule('Lương trực (khách Theo tuyến)', `Mức tháng theo tải trọng xe / ${LONG_HAUL_STANDARD_DAYS} cho mỗi ngày lái xe có dòng Loại Trực ghi khách đó. Cộng vào Lương cố định, không phụ thuộc lái xe có lương cứng hay không.`)}
        ${rule('Phụ cấp rớt điểm', 'Mọi khách hàng. Điểm giao đầu tiên không tính, từ điểm thứ 2: xe đến 1,9 tấn 20.000đ/điểm; đến 5 tấn 30.000đ/điểm; trên 5 tấn 50.000đ/điểm. Ghi bằng ô "Số điểm giao" trên chuyến chính HOẶC mỗi điểm thêm 1 dòng Trả điểm — gộp theo ngày + khách hàng, ghi cả 2 cách thì lấy số lớn hơn, không cộng trùng.')}
        ${rule('Phụ cấp khác', 'Đơn giá riêng theo từng khách hàng ở Cấu hình › Phụ cấp, tính theo khách hàng lái xe thực chạy trong kỳ (khách để trống = không áp dụng). Cố định theo kỳ: 1 lần cho mỗi khách có chạy. Theo chuyến: số dòng chuyến (trừ Nghỉ). Theo ngày công: số ngày có chuyến. Vượt số ngày tối thiểu: hơn N ngày thì nhận trọn. Theo tỷ lệ ngày công: mức × số ngày / ngày chuẩn, tối đa 100%. Theo tải trọng xe: theo xe đang gán cho lái xe. Theo lần phát sinh: nhập ở Chấm công phụ cấp.')}
        ${rule('Mốc tải trọng', '"X tấn" nghĩa là xe <b>đến</b> X tấn. Bậc thang km và phụ cấp theo tải trọng: dùng mốc nhỏ nhất ≥ tải trọng xe (VD mốc 1,9/5/8, xe 3,5T dùng mốc 5T); xe nặng hơn mốc cao nhất hoặc chưa nhập tải trọng → báo thiếu giá. Rớt điểm, Lương trực, Phụ cấp đường dài: xe nặng hơn mốc cao nhất dùng mốc cao nhất.')}
        ${rule('Nhiên liệu (xe Khoán dầu)', 'Thưởng/phạt = (Tổng km × Định mức / 100 − Dầu thực tế) × Đơn giá dầu của kỳ. Dầu thực tế = Tồn đầu + Đổ trong kỳ − Tồn cuối. Âm là chạy vượt định mức, trừ vào lương của lái xe đang gán xe đó. Xe Không khoán không thưởng/phạt.')}
        ${rule('Chốt kỳ', 'Bảng lương kỳ đã chốt được giữ nguyên như lúc chốt, sửa cấu hình (giá tuyến, xe, phụ cấp) sau đó không làm đổi. Chuyến, khấu trừ, nhiên liệu, chấm công của kỳ đó bị khoá đến khi Mở chốt (tài khoản admin).')}
        ${rule('Lái xe đã nghỉ việc', 'Không hiện trong Bảng lương nếu kỳ đó không phát sinh chuyến, khấu trừ hay thưởng/phạt; không hiện trong ô chọn khi nhập chuyến/khấu trừ mới.')}
      </tbody></table></div>
    </details>

    <details class="panel guide-sec">
      <summary>1. Cấu hình (làm một lần, sửa khi chính sách đổi)</summary>
      <ul>
        <li><b>Khách hàng</b>: mỗi khách 1 cách tính — Theo tuyến (GHN, BEST…), Theo km (NTF), Lương cứng (GS, SEWS), Theo chuyến + bốc xếp (SGW, BHX). Khách Theo km: bảng bậc thang có 2 khối Nội thành/Ngoại tỉnh (dùng 1 khối thì để trống khối kia), mỗi khối gồm các mốc tải trọng (cột) và khoảng km (dòng); để trống "Khoảng km (đến)" = không giới hạn. Khách Theo tuyến có thể đặt 3 mức Lương trực.</li>
        <li><b>Xe</b>: nhập đúng <b>Tải trọng (tấn)</b> — dùng cho giá km, phụ cấp rớt điểm, Lương trực, Phụ cấp đường dài và phụ cấp theo tải trọng. Xe Khoán dầu nhập thêm định mức lít/100km.</li>
        <li><b>Lái xe</b>: chọn xe phụ trách (nhiều lái xe có thể chọn chung 1 xe theo ca), bật Lương cứng nếu khách trả thẳng cho lái xe, nhập Phụ cấp thâm niên nếu có (nhận trọn mỗi kỳ).</li>
        <li><b>Lương theo tuyến</b>: chọn khách hàng rồi gõ từng dòng — Tên tuyến (tên gọi nội bộ, không bắt buộc), Tuyến đường dạng "Điểm đi → Điểm đến" (đây là khoá tra giá), đơn giá, đơn giá tăng cường (trống = như giá thường), rồi bấm Lưu bảng giá. Đổi Tuyến đường đang có chuyến dùng thì các chuyến đó đổi theo. Khách Theo km cũng đặt được vài tuyến giá cố định ở đây.</li>
        <li><b>Phụ cấp</b>: tạo loại phụ cấp, chọn đơn vị tính, nhập đơn giá cho từng khách hàng áp dụng. Không cần gán cho từng lái xe.</li>
        <li>Có sẵn danh sách trong Excel: <b>Tải mẫu Excel</b> → điền → <b>Nhập từ Excel</b>. Mã lái xe/biển số đã có thì cập nhật, mã mới thì thêm.</li>
      </ul>
    </details>

    <details class="panel guide-sec">
      <summary>2. Nhập liệu hằng ngày</summary>
      <ul>
        <li><b>Lịch lái xe</b>: chọn Loại chuyến trước — các ô bên dưới tự đổi theo loại và theo cách tính của khách hàng. Chọn lái xe thì xe tự điền. Ngày mặc định lấy theo kỳ đang xem. Dùng <b>Lưu &amp; thêm tiếp</b> để nhập nhanh nhiều chuyến.
          <ul>
            <li><b>Chuyến</b>: chuyến thường. <b>Tăng cường</b>: chạy ngoài dự án thường ngày, dùng đơn giá tăng cường.</li>
            <li><b>Trả hàng</b>: hôm sau đi trả nốt hàng của chuyến hôm trước (tiền đã tính ở chuyến gốc). <b>Trả điểm</b>: 1 điểm giao thêm của chuyến chính cùng ngày/xe/khách.</li>
            <li><b>Trực</b>: lái xe trực, không chạy chuyến — có Lương trực nếu khách hàng có cấu hình. <b>Nghỉ</b>: xe không hoạt động, không tính ngày công, không tính khoản nào.</li>
          </ul></li>
        <li><b>Khấu trừ</b>: nhập khi phát sinh, kỳ lương tự suy ra từ ngày phát sinh.</li>
        <li><b>Nhiên liệu</b>: mỗi kỳ nhập đơn giá dầu, rồi với từng xe khoán dầu nhập km công tơ mét và dầu tồn/đổ. Km đầu kỳ và Tồn đầu kỳ tự lấy từ cuối kỳ trước (chữ nghiêng) — sửa nếu khác.</li>
        <li><b>Chấm công phụ cấp</b>: nhập số lần/số giờ cho phụ cấp nhập tay (Tăng ca, Ca đêm…). Phụ cấp theo ngày công tự đếm, chỉ để xem.</li>
        <li><b>Nhập từ Excel</b>: Lịch lái xe và Khấu trừ kiểm tra từng dòng rồi mở bảng soát — dòng lỗi tô vàng, sửa ngay trên bảng. Dòng trùng hệt 1 chuyến đã có bị chặn (đúng là chạy thêm lượt thì điền Mã chuyến riêng); Loại chuyến gõ sai bị báo lỗi.</li>
        <li>Ô chọn danh sách dài (lái xe, xe, khách hàng, tuyến) gõ được để tìm, dùng ↑↓ và Enter. Xoá trống ô rồi bấm ra ngoài = bỏ chọn.</li>
      </ul>
    </details>

    <details class="panel guide-sec">
      <summary>3. Chốt lương cuối kỳ</summary>
      <ul>
        <li>Cảnh báo đầu trang Bảng lương chỉ tính dữ liệu của kỳ đang xem (cộng cảnh báo cấu hình chung). Bấm từng dòng cảnh báo để mở đúng chỗ cần sửa.</li>
        <li>Mở từng dòng lái xe để xem chi tiết Lương cố định, chuyến, phụ cấp, nhiên liệu, khấu trừ. Cột Biển kiểm soát hiện các xe lái xe thực chạy trong kỳ.</li>
        <li><b>Chốt kỳ này</b>: lưu lại bảng lương và khoá dữ liệu của kỳ. Cần sửa thì admin bấm <b>Mở chốt kỳ</b> — bảng lương sẽ tính lại theo dữ liệu hiện tại.</li>
        <li>Xuất file khi kỳ chưa chốt mà còn cảnh báo sẽ được hỏi lại trước.</li>
      </ul>
    </details>

    <details class="panel guide-sec">
      <summary>Khách hàng NTF (tính theo km)</summary>
      <ul>
        <li><b>Chuyến thường</b>: nhập Số km (bắt buộc), chọn Khu vực nếu NTF có cấu hình cả 2 khối — hệ thống tra bậc thang km × tải trọng xe.</li>
        <li><b>Tăng cường</b>: luôn chọn Khu vực. Nội thành trả cố định; Ngoại tỉnh trong ngưỡng (mặc định 200km) trả cố định, vượt ngưỡng tra bậc thang km của khối Ngoại tỉnh và cộng Phụ cấp đường dài.</li>
        <li>Chạy đúng tuyến giá cố định (VD "Trung chuyển kho Nutifood" ở Lương theo tuyến): chọn Tuyến đường đó, lấy giá tuyến, không cần Số km.</li>
        <li><b>Ngày chạy trọn NTF</b>: mọi dòng trong ngày (trừ Nghỉ) đều ghi NTF thì cộng Phụ cấp đường dài theo tải trọng / ${LONG_HAUL_STANDARD_DAYS} vào Lương cố định. Ngày có xen khách khác thì không tính khoản này; từng chuyến vẫn tính theo giá của khách hàng đó.</li>
        <li><b>Phụ cấp ăn Nutifood</b> (nếu đã cấu hình): tính theo từng chuyến loại Chuyến (km × tải trọng), không tính Tăng cường/Trả hàng/Trực/Trả điểm/Nghỉ và chuyến chạy tuyến giá cố định.</li>
      </ul>
    </details>

    <div class="panel">
      <h3>Sao lưu dữ liệu</h3>
      <p class="muted" style="margin:0 0 10px;">${esc(backupNote)}</p>
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
   ĐĂNG NHẬP: gắn sự kiện form + hiện/ẩn màn hình đăng nhập, hiện email/nút
   đăng xuất ở topbar khi đã đăng nhập. CHỈ áp dụng khi SUPABASE_ENABLED —
   chạy offline (localStorage) hoặc qua claude.ai thì bỏ qua hoàn toàn, vào
   thẳng app như trước (2 chế độ đó vốn không có khái niệm nhiều người dùng
   chung 1 database thật cần phân quyền).
   ========================================================================= */
function showAuthGate(){
  document.getElementById('authOverlay').hidden = false;
}
function hideAuthGate(){
  document.getElementById('authOverlay').hidden = true;
}
function renderAuthBadge(){
  const userEl = document.getElementById('topbar-user');
  const logoutBtn = document.getElementById('btn-logout');
  if(!Auth.isLoggedIn()){ userEl.hidden = true; logoutBtn.hidden = true; return; }
  const profile = Auth.getProfile();
  userEl.textContent = Auth.currentEmail() + (profile && profile.role==='admin' ? ' · Admin' : '');
  userEl.hidden = false;
  logoutBtn.hidden = false;
}
document.getElementById('authForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const errEl = document.getElementById('authError');
  const btn = document.getElementById('authSubmit');
  errEl.hidden = true;
  btn.disabled = true; btn.textContent = 'Đang đăng nhập…';
  try{
    await Auth.signIn(document.getElementById('authEmail').value.trim(), document.getElementById('authPassword').value);
    hideAuthGate();
    renderAuthBadge();
    appPeriod = todayPeriod();
    render();
    initStorage();
  }catch(err){
    errEl.textContent = /invalid.*credentials/i.test(err.message||'') ? 'Sai email hoặc mật khẩu.' : (err.message || 'Đăng nhập lỗi.');
    errEl.hidden = false;
  }finally{
    btn.disabled = false; btn.textContent = 'Đăng nhập';
  }
});
document.getElementById('btn-logout').onclick = async ()=>{
  if(!confirm('Đăng xuất khỏi hệ thống?')) return;
  await Auth.signOut();
  location.reload();
};

/* =========================================================================
   KHỞI ĐỘNG
   ========================================================================= */
if(SUPABASE_ENABLED && !Auth.isLoggedIn()){
  showAuthGate();
}else{
  appPeriod = todayPeriod();
  if(SUPABASE_ENABLED){
    renderAuthBadge();
    // Không chặn màn hình đầu tiên chờ tải hồ sơ quyền — tải xong tự vẽ lại
    // (renderNav() đọc Auth.isAdmin() mỗi lần vẽ) để mục "Người dùng" hiện
    // ra ngay khi có, không cần bấm gì thêm.
    Auth.loadProfile().catch(()=>{}).then(()=>{ renderAuthBadge(); scheduleRender(); });
  }
  render();
  initStorage();
}

/* =============================================================================
   GIAO DIỆN — dựng khung "clean SaaS dashboard" cho index.html (body.ui2)
   -----------------------------------------------------------------------------
   KHÔNG chứa logic tính lương / dữ liệu. Phần này chỉ:
     1. Vẽ lại menu (danh sách phẳng, icon nét mảnh).
     2. Sau MỖI lần render(), dựng lại phần nội dung:
        - nút ở đầu trang có icon và được chuyển lên thanh trên cùng,
        - bộ lọc + bảng gom vào 1 "card danh sách" (bộ lọc ở đầu card),
        - phân trang ở cuối card (chọn số dòng mỗi trang),
        - cột Sửa/Xoá gom vào nút "⋯".
     3. Thanh trên cùng: tìm kiếm, kỳ lương, nút thao tác của trang, chuông, người dùng.
     4. Thẻ trạng thái kỳ lương ở đáy sidebar.
   Mọi nút gốc được DI CHUYỂN (không tạo mới) nên sự kiện vẫn chạy y như cũ.
   ============================================================================= */
(function(){
  'use strict';
  // Trang không dùng khung giao diện này (VD bản Artifact) → bỏ qua
  if(!document.body || !document.body.classList.contains('ui2') || !document.getElementById('tb-actions')) return;

  /* ---------------- Icon nét mảnh (bộ Lucide, 24×24, nét 1.75) ---------------- */
  const ICONS = {
    search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    chevronDown:'<path d="m6 9 6 6 6-6"/>',
    chevronLeft:'<path d="m15 18-6-6 6-6"/>',
    chevronRight:'<path d="m9 18 6-6-6-6"/>',
    plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
    collapse:'<path d="M3 19V5"/><path d="m13 6-6 6 6 6"/><path d="M7 12h14"/>',
    expand:'<path d="M21 5v14"/><path d="m11 18 6-6-6-6"/><path d="M17 12H3"/>',
    menu:'<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    wallet:'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    truck:'<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
    clipboard:'<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    fuel:'<path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
    minusCircle:'<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    idCard:'<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>',
    bus:'<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
    building:'<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
    route:'<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
    coins:'<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    userCog:'<circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m21.7 16.4-.9-.3"/><path d="m15.2 13.9-.9-.3"/><path d="m16.6 18.7.3-.9"/><path d="m19.1 12.2.3-.9"/><path d="m19.6 18.7-.4-1"/><path d="m16.8 12.3-.4-1"/><path d="m14.3 16.6 1-.4"/><path d="m20.7 13.8 1-.4"/>',
    help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    sheet:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
    more:'<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    lock:'<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    unlock:'<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
    pencil:'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    trash:'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    save:'<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    fileText:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  };
  function icon(name, size){
    const s = size || 16;
    return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||''}</svg>`;
  }

  const NAV_ICON = {
    payroll:'wallet', trips:'truck', allowanceUsage:'clipboard', fuel:'fuel', deductions:'minusCircle',
    'cfg-drivers':'idCard', 'cfg-vehicles':'bus', 'cfg-customers':'building', 'cfg-routes':'route',
    'cfg-allowance':'coins', 'cfg-users':'userCog', guide:'help',
  };
  // Tiêu đề của card danh sách theo từng trang (chữ "Lists" trong mẫu).
  const LIST_TITLE = {
    payroll:'Danh sách lái xe', trips:'Danh sách chuyến', allowanceUsage:'Chấm công theo lái xe', fuel:'Xe khoán dầu',
    deductions:'Danh sách khoản trừ', 'cfg-drivers':'Danh sách lái xe', 'cfg-vehicles':'Danh sách xe',
    'cfg-customers':'Danh sách khách hàng', 'cfg-routes':'Bảng giá', 'cfg-allowance':'Phụ cấp theo khách hàng',
    'cfg-users':'Tài khoản',
  };

  /* ---------------- 1. Menu: danh sách phẳng ---------------- */
  window.renderNav = function(){
    const items = NAV.flatMap(g=>g.items).filter(it=>!it.adminOnly || Auth.isAdmin());
    document.getElementById('navroot').innerHTML = `<div class="navlist">${items.map(it=>
      `<button class="navitem${currentSection===it.id?' active':''}" data-nav="${it.id}" title="${esc(it.label)}">
        ${icon(NAV_ICON[it.id]||'help', 18)}<span>${esc(it.label)}</span>
      </button>`).join('')}</div>`;
  };

  /* ---------------- 2. Dựng lại nội dung sau mỗi lần app.js vẽ ---------------- */
  const originalRender = window.render;
  window.render = function(){
    closeRowMenu();
    // Ô lọc trên thanh trên đang được gõ → nhớ lại để vẽ xong đặt con trỏ về
    // đúng chỗ (app.js chỉ tự giữ ô đang gõ khi ô đó nằm trong #main).
    const keep = rememberTopbarFocus();
    // Bỏ nút/ô lọc của trang cũ khỏi thanh trên TRƯỚC khi app.js vẽ lại: app.js
    // gắn sự kiện bằng document.querySelector('[data-act="add"]'), $('f-q')…
    // — nếu phần tử cũ còn nằm trên thanh (đứng trước #main) sẽ bắt nhầm.
    closeDocMenu();
    ['tb-actions','tb-filters','tb-extra'].forEach(id=>{ const s = document.getElementById(id); if(s) s.replaceChildren(); });
    originalRender();
    try{ enhanceMain(); }catch(e){ console.error('[giao diện mới] dựng trang lỗi', e); }
    try{ moveToTopbar(); }catch(e){ console.error('[giao diện mới] chuyển lên thanh trên lỗi', e); }
    try{ restoreTopbarFocus(keep); }catch(e){}
    try{ refreshChrome(); }catch(e){ console.error('[giao diện mới] thanh trên lỗi', e); }
  };

  function rememberTopbarFocus(){
    const a = document.activeElement;
    if(!a || !a.id || !a.closest('#tb-filters')) return null;
    const isCombo = a.classList.contains('combo-input');
    if(isCombo){
      // combo: chỉ giữ khi danh sách gợi ý đang mở (đang gõ tìm, chưa chọn xong)
      const list = a.id.endsWith('-text') ? document.getElementById(a.id.slice(0,-5)+'-list') : null;
      if(!list || list.hidden) return null;
    }
    const text = a.type==='text' || a.type==='search';
    return { id:a.id, value:a.value, isCombo, caret: text ? a.selectionStart : null };
  }
  function restoreTopbarFocus(k){
    if(!k) return;
    const el = document.getElementById(k.id);
    if(!el) return;
    if(k.isCombo){ el.value = k.value; el.focus(); el.dispatchEvent(new Event('input', {bubbles:true})); }
    else el.focus();
    if(k.caret!=null && el.setSelectionRange){ try{ el.setSelectionRange(k.caret, k.caret); }catch(e){} }
  }

  // Lên thanh trên cùng, ngay cạnh "Kỳ lương":
  //  - bộ lọc của trang (Lái xe, Khách hàng, ô tìm…),
  //  - nút tài liệu tròn: bấm xổ ra các thao tác (Tải mẫu Excel, Nhập từ
  //    Excel, Xuất…, + Thêm…) — chính là các nút gốc ở đầu trang,
  //  - "Xoá đã chọn" (chỉ hiện khi đang tick chuyến) để ngoài cho dễ thấy.
  // Chuyển nguyên phần tử nên sự kiện app.js đã gắn vẫn giữ nguyên.
  function moveToTopbar(){
    const menu = document.getElementById('tb-actions');
    const doc = document.getElementById('tb-doc');
    const extra = document.getElementById('tb-extra');
    const filt = document.getElementById('tb-filters');
    const bar = document.getElementById('topbar');
    if(!menu || !filt) return;

    const actions = document.querySelector('#main > .pagehead > .actions');
    if(actions){
      [...actions.children].forEach(el=>{
        if(el.matches('[data-act="bulk-delete"]')){ extra.appendChild(el); return; }
        if(el.matches('button.btn')){
          const danger = el.classList.contains('danger');
          el.className = 'menu-item' + (danger ? ' danger' : '');
          el.removeAttribute('title');
        }
        menu.appendChild(el);
      });
      actions.remove();
    }
    doc.hidden = !menu.querySelector('button');

    // Chỉ ô LỌC (ô chọn Lái xe/Khách hàng, ô tìm) — ô nhập dữ liệu như "Đơn giá dầu kỳ này" vẫn ở trong trang
    document.querySelectorAll('#main .list-card-tools > .field, #main > .filterbar > .field').forEach(f=>{
      if(f.querySelector('.combo, #f-q')) filt.appendChild(f);
    });
    document.querySelectorAll('#main .list-card-head').forEach(h=>{ if(!h.querySelector('.field')) h.remove(); });
    document.querySelectorAll('#main > .filterbar').forEach(f=>{ if(!f.children.length) f.remove(); });
    // Ô tìm của trang đứng đầu (ngay sau "Kỳ lương"), rồi mới tới Lái xe, Khách hàng…
    const q = filt.querySelector('#f-q');
    if(q) filt.prepend(q.closest('.field'));
    filt.hidden = !filt.children.length;
    // Trang đã có ô tìm riêng (đã lên thanh trên) → ẩn ô "Tìm kiếm…" chung cho khỏi trùng
    bar.classList.toggle('has-page-search', !!filt.querySelector('#f-q'));
    fitTopbar();
  }

  // Nút tài liệu: mở/đóng danh sách thao tác
  function closeDocMenu(){
    const m = document.getElementById('tb-actions'), b = document.getElementById('tb-doc-btn');
    if(m) m.hidden = true;
    if(b){ b.setAttribute('aria-expanded','false'); b.classList.remove('open'); }
  }
  function toggleDocMenu(){
    const m = document.getElementById('tb-actions'), b = document.getElementById('tb-doc-btn');
    const open = m.hidden;
    if(!open){ closeDocMenu(); return; }
    m.hidden = false; b.setAttribute('aria-expanded','true'); b.classList.add('open');
  }

  // Thanh trên tràn (nhiều ô lọc, màn hình hẹp, hiện thêm "Xoá đã chọn")
  // → thu gọn dần: ẩn tên người dùng, rồi chữ "Kỳ lương"/nhãn ô lọc, rồi ô tìm chung.
  function fitTopbar(){
    const bar = document.getElementById('topbar');
    if(!bar) return;
    bar.classList.remove('tb-fit-1','tb-fit-2','tb-fit-3');
    if(window.matchMedia('(max-width:880px)').matches) return; // điện thoại: ô lọc đã xuống hàng riêng
    const over = ()=>bar.scrollWidth > bar.clientWidth + 1;
    if(over()) bar.classList.add('tb-fit-1');
    if(over()) bar.classList.add('tb-fit-2');
    if(over()) bar.classList.add('tb-fit-3');
  }
  window.addEventListener('resize', ()=>fitTopbar());
  // Nút "Xoá đã chọn" hiện/ẩn khi tick chuyến mà không vẽ lại trang
  new MutationObserver(()=>fitTopbar()).observe(document.getElementById('tb-extra'), {subtree:true, childList:true, attributes:true, attributeFilter:['hidden'], characterData:true});

  // Icon cho nút đầu trang, đoán theo data-act / chữ trên nút.
  function buttonIcon(btn){
    const act = btn.dataset.act || '';
    const t = (btn.textContent||'').trim().toLowerCase();
    if(/^\+/.test(t) || act==='add') return 'plus';
    if(act==='lock-period') return 'lock';
    if(act==='unlock-period') return 'unlock';
    if(/xuất|tải file sao lưu/.test(t)) return 'download';
    if(/tải mẫu/.test(t)) return 'sheet';
    if(/nhập từ|phục hồi/.test(t)) return 'upload';
    if(/^lưu/.test(t)) return 'save';
    if(/xoá đã chọn/.test(t)) return 'trash';
    return null;
  }
  function decorateButtons(root){
    root.querySelectorAll('.pagehead .actions .btn, .savebar .btn, .panel .actions .btn').forEach(btn=>{
      if(btn.dataset.ui2Icon) return;
      const name = buttonIcon(btn);
      btn.dataset.ui2Icon = '1';
      if(!name) return;
      // Bỏ dấu "+" ở đầu chữ (đã có icon dấu cộng)
      const first = btn.firstChild;
      if(first && first.nodeType===3) first.textContent = first.textContent.replace(/^\s*\+\s*/, '');
      // Gói chữ vào <span> để màn hình vừa có thể chỉ hiện icon (tên nút vẫn hiện khi rê chuột)
      const label = (btn.textContent||'').trim();
      [...btn.childNodes].forEach(n=>{ if(n.nodeType===3 && n.textContent.trim()){ const s=document.createElement('span'); s.className='ui2-label'; s.textContent=n.textContent.trim(); n.replaceWith(s); } });
      if(!btn.title && label) btn.title = label;
      btn.insertAdjacentHTML('afterbegin', icon(name, 16));
    });
  }

  // Tìm bảng chính của trang (không tính bảng trong khung sửa/chi tiết dòng).
  function mainTablewraps(main){
    return [...main.querySelectorAll(':scope > .tablewrap')];
  }

  function enhanceMain(){
    const main = document.getElementById('main');
    if(!main) return;
    const section = currentSection;
    document.body.dataset.section = section;
    decorateButtons(main);

    mainTablewraps(main).forEach((wrap, idx)=>{
      // Bộ lọc đứng ngay trước bảng (bỏ qua các dòng ghi chú/hộp khoá ở giữa)
      let prev = wrap.previousElementSibling;
      const between = [];
      while(prev && (prev.classList.contains('hint') || prev.classList.contains('lockbox') || prev.classList.contains('focusbar'))){
        between.unshift(prev); prev = prev.previousElementSibling;
      }
      const filterbar = (prev && prev.classList.contains('filterbar')) ? prev : null;

      const card = document.createElement('section');
      card.className = 'list-card';
      const head = document.createElement('div');
      head.className = 'list-card-head';
      // Không lặp lại tiêu đề trong card (tên trang đã có ở trên) — đầu card chỉ còn bộ lọc
      head.innerHTML = `<div class="list-card-tools"></div>`;
      const tools = head.querySelector('.list-card-tools');
      wrap.parentNode.insertBefore(card, wrap);
      card.appendChild(head);
      if(filterbar){
        filterbar.querySelectorAll(':scope > .field').forEach(f=>{
          const inp = f.querySelector('input[type="text"]:not(.combo-input)');
          if(inp && /^f-q$/.test(inp.id)) f.classList.add('tool-search');
          tools.appendChild(f);
        });
        filterbar.remove();
      }
      // Ghi chú/hộp khoá nằm giữa bộ lọc và bảng → để ngay dưới đầu card
      between.forEach(el=>{ el.classList.add('list-card-note'); card.appendChild(el); });
      card.appendChild(wrap);
      if(!tools.children.length) head.remove();

      // Bảng Bảng lương/Chuyến… có "Lưu" ngay sau → để trong card luôn
      const after = card.nextElementSibling;
      if(after && after.classList.contains('savebar')){ after.classList.add('list-card-foot-save'); card.appendChild(after); }

      setupRowMenus(wrap);
      setupPagination(card, wrap, section, idx);
    });
    // Ô tìm kiếm trên cùng: đồng bộ với ô tìm của trang (nếu có)
    const pageSearch = document.getElementById('f-q');
    const tb = document.getElementById('tb-search');
    if(tb && document.activeElement!==tb) tb.value = pageSearch ? pageSearch.value : '';
  }

  /* ---------------- Cột thao tác "⋯" ---------------- */
  let openMenu = null;
  // Đóng menu "⋯": trả các nút gốc về chỗ cũ trong dòng rồi bỏ menu nổi.
  function closeRowMenu(){
    if(!openMenu) return;
    const m = openMenu; openMenu = null;
    if(m._holder) [...m.children].forEach(b=>m._holder.appendChild(b));
    m.parentNode && m.parentNode.removeChild(m);
  }
  document.addEventListener('click', e=>{
    if(openMenu && !openMenu.contains(e.target) && !e.target.closest('.row-kebab')) closeRowMenu();
  });
  window.addEventListener('scroll', closeRowMenu, true);
  window.addEventListener('resize', closeRowMenu);
  function setupRowMenus(wrap){
    wrap.querySelectorAll('tbody td').forEach(td=>{
      const edit = td.querySelector(':scope > [data-edit]');
      const del = td.querySelector(':scope > [data-del]');
      if(!edit && !del) return;
      const holder = document.createElement('div');
      holder.className = 'row-actions-src';
      holder.hidden = true;
      if(edit){ edit.className = 'menu-item'; edit.innerHTML = icon('pencil', 15) + '<span>Sửa</span>'; holder.appendChild(edit); }
      if(del){ del.className = 'menu-item danger'; del.innerHTML = icon('trash', 15) + '<span>Xoá</span>'; holder.appendChild(del); }
      td.textContent = '';
      td.classList.add('td-actions');
      const kebab = document.createElement('button');
      kebab.type = 'button';
      kebab.className = 'row-kebab';
      kebab.title = 'Thao tác';
      kebab.setAttribute('aria-label', 'Thao tác');
      kebab.innerHTML = icon('more', 18);
      td.appendChild(kebab);
      td.appendChild(holder);
      kebab.onclick = ev=>{
        ev.stopPropagation();
        const wasOpenHere = openMenu && openMenu._owner===kebab;
        closeRowMenu();
        if(wasOpenHere) return;
        const pop = document.createElement('div');
        pop.className = 'row-menu';
        pop._owner = kebab;
        pop._holder = holder;
        // DI CHUYỂN nút gốc vào menu nổi (giữ nguyên sự kiện onclick của app.js)
        [...holder.children].forEach(b=>pop.appendChild(b));
        // Bấm 1 mục: onclick gốc chạy trước (mở khung sửa / hỏi xoá), rồi đóng menu
        pop.addEventListener('click', ()=>setTimeout(closeRowMenu, 0));
        document.body.appendChild(pop);
        const r = kebab.getBoundingClientRect();
        const w = pop.offsetWidth, h = pop.offsetHeight;
        let top = r.bottom + 4; if(top + h > window.innerHeight - 8) top = r.top - h - 4;
        pop.style.top = top + 'px';
        pop.style.left = Math.max(8, r.right - w) + 'px';
        openMenu = pop;
      };
    });
  }

  /* ---------------- Phân trang (mặc định 10 dòng/trang như mẫu) ---------------- */
  const PAGE_SIZES = [10, 20, 50, 100, 0]; // 0 = tất cả
  const pageState = {}; // khoá "trang|bảng" -> số trang đang xem
  function sizeKey(section){ return 'vittrans_ui2_pagesize_'+section; }
  function getSize(section){
    try{ const v = localStorage.getItem(sizeKey(section)); if(v!==null) return Number(v); }catch(e){}
    return 10;
  }
  function setSize(section, n){ try{ localStorage.setItem(sizeKey(section), String(n)); }catch(e){} }

  function setupPagination(card, wrap, section, idx){
    const tbody = wrap.querySelector('table > tbody');
    if(!tbody) return;
    // Nhóm dòng: 1 dòng chính + các dòng chi tiết mở rộng đi kèm ngay sau
    const groups = [];
    [...tbody.children].forEach(tr=>{
      if(tr.classList.contains('expand-row') && groups.length) groups[groups.length-1].push(tr);
      else groups.push([tr]);
    });
    const isEmpty = groups.length===1 && groups[0][0].querySelector('td.empty');
    const total = isEmpty ? 0 : groups.length;
    const key = section+'|'+idx;
    const size = getSize(section);
    const pages = size ? Math.max(1, Math.ceil(total/size)) : 1;
    let page = Math.min(pageState[key] || 1, pages);
    pageState[key] = page;

    groups.forEach((g, i)=>{
      const show = !size || (i >= (page-1)*size && i < page*size);
      g.forEach(tr=>tr.classList.toggle('pg-hide', !show));
    });

    const from = total ? (size ? (page-1)*size+1 : 1) : 0;
    const to = size ? Math.min(total, page*size) : total;
    const foot = document.createElement('div');
    foot.className = 'list-card-foot';
    foot.innerHTML = `
      <div class="pg-size">Hiển thị
        <select class="pg-size-select" aria-label="Số dòng mỗi trang">${PAGE_SIZES.map(n=>`<option value="${n}"${n===size?' selected':''}>${n||'Tất cả'}</option>`).join('')}</select>
        dòng mỗi trang <span class="pg-range">· ${from}–${to} / ${total}</span></div>
      <div class="pager">${pagerHtml(page, pages)}</div>`;
    card.appendChild(foot);
    foot.querySelector('.pg-size-select').onchange = e=>{ setSize(section, Number(e.target.value)); pageState[key] = 1; render(); };
    foot.querySelectorAll('[data-page]').forEach(b=>{
      b.onclick = ()=>{ pageState[key] = Number(b.dataset.page); render(); };
    });

    // Lịch lái xe: "chọn tất cả" chỉ tick các chuyến ĐANG HIỆN ở trang này —
    // tránh xoá nhầm chuyến ở trang khác không nhìn thấy.
    const selectAll = wrap.querySelector('#trip-select-all');
    if(selectAll){
      const visibleBoxes = ()=>[...wrap.querySelectorAll('tbody tr:not(.pg-hide) .trip-select')];
      selectAll.checked = visibleBoxes().length>0 && visibleBoxes().every(b=>b.checked);
      selectAll.onchange = e=>{
        visibleBoxes().forEach(cb=>{ if(cb.checked!==e.target.checked){ cb.checked = e.target.checked; cb.dispatchEvent(new Event('change')); } });
      };
    }
  }
  function pagerHtml(page, pages){
    const btn = (p, label, opts)=>`<button type="button" class="pg-btn${opts&&opts.active?' active':''}${opts&&opts.wide?' wide':''}" ${p?`data-page="${p}"`:''}${opts&&opts.disabled?' disabled':''}>${label}</button>`;
    const nums = [];
    if(pages <= 7){ for(let i=1;i<=pages;i++) nums.push(i); }
    else{
      nums.push(1, 2, 3);
      if(page > 4 && page < pages-3) nums.push('…', page-1, page, page+1, '…');
      else nums.push('…');
      nums.push(pages-2, pages-1, pages);
    }
    const seen = new Set();
    const list = nums.filter(n=>{ if(n==='…') return true; if(seen.has(n)) return false; seen.add(n); return true; })
      .filter((n,i,a)=>!(n==='…' && a[i-1]==='…'));
    return btn(page>1?page-1:null, icon('chevronLeft',15)+'<span>Trước</span>', {wide:true, disabled:page<=1})
      + list.map(n=> n==='…' ? '<span class="pg-btn gap">…</span>' : btn(n, n, {active:n===page})).join('')
      + btn(page<pages?page+1:null, '<span>Sau</span>'+icon('chevronRight',15), {wide:true, disabled:page>=pages});
  }

  /* ---------------- 3. Thanh trên cùng + thẻ cuối sidebar ---------------- */
  function refreshChrome(){
    // Chuông: tổng cảnh báo của kỳ đang xem (đầu trang Bảng lương + dòng lương thiếu dữ liệu)
    let warnCount = 0;
    try{
      if(!isPeriodLocked(appPeriod)){
        warnCount = buildWarnings(appPeriod).length + payrollRows(appPeriod).filter(r=>r.warnings && r.warnings.length).length;
      }
    }catch(e){}
    const dot = document.getElementById('tb-bell-dot');
    if(dot) dot.hidden = !warnCount;
    const bell = document.getElementById('tb-bell');
    if(bell) bell.title = warnCount ? `${warnCount} cảnh báo dữ liệu kỳ ${periodLabelVi(appPeriod)} — bấm để xem` : `Kỳ ${periodLabelVi(appPeriod)}: không có cảnh báo`;

    const st = document.getElementById('topbar-status');
    const stText = document.getElementById('storage-mode');
    if(st && stText) st.title = stText.textContent;

    // Người dùng
    const userSmall = document.getElementById('topbar-user');
    const name = document.getElementById('tb-name');
    const sub = document.getElementById('tb-sub');
    const avatar = document.getElementById('tb-avatar');
    if(userSmall && !userSmall.hidden && userSmall.textContent){
      const email = userSmall.textContent.split(' · ')[0];
      const nick = email.split('@')[0];
      name.textContent = nick;
      sub.textContent = userSmall.textContent;
      avatar.textContent = nick.slice(0,2).toUpperCase();
    }else{
      name.textContent = 'VIT TRANS';
      sub.textContent = storageMode==='local' ? 'Bản offline (máy này)' : storageMode==='fallback' ? 'Đang lưu tạm trên máy này' : 'Hệ thống lương lái xe';
      avatar.textContent = 'VT';
    }

    // Thẻ cuối sidebar: trạng thái kỳ lương đang xem
    const card = document.getElementById('sb-card');
    if(card){
      const lock = periodLockOf(appPeriod);
      card.innerHTML = `
        <div class="sb-card-icon">${icon(lock?'lock':'shield', 26)}</div>
        <div class="sb-card-title">Kỳ ${esc(periodLabelVi(appPeriod))}${lock?' đã chốt':''}</div>
        <div class="sb-card-text">${lock
          ? `Chốt lúc ${esc(fmtDateTime(lock.lockedAt))}. Dữ liệu kỳ này đang được khoá.`
          : warnCount ? `Còn ${warnCount} cảnh báo dữ liệu cần xử lý trước khi chốt lương.` : 'Dữ liệu đã đủ — có thể chốt lương kỳ này.'}</div>
        <button type="button" class="sb-card-btn" id="sb-card-btn">${lock ? 'Xem bảng lương' : warnCount ? 'Xem cảnh báo' : 'Chốt lương'}</button>`;
      card.querySelector('#sb-card-btn').onclick = ()=>{
        if(!lock && warnCount){ warningsOpen = true; }
        if(currentSection!=='payroll') setSection('payroll'); else render();
        if(!lock && !warnCount){ const b = document.querySelector('#tb-actions [data-act="lock-period"]'); if(b) b.click(); }
      };
    }
  }

  function initChrome(){
    const $ = id=>document.getElementById(id);
    $('sb-collapse').innerHTML = icon('collapse', 18);
    $('tb-menu').innerHTML = icon('menu', 20);
    document.querySelector('.tb-search-icon').innerHTML = icon('search', 16);
    $('tb-bell').insertAdjacentHTML('afterbegin', icon('bell', 19));
    $('btn-logout').innerHTML = icon('logout', 17);
    $('side-prev').innerHTML = icon('chevronLeft', 16);
    $('tb-doc-btn').innerHTML = icon('fileText', 18);
    $('tb-doc-btn').onclick = e=>{ e.stopPropagation(); toggleDocMenu(); };
    // Bấm 1 mục → app.js xử lý như bấm nút gốc, rồi đóng danh sách
    $('tb-actions').addEventListener('click', e=>{ if(e.target.closest('button')) setTimeout(closeDocMenu, 0); });
    document.addEventListener('click', e=>{ if(!e.target.closest('#tb-doc')) closeDocMenu(); });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeDocMenu(); });
    $('side-next').innerHTML = icon('chevronRight', 16);

    document.querySelector('.sb-brand').addEventListener('click', e=>e.preventDefault());

    // Thu gọn sidebar (máy tính) / mở menu (điện thoại)
    const app = $('app');
    const mobile = window.matchMedia('(max-width:880px)');
    function syncCollapseIcon(){ $('sb-collapse').innerHTML = icon(app.classList.contains('sidebar-collapsed') ? 'expand' : 'collapse', 18); }
    syncCollapseIcon();
    $('sb-collapse').onclick = ()=>{
      if(mobile.matches){ app.classList.remove('mobile-nav-open'); return; }
      const collapsed = !app.classList.contains('sidebar-collapsed');
      app.classList.toggle('sidebar-collapsed', collapsed);
      try{ localStorage.setItem('vittrans_sidebar_collapsed', collapsed?'1':'0'); }catch(e){}
      syncCollapseIcon();
    };
    $('tb-menu').onclick = ()=>app.classList.add('mobile-nav-open');
    $('sb-backdrop').onclick = ()=>app.classList.remove('mobile-nav-open');
    $('navroot').addEventListener('click', e=>{ if(e.target.closest('[data-nav]')) app.classList.remove('mobile-nav-open'); });

    // Tìm kiếm trên cùng → ô tìm của trang đang xem; trang không có ô tìm thì
    // chuyển sang Lịch lái xe và tìm theo mã chuyến / lái xe / biển số.
    const tb = $('tb-search');
    tb.addEventListener('input', ()=>{
      const pageSearch = document.getElementById('f-q');
      if(pageSearch){ pageSearch.value = tb.value; pageSearch.dispatchEvent(new Event('input', {bubbles:true})); tb.focus(); }
    });
    tb.addEventListener('keydown', e=>{
      if(e.key!=='Enter') return;
      if(!document.getElementById('f-q')){
        filters.trips.focus = null; filters.trips.q = tb.value; setSection('trips');
      }
    });

    // Chuông → Bảng lương, mở sẵn danh sách cảnh báo
    $('tb-bell').onclick = ()=>{ warningsOpen = true; if(currentSection!=='payroll') setSection('payroll'); else render(); };

  }

  initChrome();
  // Chưa đăng nhập thì chờ: đăng nhập xong app.js tự gọi render() (đã bọc ở trên)
  if(!(SUPABASE_ENABLED && !Auth.isLoggedIn())) render();
})();
