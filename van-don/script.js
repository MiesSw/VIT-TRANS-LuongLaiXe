'use strict';

/* ============================================================
   CONFIG
   ============================================================ */
const SUPABASE_URL = 'https://xebjspjnitwicgefcxnk.supabase.co';
let SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlYmpzcGpuaXR3aWNnZWZjeG5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4ODA1MzIsImV4cCI6MjEwMzQ1NjUzMn0.uBEroZifzLIkXhPyZN6zm4WrQFweY7OM9JvqG_PxTFo';
const CONTRACTOR_FILES_BUCKET = 'contractor-files';
// Khi KHÔNG kết nối Supabase (chỉ chạy Local Storage), file PDF phải nhúng
// base64 trực tiếp vào localStorage — trình duyệt giới hạn cứng ~5-10MB cho
// toàn bộ site, nên chặn file quá lớn ở đây để tránh lỗi QuotaExceededError.
const MAX_LOCAL_FILE_SIZE = 400 * 1024; // 400KB/file khi ở chế độ Local Storage

const LOCAL_KEYS = {
  customers: 'vittrans_customers',
  contractors: 'vittrans_contractors',
  orders: 'vittrans_orders',
  reconciliations: 'vittrans_reconciliations',
  documents: 'vittrans_documents',
  contractor_leads: 'vittrans_contractor_leads',
  contractor_lead_types: 'vittrans_contractor_lead_types',
  supabaseKey: 'vittrans_supabase_key',
  navCollapsed: 'vittrans_nav_collapsed'
};
const AUTH_STORAGE_KEY = 'vittrans-auth';
const ADMIN_EMAIL = 'kien.ht@vittrans.vn'; // tài khoản Admin gốc (gắn quyền ở supabase_auth_setup.sql)

/* ============================================================
   VIETNAM LOCATION DATA — 34 tỉnh/thành chính thức
   (Nghị quyết 202/2025/QH15, hiệu lực 01/07/2025 — 28 tỉnh + 6 TP trực thuộc TW)
   Danh sách phường/xã bên dưới là các đơn vị tiêu biểu để gợi ý tìm kiếm
   (mỗi tỉnh hiện có hàng chục đến hàng trăm xã/phường sau sáp nhập cấp xã,
   không thể liệt kê hết). Ô tìm kiếm cho phép gõ tự do nếu không thấy tên
   phường/xã cần tìm trong danh sách gợi ý.
   ============================================================ */
const VN_LOCATIONS = {
  'Hà Nội': ['Phường Hoàn Kiếm','Phường Ba Đình','Phường Đống Đa','Phường Cầu Giấy','Phường Long Biên','Phường Hà Đông','Phường Thanh Xuân','Phường Nam Từ Liêm'],
  'Cao Bằng': ['Phường Sông Bằng','Phường Hợp Giang','Xã Trùng Khánh','Xã Quảng Hòa','Xã Nguyên Bình'],
  'Lạng Sơn': ['Phường Vĩnh Trại','Phường Tam Thanh','Xã Cao Lộc','Xã Hữu Lũng','Xã Bắc Sơn'],
  'Quảng Ninh': ['Phường Hồng Gai','Phường Bãi Cháy','Phường Cẩm Phả','Phường Uông Bí','Xã Móng Cái'],
  'Lai Châu': ['Phường Tân Phong','Phường Đông Phong','Xã Phong Thổ','Xã Sìn Hồ','Xã Than Uyên'],
  'Điện Biên': ['Phường Mường Thanh','Phường Him Lam','Xã Điện Biên Đông','Xã Tủa Chùa','Xã Mường Ảng'],
  'Sơn La': ['Phường Chiềng Lề','Phường Tô Hiệu','Xã Mộc Châu','Xã Yên Châu','Xã Mai Sơn'],
  'Tuyên Quang': ['Phường Minh Xuân','Phường Tân Quang','Xã Hà Giang','Xã Yên Minh','Xã Bắc Quang'],
  'Lào Cai': ['Phường Lào Cai','Phường Cốc Lếu','Xã Yên Bái','Xã Sa Pa','Xã Văn Bàn'],
  'Thái Nguyên': ['Phường Trưng Vương','Phường Phan Đình Phùng','Xã Bắc Kạn','Xã Phổ Yên','Xã Đại Từ'],
  'Phú Thọ': ['Phường Nông Trang','Phường Vân Phú','Xã Vĩnh Yên','Xã Hòa Bình','Xã Việt Trì'],
  'Bắc Ninh': ['Phường Suối Hoa','Phường Vũ Ninh','Xã Bắc Giang','Xã Từ Sơn','Xã Việt Yên'],
  'Hưng Yên': ['Phường Hiến Nam','Phường Lam Sơn','Xã Thái Bình','Xã Văn Lâm','Xã Kiến Xương'],
  'Hải Phòng': ['Phường Hồng Bàng','Phường Ngô Quyền','Phường Lê Chân','Xã Hải Dương','Xã Kiến An'],
  'Ninh Bình': ['Phường Vân Giang','Phường Đông Thành','Xã Hà Nam','Xã Nam Định','Xã Kim Sơn'],
  'Thanh Hóa': ['Phường Điện Biên','Phường Ba Đình','Xã Sầm Sơn','Xã Bỉm Sơn','Xã Tĩnh Gia'],
  'Nghệ An': ['Phường Vinh','Phường Cửa Lò','Xã Diễn Châu','Xã Quỳnh Lưu','Xã Đô Lương'],
  'Hà Tĩnh': ['Phường Trần Phú','Phường Nam Hà','Xã Hồng Lĩnh','Xã Kỳ Anh','Xã Cẩm Xuyên'],
  'Quảng Trị': ['Phường Đông Hà','Phường Đồng Sơn','Xã Quảng Bình','Xã Đồng Hới','Xã Hải Lăng'],
  'Huế': ['Phường Vĩnh Ninh','Phường Phú Hội','Xã Hương Thủy','Xã Phong Điền','Xã Phú Vang'],
  'Đà Nẵng': ['Phường Hải Châu','Phường Thanh Khê','Phường Sơn Trà','Xã Quảng Nam','Xã Hội An','Xã Tam Kỳ'],
  'Quảng Ngãi': ['Phường Nghĩa Lộ','Phường Trần Phú','Xã Kon Tum','Xã Đức Phổ','Xã Mộ Đức'],
  'Gia Lai': ['Phường Ia Kring','Phường Hoa Lư','Xã Bình Định','Xã Quy Nhơn','Xã An Khê'],
  'Khánh Hòa': ['Phường Lộc Thọ','Phường Vĩnh Hòa','Xã Ninh Thuận','Xã Cam Ranh','Xã Ninh Hòa'],
  'Lâm Đồng': ['Phường Đà Lạt','Phường Xuân Hương','Xã Đắk Nông','Xã Bình Thuận','Xã Bảo Lộc'],
  'Đắk Lắk': ['Phường Tân Lợi','Phường Thắng Lợi','Xã Phú Yên','Xã Buôn Hồ','Xã Ea Kar'],
  'TP. Hồ Chí Minh': ['Phường Bến Nghé','Phường Bến Thành','Phường Tân Định','Phường Thủ Đức','Xã Bình Dương','Xã Bà Rịa','Xã Vũng Tàu'],
  'Đồng Nai': ['Phường Trảng Dài','Phường Tân Phong','Phường Biên Hòa','Xã Bình Phước','Xã Đồng Xoài','Xã Long Khánh'],
  'Tây Ninh': ['Phường 1','Phường Hòa Thành','Xã Long An','Xã Tân An','Xã Bến Lức'],
  'Cần Thơ': ['Phường Ninh Kiều','Phường Cái Răng','Xã Hậu Giang','Xã Vị Thanh','Xã Sóc Trăng'],
  'Vĩnh Long': ['Phường 1','Phường 4','Xã Bến Tre','Xã Trà Vinh','Xã Mỏ Cày'],
  'Đồng Tháp': ['Phường 1','Phường Mỹ Phú','Xã Tiền Giang','Xã Cai Lậy','Xã Cao Lãnh'],
  'An Giang': ['Phường Mỹ Bình','Phường Mỹ Long','Xã Kiên Giang','Xã Rạch Giá','Xã Phú Quốc'],
  'Cà Mau': ['Phường 1','Phường 5','Xã Bạc Liêu','Xã Giá Rai','Xã Đầm Dơi'],
};

const PROVINCE_LIST = Object.keys(VN_LOCATIONS);

/* ============================================================
   STATE
   ============================================================ */
const state = {
  customers: [],
  contractors: [],
  orders: [],
  reconciliations: [],
  documents: [],
  contractor_leads: [],
  contractor_lead_types: [],
  leadDrafts: new Map(),    // Tìm Kiếm Nhà Thầu: dòng đang sửa/thêm mới trên bảng (key → { id, isNew, fields })
  missingTables: new Set(), // bảng bổ sung chưa tạo trên Supabase (xem TABLES.optional)
  useSupabase: false,
  supabaseClient: null,
  cloudOnline: null,     // null = đang kết nối lần đầu, true = OK, false = mất kết nối (đang tự thử lại)
  cloudLoaded: false,    // đã từng tải dữ liệu thành công từ Supabase trong phiên này
  lastLoadAt: 0,
  loading: true,
  refreshing: false,
  suppressRealtime: 0,   // >0 khi đang nhập Excel hàng loạt: bỏ qua sự kiện realtime
  editingCustomerId: null,
  editingContractorId: null,
  editingOrderId: null,
  editingReconId: null,
  editingDocId: null,
  confirmCallback: null,
  realtimeChannel: null,
  currentView: 'orders',
  pendingContractorFiles: [],
  orderColFilters: {},
  orderSortKey: 'ngay_giao_hang', // cột đang sort ở bảng Đơn hàng — mặc định theo Ngày Giao Hàng
  orderSortDir: 'desc',           // 'asc' (A→Z) hoặc 'desc' (Z→A) — mặc định mới → cũ
  // Đăng nhập & phân quyền: perms = { orders: { view, create, edit, delete, export }, ... }
  auth: { user: null, profile: null, perms: {} },
  profiles: [],          // danh sách tài khoản (chỉ Admin tải)
  deptPerms: [],         // ma trận quyền phòng ban (chỉ Admin tải)
  editingUserId: null,
  passwordTargetId: null // null = tự đổi mật khẩu của mình
};

/* ============================================================
   UTILITIES
   ============================================================ */
function uid() { return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,9); }
function pad(n, s) { let x = String(n); while (x.length < s) x = '0' + x; return x; }
function todayYYMMDD() {
  const d = new Date();
  return pad(d.getFullYear() % 100, 2) + pad(d.getMonth()+1, 2) + pad(d.getDate(), 2);
}
function formatCurrency(num) { return Math.round(Number(num)||0).toLocaleString('vi-VN') + ' đ'; }
function formatNumberInput(num) { const n = Math.round(Number(num)||0); return n ? n.toLocaleString('vi-VN') : ''; }
function parseCurrencyInput(str) { return str ? parseInt(String(str).replace(/[^\d]/g,''), 10)||0 : 0; }
function escHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function showToast(msg, type) {
  type = type || 'info';
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('hide'); setTimeout(() => t.remove(), 260); }, 3200);
}
let modalZCounter = 200;
function openModal(id) {
  const el = document.getElementById(id);
  modalZCounter += 1;
  el.style.zIndex = modalZCounter;
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  if (!document.querySelector('.modal-overlay.open')) document.body.style.overflow = '';
}
// opts.okText / opts.okClass: đổi nút OK cho hộp xác nhận không phải xóa (mặc định: nút đỏ "Xóa")
function askConfirm(msg, cb, opts) {
  opts = opts || {};
  document.getElementById('confirmMessage').textContent = msg;
  const ok = document.getElementById('btnConfirmOk');
  ok.textContent = opts.okText || 'Xóa';
  ok.className = 'btn ' + (opts.okClass || 'btn-danger');
  state.confirmCallback = cb;
  openModal('confirmModalOverlay');
}

/* ============================================================
   NẠP THƯ VIỆN NGOÀI — có CDN dự phòng + timeout
   Một số mạng chặn/reset kết nối tới 1 CDN cụ thể → thử lần lượt nhiều nguồn,
   mỗi nguồn chờ tối đa `ms` mili-giây, thay vì treo cả trang.
   ============================================================ */
function loadScriptWithTimeout(src, ms) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const timer = setTimeout(() => { s.remove(); reject(new Error('Quá thời gian tải ' + src)); }, ms);
    s.onload = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error('Không tải được ' + src)); };
    s.src = src;
    document.head.appendChild(s);
  });
}
const _libPromises = {};
function loadLib(name) {
  const lib = EXTERNAL_LIBS[name];
  if (lib.check()) return Promise.resolve(true);
  if (!_libPromises[name]) {
    _libPromises[name] = (async () => {
      for (const url of lib.urls) {
        try { await loadScriptWithTimeout(url, lib.ms); if (lib.check()) return true; }
        catch(e) { console.warn(e.message); }
      }
      return lib.check();
    })().then(ok => { if (!ok) delete _libPromises[name]; return ok; });
  }
  return _libPromises[name];
}
const EXTERNAL_LIBS = {
  supabase: { check: () => window.supabase, ms: 8000, urls: [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js'
  ] },
  exceljs: { check: () => window.ExcelJS, ms: 12000, urls: [
    'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
    'https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'
  ] },
  xlsx: { check: () => window.XLSX, ms: 12000, urls: [
    'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  ] }
};
async function loadLibOrToast(name) {
  const ok = await loadLib(name);
  if (!ok) showToast('Không tải được thư viện Excel — kiểm tra kết nối mạng rồi thử lại.', 'error');
  return ok;
}
const loadExcelJS = () => loadLibOrToast('exceljs');
const loadXLSX = () => loadLibOrToast('xlsx');

/* ============================================================
   KẾT NỐI SUPABASE BỀN BỈ — timeout, tự thử lại, phân loại lỗi
   ============================================================ */
const PAGE_SIZE = 1000;            // Supabase chỉ trả tối đa 1000 dòng/request → phải phân trang
const INSERT_CHUNK = 200;          // số dòng mỗi lần insert hàng loạt
const READ_TIMEOUT_MS = 20000;
const WRITE_TIMEOUT_MS = 45000;
const STORAGE_TIMEOUT_MS = 180000; // upload file lớn trên mạng chậm
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// fetch riêng cho supabase-js: mỗi request có timeout; GET tự thử lại (mạng reset/5xx),
// ghi (POST/PATCH/DELETE) KHÔNG tự thử lại để tránh tạo bản ghi trùng.
async function resilientFetch(input, init) {
  init = init || {};
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const method = String(init.method || (input && input.method) || 'GET').toUpperCase();
  const canRetry = method === 'GET' || method === 'HEAD';
  const attempts = canRetry ? 3 : 1;
  const timeoutMs = url.includes('/storage/v1/') ? STORAGE_TIMEOUT_MS : (canRetry ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ctrl = new AbortController();
    const userSignal = init.signal;
    const onUserAbort = () => ctrl.abort();
    if (userSignal) { if (userSignal.aborted) ctrl.abort(); else userSignal.addEventListener('abort', onUserAbort, { once: true }); }
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: ctrl.signal });
      if (!(canRetry && res.status >= 500 && attempt < attempts)) return res;
      lastErr = new Error('HTTP ' + res.status);
    } catch (err) {
      if (userSignal && userSignal.aborted) throw err;
      lastErr = ctrl.signal.aborted ? new Error('Hết thời gian chờ (' + Math.round(timeoutMs / 1000) + 's)') : err;
      if (attempt >= attempts) throw lastErr;
    } finally {
      clearTimeout(timer);
      if (userSignal) userSignal.removeEventListener('abort', onUserAbort);
    }
    await new Promise(r => setTimeout(r, 400 * attempt));
  }
  throw lastErr;
}

// Supabase trả lỗi có `code` (RLS, thiếu bảng, trùng khóa…) = server đã phản hồi.
// Không có `code` = lỗi mạng / timeout / bị reset kết nối.
function isServerError(e) { return !!(e && e.code); }
function isNetworkError(e) { return !!e && !e.code; }
function isMissingTableError(e) { return !!e && (e.code === 'PGRST205' || e.code === '42P01'); }
function friendlyError(e) {
  if (!e) return 'lỗi không xác định';
  switch (String(e.code || '')) {
    case '23505': return 'dữ liệu bị trùng (mã đã tồn tại)';
    case '23503': return 'dữ liệu đang được nơi khác sử dụng';
    case '22P02': return 'sai định dạng dữ liệu (ID không hợp lệ)';
    case '42501': return 'tài khoản của bạn không có quyền thực hiện thao tác này';
    case 'PGRST301': case '401': return 'key Supabase không hợp lệ hoặc hết hạn';
    case 'PGRST205': case '42P01': return 'chưa tạo bảng trên Supabase (chạy supabase_setup.sql)';
  }
  if (isNetworkError(e)) return 'không kết nối được Supabase (mạng chậm hoặc bị ngắt)';
  return e.message || String(e);
}

let _retryTimer = null, _retryDelay = 5000;
function markOnline() {
  const wasOffline = state.cloudOnline === false;
  state.cloudOnline = true; state.cloudLoaded = true; state.lastLoadAt = Date.now();
  _retryDelay = 5000; clearTimeout(_retryTimer); _retryTimer = null;
  updateConnStatusUI();
  if (wasOffline) showToast('Đã kết nối lại Supabase.', 'success');
}
function markOffline(e, silent) {
  console.warn('Supabase offline:', e && e.message ? e.message : e);
  const first = state.cloudOnline !== false;
  state.cloudOnline = false;
  updateConnStatusUI();
  if (first && !silent) showToast('Mất kết nối Supabase — ' + friendlyError(e) + '. Đang tự thử lại…', 'error');
  scheduleRetry();
}
function scheduleRetry() {
  if (_retryTimer) return;
  _retryTimer = setTimeout(() => { _retryTimer = null; refreshAll(); }, _retryDelay);
  _retryDelay = Math.min(_retryDelay * 2, 30000);
}

/* ============================================================
   DATABASE MANAGER
   Nguyên tắc: khi đã cấu hình Supabase thì Supabase là nguồn dữ liệu duy nhất.
   Mất mạng ≠ chuyển sang Local Storage: dữ liệu đang hiển thị được GIỮ NGUYÊN,
   lệnh ghi lỗi sẽ báo lỗi (không âm thầm ghi vào máy rồi "biến mất" khi tải lại).
   Local Storage chỉ dùng khi KHÔNG có key/thư viện Supabase (hoặc Supabase từ chối
   ngay lần tải đầu: sai key, chưa tạo bảng).
   ============================================================ */
const CONTRACTOR_LIST_COLS = 'id,ma_nha_thau,ten_nha_thau,mst,dia_chi,stk,ten_ngan_hang,loai_hinh,ky_doi_soat,created_at';
// Cột `files` của nhà thầu có thể chứa file PDF base64 vài MB → KHÔNG tải cùng danh sách,
// chỉ tải khi mở xem/sửa (DB.loadContractorFiles) hoặc nền khi vào màn hình Nhà Thầu.
const TABLES = {
  customers:       { local: LOCAL_KEYS.customers,       select: '*',                  toDb: mapCustomerToDb,       fromDb: mapCustomerFromDb },
  contractors:     { local: LOCAL_KEYS.contractors,     select: CONTRACTOR_LIST_COLS, toDb: mapContractorToDb,     fromDb: mapContractorFromDb },
  orders:          { local: LOCAL_KEYS.orders,          select: '*',                  toDb: mapOrderToDb,          fromDb: mapOrderFromDb },
  reconciliations: { local: LOCAL_KEYS.reconciliations, select: '*',                  toDb: mapReconciliationToDb, fromDb: mapReconciliationFromDb },
  // optional: bảng thêm sau (supabase_documents_setup.sql) — chưa tạo thì coi như rỗng, không làm hỏng cả app
  documents:       { local: LOCAL_KEYS.documents,       select: '*',                  toDb: mapDocumentToDb,       fromDb: mapDocumentFromDb, optional: true },
  // Tìm Kiếm Nhà Thầu (supabase_contractor_leads_setup.sql)
  contractor_leads:      { local: LOCAL_KEYS.contractor_leads,      select: '*', toDb: mapLeadToDb,     fromDb: r => ({ ...r }), optional: true },
  contractor_lead_types: { local: LOCAL_KEYS.contractor_lead_types, select: '*', toDb: mapLeadTypeToDb, fromDb: r => ({ ...r }), optional: true }
};
const ALL_TABLES = Object.keys(TABLES);

async function fetchAllRows(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await state.supabaseClient.from(table).select(TABLES[table].select)
      .order('created_at', { ascending: false }).order('id').range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}
// id tạm sinh ở máy (uid()) không phải UUID → để Supabase tự cấp id
function cloudRow(T, obj) {
  const row = T.toDb(obj);
  if (row.id && !UUID_RE.test(row.id)) delete row.id;
  return row;
}

const DB = {
  async init() {
    DB.unsubscribeRealtime();
    state.useSupabase = false; state.supabaseClient = null; state.cloudOnline = null; state.cloudLoaded = false;
    updateConnStatusUI();
    const stored = localStorage.getItem(LOCAL_KEYS.supabaseKey);
    if (stored) SUPABASE_KEY = stored;
    if (SUPABASE_KEY && SUPABASE_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
      if (await loadLib('supabase')) {
        try {
          // Giữ phiên đăng nhập (localStorage) + tự gia hạn token — RLS trên Supabase
          // phân quyền theo tài khoản đang đăng nhập (xem supabase_auth_setup.sql)
          state.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            global: { fetch: resilientFetch },
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: AUTH_STORAGE_KEY }
          });
          state.useSupabase = true;
        } catch(e) { console.warn('Supabase init error:', e.message || e); }
      } else {
        showToast('Không tải được thư viện Supabase (mạng chặn CDN?) → dùng Local Storage.', 'error');
      }
    }
    updateConnStatusUI();
  },

  // Tải song song các bảng. Lỗi mạng: giữ dữ liệu đang hiển thị + tự thử lại (trả false).
  async loadTables(names) {
    if (!state.useSupabase) {
      names.forEach(t => { state[t] = readLocal(TABLES[t].local).map(TABLES[t].fromDb); });
      return true;
    }
    const results = await Promise.all(names.map(t =>
      fetchAllRows(t).then(rows => ({ t, rows }), error => ({ t, error }))));
    results.forEach(r => {
      if (!r.error) { state[r.t] = r.rows.map(TABLES[r.t].fromDb); state.missingTables.delete(r.t); }
      else if (TABLES[r.t].optional && isMissingTableError(r.error)) { state[r.t] = []; state.missingTables.add(r.t); r.error = null; }
    });
    const failed = results.find(r => r.error);
    if (!failed) { markOnline(); return true; }
    if (!state.cloudLoaded && isServerError(failed.error)) { DB.switchToLocal(failed.error); return true; }
    markOffline(failed.error);
    return false;
  },
  switchToLocal(e) {
    DB.unsubscribeRealtime();
    state.useSupabase = false;
    ALL_TABLES.forEach(t => { state[t] = readLocal(TABLES[t].local).map(TABLES[t].fromDb); });
    updateConnStatusUI();
    showToast('Supabase từ chối truy cập (' + friendlyError(e) + ') → chuyển sang Local Storage.', 'error');
  },

  // Chạy 1 lệnh ghi lên Supabase; lỗi được ném ra để giao diện báo cho người dùng.
  async cloud(fn) {
    try {
      const { data, error } = await fn(state.supabaseClient);
      if (error) throw error;
      markOnline();
      return data;
    } catch(e) {
      if (isNetworkError(e)) markOffline(e, true);
      throw e;
    }
  },

  async insert(t, obj) {
    const T = TABLES[t];
    if (state.useSupabase) {
      const row = await DB.cloud(c => c.from(t).insert(cloudRow(T, obj)).select().single());
      return T.fromDb(row);
    }
    const list = readLocal(T.local);
    obj.id = obj.id || uid(); obj.created_at = obj.created_at || new Date().toISOString();
    list.unshift(obj); writeLocal(T.local, list); return obj;
  },
  async update(t, obj) {
    const T = TABLES[t];
    if (state.useSupabase) {
      const row = await DB.cloud(c => c.from(t).update(T.toDb(obj)).eq('id', obj.id).select().single());
      return T.fromDb(row);
    }
    const list = readLocal(T.local);
    const i = list.findIndex(x => x.id === obj.id);
    if (i > -1) list[i] = obj;
    writeLocal(T.local, list); return obj;
  },
  async remove(t, id) {
    const T = TABLES[t];
    if (state.useSupabase) { await DB.cloud(c => c.from(t).delete().eq('id', id)); return true; }
    writeLocal(T.local, readLocal(T.local).filter(x => x.id !== id)); return true;
  },
  // Insert hàng loạt (nhập Excel): trả về [{row}|{error}] theo đúng thứ tự đầu vào.
  // Cả lô lỗi dữ liệu → thử từng dòng để biết dòng nào hỏng; lỗi mạng → dừng ngay.
  async insertMany(t, objs) {
    const T = TABLES[t];
    if (!state.useSupabase) {
      const list = readLocal(T.local);
      objs.forEach(o => { o.id = o.id || uid(); o.created_at = o.created_at || new Date().toISOString(); });
      writeLocal(T.local, objs.slice().reverse().concat(list));
      return objs.map(o => ({ row: o }));
    }
    const results = new Array(objs.length);
    for (let i = 0; i < objs.length; i += INSERT_CHUNK) {
      const slice = objs.slice(i, i + INSERT_CHUNK);
      try {
        const rows = await DB.cloud(c => c.from(t).insert(slice.map(o => cloudRow(T, o))).select());
        slice.forEach((_, k) => { results[i + k] = { row: T.fromDb(rows[k]) }; });
      } catch(e) {
        if (isNetworkError(e)) { for (let k = i; k < objs.length; k++) results[k] = { error: e }; break; }
        for (let k = 0; k < slice.length; k++) {
          try { results[i + k] = { row: await DB.insert(t, slice[k]) }; }
          catch(e2) { results[i + k] = { error: e2 }; }
        }
      }
    }
    return results;
  },

  /* ---- CUSTOMERS ---- */
  addCustomer: c => DB.insert('customers', c),
  updateCustomer: c => DB.update('customers', c),
  deleteCustomer: id => DB.remove('customers', id),
  /* ---- CONTRACTORS (Nhà Thầu) ---- */
  addContractor: c => DB.insert('contractors', c),
  updateContractor: c => DB.update('contractors', c),
  deleteContractor: id => DB.remove('contractors', id),
  /* ---- RECONCILIATIONS (Bảng Kê Đối Soát) ---- */
  addReconciliation: r => DB.insert('reconciliations', r),
  updateReconciliation: r => DB.update('reconciliations', r),
  deleteReconciliation: id => DB.remove('reconciliations', id),
  /* ---- DOCUMENTS (Tài Liệu gửi đi) ---- */
  addDocument: d => DB.insert('documents', d),
  updateDocument: d => DB.update('documents', d),
  deleteDocument: id => DB.remove('documents', id),
  /* ---- ORDERS ---- */
  addOrder: o => DB.insert('orders', o),
  updateOrder: o => DB.update('orders', o),
  deleteOrder: id => DB.remove('orders', id),

  // File đính kèm của 1 nhà thầu (tải theo yêu cầu, xem chú thích ở TABLES)
  async loadContractorFiles(c) {
    if (Array.isArray(c.files)) return c.files;
    if (!state.useSupabase) { c.files = []; return c.files; }
    const data = await DB.cloud(cl => cl.from('contractors').select('files').eq('id', c.id).single());
    c.files = Array.isArray(data.files) ? data.files : [];
    return c.files;
  },
  // Tải nền file của mọi nhà thầu (1 request) để hiện đúng số file ở bảng Nhà Thầu
  async loadAllContractorFiles() {
    if (!state.useSupabase || state.contractors.every(c => Array.isArray(c.files))) return;
    const rows = await DB.cloud(cl => cl.from('contractors').select('id,files'));
    const byId = new Map(rows.map(r => [r.id, Array.isArray(r.files) ? r.files : []]));
    state.contractors.forEach(c => { if (!Array.isArray(c.files) && byId.has(c.id)) c.files = byId.get(c.id); });
  },

  subscribeRealtime(onChange) {
    if (!state.useSupabase || !state.supabaseClient) return;
    DB.unsubscribeRealtime();
    try {
      let ch = state.supabaseClient.channel('vittrans-rt');
      ALL_TABLES.filter(t => !state.missingTables.has(t)).forEach(t => { ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => onChange(t)); });
      state.realtimeChannel = ch.subscribe();
    } catch(e) { console.warn('Realtime error:', e); }
  },
  unsubscribeRealtime() {
    if (state.realtimeChannel && state.supabaseClient) {
      try { state.supabaseClient.removeChannel(state.realtimeChannel); } catch(e) {}
    }
    state.realtimeChannel = null;
  }
};

function readLocal(k) { try { return JSON.parse(localStorage.getItem(k)) || []; } catch(e) { return []; } }
function writeLocal(k, d) { localStorage.setItem(k, JSON.stringify(d)); }

/* DB FIELD MAPPING (tên cột app = tên cột Supabase — tiếng Việt viết tắt 1-1) */
function mapCustomerToDb(c) {
  const p = { ma_kh: c.ma_kh, ten_kh: c.ten_kh, pic: c.pic||null, sdt: c.sdt||null, dia_chi: c.dia_chi||null, mst: c.mst||null };
  if (c.id) p.id = c.id; return p;
}
function mapCustomerFromDb(r) { return { ...r }; }

function mapContractorToDb(c) {
  const p = {
    ma_nha_thau: c.ma_nha_thau, ten_nha_thau: c.ten_nha_thau, mst: c.mst||null, dia_chi: c.dia_chi||null,
    stk: c.stk||null, ten_ngan_hang: c.ten_ngan_hang||null,
    loai_hinh: c.loai_hinh||null, ky_doi_soat: c.ky_doi_soat||null
  };
  // `files` chỉ ghi khi đã được tải/chỉnh sửa (mảng). Danh sách nhà thầu không tải cột này,
  // nếu ghi [] mặc định sẽ XÓA MẤT file hợp đồng đang lưu trên Supabase.
  if (Array.isArray(c.files)) p.files = c.files;
  if (c.id) p.id = c.id; return p;
}
function mapContractorFromDb(r) { return { ...r }; }

function mapReconciliationToDb(r) {
  const p = {
    ma_bang_ke: r.ma_bang_ke, nha_thau_id: r.nha_thau_id||null, nha_thau_ten: r.nha_thau_ten||null, nha_thau_ma: r.nha_thau_ma||null,
    ngay_nhan: r.ngay_nhan||null, gia_tri: r.gia_tri||0, so_hoa_don: r.so_hoa_don||null, ghi_chu: r.ghi_chu||null,
    trang_thai: r.trang_thai, ngay_cap_nhat_trang_thai: r.ngay_cap_nhat_trang_thai||null
  };
  if (r.id) p.id = r.id; return p;
}
function mapReconciliationFromDb(r) { return { ...r }; }

function mapDocumentToDb(d) {
  const p = {
    phan_loai: d.phan_loai, doi_tac_id: d.doi_tac_id||null, doi_tac_ten: d.doi_tac_ten||null, doi_tac_ma: d.doi_tac_ma||null,
    mo_ta: d.mo_ta||null, ngay_gui: d.ngay_gui||null, ngay_nhan: d.ngay_nhan||null, trang_thai: d.trang_thai
  };
  if (d.id) p.id = d.id; return p;
}
function mapDocumentFromDb(r) { return { ...r }; }

function mapLeadToDb(l) {
  const p = {
    ten_doanh_nghiep: l.ten_doanh_nghiep, loai_hinh: l.loai_hinh||null, dia_diem: l.dia_diem||null, tuyen: l.tuyen||null,
    kenh: l.kenh||null, duong_dan: l.duong_dan||null, ghi_chu: l.ghi_chu||null
  };
  if (l.id) p.id = l.id; return p;
}
function mapLeadTypeToDb(t) {
  const p = { ten: t.ten };
  if (t.id) p.id = t.id; return p;
}

function mapOrderToDb(o) {
  const p = {
    bill_vit: o.bill_vit, khach_hang_id: o.khach_hang_id||null, khach_hang_name: o.khach_hang_name||null,
    nhan_vien: o.nhan_vien||null, bill_khach_hang: o.bill_khach_hang||null,
    bill_doi_tac: o.bill_doi_tac||null, kho_lay_hang: o.kho_lay_hang||null, ngay_giao_hang: o.ngay_giao_hang||null,
    nha_thau_id: o.nha_thau_id||null, nha_thau_ten: o.nha_thau_ten||null, nha_thau_ma: o.nha_thau_ma||null,
    bks: o.bks||null, tai_trong_xe: o.tai_trong_xe||0,
    tinh_gui: o.tinh_gui||null, phuong_gui: o.phuong_gui||null, nguoi_gui: o.nguoi_gui||null, dt_gui: o.dt_gui||null,
    sdt_nhan: o.sdt_nhan||null, ten_nhan: o.ten_nhan||null, dia_chi_nhan: o.dia_chi_nhan||null,
    tinh_nhan: o.tinh_nhan||null, phuong_nhan: o.phuong_nhan||null,
    san_pham: o.san_pham||null, khoi_luong: o.khoi_luong||0, so_kien: o.so_kien||0,
    cuoc_mua: o.cuoc_mua||0, phat_sinh_mua: o.phat_sinh_mua||0, tong_mua: o.tong_mua||0,
    cuoc_ban: o.cuoc_ban||0, phat_sinh_ban: o.phat_sinh_ban||0, tong_ban: o.tong_ban||0,
    loi_nhuan: o.loi_nhuan||0, ghi_chu: o.ghi_chu||null
  };
  if (o.id) p.id = o.id; return p;
}
function mapOrderFromDb(r) { return { ...r }; }

/* ============================================================
   CONN STATUS
   ============================================================ */
function updateConnStatusUI() {
  const p = document.querySelector('#ordersEmptyState p');
  if (p) p.textContent = ordersEmptyMessage();
}
function ordersEmptyMessage() {
  if (state.loading) return 'Đang tải dữ liệu từ Supabase…';
  if (state.useSupabase && state.cloudOnline === false) return 'Chưa tải được dữ liệu từ Supabase — đang tự thử lại…';
  return 'Chưa có đơn hàng nào. Nhấn "+ Tạo Đơn Hàng" để bắt đầu.';
}

/* ============================================================
   LOCATION DROPDOWNS
   ============================================================ */
/* ---- Searchable combobox (Tỉnh/Thành, Phường/Xã) ----
   Text input + filtered dropdown list. Gõ tự do vẫn được chấp nhận
   (không bắt buộc khớp chính xác danh sách gợi ý), vì dữ liệu phường/xã
   đầy đủ của 34 tỉnh sau sáp nhập quá lớn để liệt kê hết. */
function initCombobox(inputId, dropdownId, getOptionsFn, onSelectFn) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);

  function renderList(query) {
    const options = getOptionsFn(query || '');
    if (!options.length) {
      dropdown.innerHTML = '<div class="combo-empty">Không tìm thấy — có thể gõ tự do</div>';
    } else {
      dropdown.innerHTML = options.slice(0, 50).map(opt => `<div class="combo-item" data-val="${escHtml(opt)}">${escHtml(opt)}</div>`).join('');
    }
    dropdown.classList.add('open');
    dropdown.querySelectorAll('.combo-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = item.dataset.val;
        dropdown.classList.remove('open');
        if (typeof onSelectFn === 'function') onSelectFn(item.dataset.val);
      });
    });
  }

  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('input', () => { renderList(input.value); if (typeof onSelectFn === 'function') onSelectFn(input.value); });
  input.addEventListener('blur', () => { setTimeout(() => dropdown.classList.remove('open'), 120); });
}

function filterOptions(list, query) {
  if (!query) return list;
  const q = query.trim().toLowerCase();
  return list.filter(x => x.toLowerCase().includes(q));
}

function initLocationDropdowns() {
  initCombobox('orderTinhGui', 'orderTinhGuiDropdown', (q) => filterOptions(PROVINCE_LIST, q));
  initCombobox('orderTinhNhan', 'orderTinhNhanDropdown', (q) => filterOptions(PROVINCE_LIST, q));
  initCombobox('orderPhuongGui', 'orderPhuongGuiDropdown', (q) => {
    const province = document.getElementById('orderTinhGui').value;
    return filterOptions(VN_LOCATIONS[province] || [], q);
  });
  initCombobox('orderPhuongNhan', 'orderPhuongNhanDropdown', (q) => {
    const province = document.getElementById('orderTinhNhan').value;
    return filterOptions(VN_LOCATIONS[province] || [], q);
  });
}

/* ============================================================
   BILL VIT GENERATOR (supports batch offset for bulk import)
   ============================================================ */
function generateNextBillVit(offset) {
  offset = offset || 0;
  const prefix = 'VIT' + todayYYMMDD();
  let max = 0;
  state.orders.forEach(o => {
    if (o.bill_vit && o.bill_vit.startsWith(prefix)) {
      const n = parseInt(o.bill_vit.slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  });
  return prefix + pad(Math.min(max + 1 + offset, 9999), 4);
}

/* ============================================================
   CUSTOMER MODULE
   ============================================================ */
function customerLabel(c) { return c.ten_kh + (c.ma_kh ? ' (' + c.ma_kh + ')' : ''); }

/* Combobox gõ-để-tìm cho trường "Khách Hàng" trong form Đơn Hàng — cùng
   cơ chế với initOrderContractorCombobox(), luôn đọc trực tiếp từ
   state.customers nên không cần hàm "refresh" riêng. */
function initOrderCustomerCombobox() {
  const input = document.getElementById('orderKhachHangInput');
  const hidden = document.getElementById('orderKhachHang');
  const dropdown = document.getElementById('orderKhachHangDropdown');

  function matchingCustomers(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return state.customers;
    return state.customers.filter(c =>
      (c.ten_kh || '').toLowerCase().includes(q) || (c.ma_kh || '').toLowerCase().includes(q) || (c.sdt || '').toLowerCase().includes(q)
    );
  }

  function renderList(query) {
    const options = matchingCustomers(query);
    dropdown.innerHTML = options.length
      ? options.slice(0, 50).map(c => `<div class="combo-item" data-id="${c.id}">${escHtml(customerLabel(c))}</div>`).join('')
      : '<div class="combo-empty">Không tìm thấy khách hàng</div>';
    dropdown.classList.add('open');
    dropdown.querySelectorAll('.combo-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const c = state.customers.find(x => x.id === item.dataset.id);
        input.value = c ? customerLabel(c) : '';
        hidden.value = item.dataset.id;
        dropdown.classList.remove('open');
      });
    });
  }

  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('input', () => {
    renderList(input.value);
    const match = state.customers.find(c => customerLabel(c) === input.value);
    hidden.value = match ? match.id : '';
  });
  input.addEventListener('blur', () => { setTimeout(() => dropdown.classList.remove('open'), 120); });
}

function renderCustomerTable(q) {
  const tbody = document.getElementById('customerTableBody');
  const empty = document.getElementById('customerEmptyState');
  let list = state.customers;
  if (q) { const lq = q.toLowerCase(); list = list.filter(c => (c.ma_kh||'').toLowerCase().includes(lq) || (c.ten_kh||'').toLowerCase().includes(lq) || (c.sdt||'').toLowerCase().includes(lq)); }
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  const canEdit = can('customers', 'edit'), canDel = can('customers', 'delete');
  tbody.innerHTML = list.map(c => `
    <tr>
      <td class="cell-bill">${escHtml(c.ma_kh)}</td>
      <td>${escHtml(c.ten_kh)}</td>
      <td class="cell-muted">${escHtml(c.pic||'—')}</td>
      <td>${escHtml(c.sdt||'—')}</td>
      <td class="cell-muted">${escHtml(c.dia_chi||'—')}</td>
      <td class="cell-muted">${escHtml(c.mst||'—')}</td>
      <td class="row-actions"><div class="actions-inner">
        ${canEdit ? `<button class="btn-icon-sm" data-edit-c="${c.id}" title="Sửa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>` : ''}
        ${canDel ? `<button class="btn-icon-sm danger" data-del-c="${c.id}" title="Xóa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>
        </button>` : ''}
        ${!canEdit && !canDel ? '<span class="cell-muted">—</span>' : ''}
      </div></td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-edit-c]').forEach(b => b.addEventListener('click', () => openCustomerForm(b.dataset.editC)));
  tbody.querySelectorAll('[data-del-c]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.delC;
    askConfirm(state.orders.some(o => o.khach_hang_id === id) ? 'Khách hàng đang có đơn hàng. Vẫn xóa?' : 'Xóa khách hàng này?', async () => {
      await DB.deleteCustomer(id); await reloadCustomers(); showToast('Đã xóa khách hàng.', 'success');
    });
  }));
}

function openCustomerForm(id) {
  document.getElementById('customerForm').reset();
  state.editingCustomerId = id || null;
  if (id) {
    const c = state.customers.find(x => x.id === id);
    if (!c) return;
    document.getElementById('customerModalTitle').textContent = 'Sửa Khách Hàng';
    document.getElementById('customerId').value = c.id;
    document.getElementById('customerMaKH').value = c.ma_kh || '';
    document.getElementById('customerTen').value = c.ten_kh || '';
    document.getElementById('customerPIC').value = c.pic || '';
    document.getElementById('customerSDT').value = c.sdt || '';
    document.getElementById('customerDiaChi').value = c.dia_chi || '';
    document.getElementById('customerMST').value = c.mst || '';
  } else {
    document.getElementById('customerModalTitle').textContent = 'Thêm Khách Hàng';
    document.getElementById('customerId').value = '';
    document.getElementById('customerMaKH').value = 'KH' + pad(state.customers.length + 1, 4);
  }
  openModal('customerModalOverlay');
}

async function saveCustomer() {
  if (!requirePerm('customers', state.editingCustomerId ? 'edit' : 'create')) return;
  const maKH = document.getElementById('customerMaKH').value.trim();
  const ten = document.getElementById('customerTen').value.trim();
  const sdt = document.getElementById('customerSDT').value.trim();
  if (!maKH || !ten || !sdt) { showToast('Vui lòng điền đầy đủ các trường bắt buộc (*).', 'error'); return; }
  const c = { id: state.editingCustomerId || undefined, ma_kh: maKH, ten_kh: ten, pic: document.getElementById('customerPIC').value.trim(), sdt, dia_chi: document.getElementById('customerDiaChi').value.trim(), mst: document.getElementById('customerMST').value.trim() };
  try {
    if (state.editingCustomerId) {
      const ex = state.customers.find(x => x.id === state.editingCustomerId);
      c.id = state.editingCustomerId; c.created_at = ex ? ex.created_at : new Date().toISOString();
      await DB.updateCustomer(c); showToast('Đã cập nhật khách hàng.', 'success');
    } else { await DB.addCustomer(c); showToast('Đã thêm khách hàng mới.', 'success'); }
    await reloadCustomers(); closeModal('customerModalOverlay');
  } catch(e) { console.error(e); showToast('Lỗi khi lưu khách hàng: ' + friendlyError(e), 'error'); }
}

async function reloadCustomers() { await reloadTables(['customers']); }

/* ============================================================
   CONTRACTOR MODULE (Nhà Thầu)
   ============================================================ */
function contractorLabel(c) { return c.ten_nha_thau + (c.ma_nha_thau ? ' (' + c.ma_nha_thau + ')' : ''); }

/* Combobox gõ-để-tìm cho trường "Nhà Thầu" trong form Đơn Hàng — luôn đọc
   trực tiếp từ state.contractors mỗi lần gõ/focus nên không cần hàm "refresh"
   riêng: thêm/sửa/xóa nhà thầu ở nơi khác tự động phản ánh vào đây. */
function initOrderContractorCombobox() {
  const input = document.getElementById('orderNhaThauInput');
  const hidden = document.getElementById('orderNhaThau');
  const dropdown = document.getElementById('orderNhaThauDropdown');

  function matchingContractors(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return state.contractors;
    return state.contractors.filter(c =>
      (c.ten_nha_thau || '').toLowerCase().includes(q) || (c.ma_nha_thau || '').toLowerCase().includes(q)
    );
  }

  function renderList(query) {
    const options = matchingContractors(query);
    dropdown.innerHTML = options.length
      ? options.slice(0, 50).map(c => `<div class="combo-item" data-id="${c.id}">${escHtml(contractorLabel(c))}</div>`).join('')
      : '<div class="combo-empty">Không tìm thấy nhà thầu</div>';
    dropdown.classList.add('open');
    dropdown.querySelectorAll('.combo-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const c = state.contractors.find(x => x.id === item.dataset.id);
        input.value = c ? contractorLabel(c) : '';
        hidden.value = item.dataset.id;
        dropdown.classList.remove('open');
      });
    });
  }

  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('input', () => {
    renderList(input.value);
    // Chỉ giữ id đã chọn nếu text hiện tại khớp đúng 1 nhà thầu — gõ dở dang
    // hoặc xóa hết chữ thì coi như chưa chọn, tránh lưu nhầm id cũ không khớp.
    const match = state.contractors.find(c => contractorLabel(c) === input.value);
    hidden.value = match ? match.id : '';
  });
  input.addEventListener('blur', () => { setTimeout(() => dropdown.classList.remove('open'), 120); });
}

function renderContractorTable(q) {
  const tbody = document.getElementById('contractorTableBody');
  const empty = document.getElementById('contractorEmptyState');
  let list = state.contractors;
  if (q) { const lq = q.toLowerCase(); list = list.filter(c => (c.ma_nha_thau||'').toLowerCase().includes(lq) || (c.ten_nha_thau||'').toLowerCase().includes(lq) || (c.mst||'').toLowerCase().includes(lq)); }
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  const canEdit = can('contractors', 'edit'), canDel = can('contractors', 'delete');
  tbody.innerHTML = list.map(c => {
    const fileCount = Array.isArray(c.files) ? c.files.length : '…'; // '…' = chưa tải file (xem DB.loadContractorFiles)
    return `
    <tr>
      <td class="cell-bill">${escHtml(c.ma_nha_thau)}</td>
      <td>${escHtml(c.ten_nha_thau)}</td>
      <td class="cell-muted">${escHtml(c.mst||'—')}</td>
      <td class="cell-muted">${escHtml(c.loai_hinh||'—')}</td>
      <td class="cell-muted">${c.ky_doi_soat ? escHtml(c.ky_doi_soat) + ' ngày' : '—'}</td>
      <td><span class="badge-count">${svgFileIcon()} ${fileCount}</span></td>
      <td class="row-actions"><div class="actions-inner">
        <button class="btn-icon-sm" data-view-nt="${c.id}" title="Xem">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        ${canEdit ? `<button class="btn-icon-sm" data-edit-nt="${c.id}" title="Sửa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>` : ''}
        ${canDel ? `<button class="btn-icon-sm danger" data-del-nt="${c.id}" title="Xóa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>
        </button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-view-nt]').forEach(b => b.addEventListener('click', () => viewContractor(b.dataset.viewNt)));
  tbody.querySelectorAll('[data-edit-nt]').forEach(b => b.addEventListener('click', () => openContractorForm(b.dataset.editNt)));
  tbody.querySelectorAll('[data-del-nt]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.delNt;
    const contractor = state.contractors.find(x => x.id === id);
    const linked = state.orders.some(o => o.nha_thau_id === id) || state.reconciliations.some(r => r.nha_thau_id === id)
      || state.documents.some(d => d.phan_loai === 'Nhà thầu' && d.doi_tac_id === id);
    askConfirm(linked ? 'Nhà thầu đang có đơn hàng, bảng kê hoặc tài liệu liên quan. Vẫn xóa?' : 'Xóa nhà thầu này?', async () => {
      let files = [];
      try { files = contractor ? await DB.loadContractorFiles(contractor) : []; } catch(e) { console.warn('Không tải được danh sách file để dọn Storage:', e); }
      const paths = files.filter(f => f.path).map(f => f.path);
      if (paths.length && state.useSupabase && state.supabaseClient) {
        try { await state.supabaseClient.storage.from(CONTRACTOR_FILES_BUCKET).remove(paths); }
        catch (e) { console.warn('Lỗi xóa file trên Storage khi xóa nhà thầu:', e); }
      }
      await DB.deleteContractor(id); await reloadContractors(); showToast('Đã xóa nhà thầu.', 'success');
    });
  }));
}

function svgFileIcon() {
  return '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(2) + ' MB';
}

function renderContractorFileList() {
  const ul = document.getElementById('contractorFileList');
  const files = state.pendingContractorFiles;
  if (!files.length) { ul.innerHTML = '<li class="file-empty">Chưa có file đính kèm nào.</li>'; return; }
  ul.innerHTML = files.map(f => {
    if (f.status === 'uploading') {
      return `
      <li class="file-item">
        <div class="file-info">
          <span class="file-icon">📄</span>
          <div class="file-meta">
            <span class="file-name">${escHtml(f.name)}</span>
            <span class="file-size">${formatFileSize(f.size)} · Đang tải lên Supabase Storage...</span>
          </div>
        </div>
      </li>`;
    }
    return `
    <li class="file-item">
      <div class="file-info">
        <span class="file-icon">📄</span>
        <div class="file-meta">
          <span class="file-name">${escHtml(f.name)}</span>
          <span class="file-size">${formatFileSize(f.size)}</span>
        </div>
      </div>
      <div class="file-actions">
        <button type="button" class="btn-icon-sm" data-view-file="${f.id}" title="Xem / Tải">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        <button type="button" class="btn-icon-sm danger" data-remove-file="${f.id}" title="Xóa">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
        </button>
      </div>
    </li>`;
  }).join('');
  ul.querySelectorAll('[data-view-file]').forEach(b => b.addEventListener('click', () => {
    const f = state.pendingContractorFiles.find(x => x.id === b.dataset.viewFile);
    openContractorFile(f);
  }));
  ul.querySelectorAll('[data-remove-file]').forEach(b => b.addEventListener('click', async () => {
    const f = state.pendingContractorFiles.find(x => x.id === b.dataset.removeFile);
    // Nếu file đã tải lên Supabase Storage rồi (có path), xóa luôn trên storage
    // để tránh rác tồn đọng khi người dùng bỏ file trước khi lưu form.
    if (f && f.path && state.useSupabase && state.supabaseClient) {
      try { await state.supabaseClient.storage.from(CONTRACTOR_FILES_BUCKET).remove([f.path]); }
      catch (e) { console.warn('Lỗi xóa file trên Storage:', e); }
    }
    state.pendingContractorFiles = state.pendingContractorFiles.filter(x => x.id !== b.dataset.removeFile);
    renderContractorFileList();
  }));
}

/* Chrome (65+) chặn window.open() điều hướng thẳng tới một data: URI
   (chống lừa đảo qua data-URI phishing) — tab mới sẽ hiện trống với
   URL about:blank#blocked. Cách đúng là chuyển data URL thành Blob URL
   (URL.createObjectURL) rồi mới mở/tải, vì Blob URL không bị chặn. */
function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = /data:(.*?);base64/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function openContractorFile(f) {
  // File thật lưu trên Supabase Storage → mở thẳng URL công khai, không cần
  // chuyển đổi gì (URL http thật không bị chính sách chặn data: URI).
  if (f && f.url) { window.open(f.url, '_blank'); return; }
  // File nhỏ ở chế độ Local Storage (base64) → chuyển sang Blob URL trước khi mở.
  if (f && f.dataUrl) {
    try {
      const blob = dataUrlToBlob(f.dataUrl);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (e) {
      console.error('Lỗi mở file PDF:', e);
      showToast('Không thể mở file này.', 'error');
    }
    return;
  }
  showToast('Đây là file dữ liệu mẫu, không có nội dung thực tế để xem.', 'info');
}

async function uploadContractorFileToStorage(file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = 'contracts/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '_' + safeName;
  const { error } = await state.supabaseClient.storage
    .from(CONTRACTOR_FILES_BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (error) throw error;
  const { data: pub } = state.supabaseClient.storage.from(CONTRACTOR_FILES_BUCKET).getPublicUrl(path);
  return { path, url: pub.publicUrl };
}

async function handleContractorFiles(fileList) {
  const files = Array.prototype.slice.call(fileList);
  for (const file of files) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) { showToast('Chỉ chấp nhận file PDF: ' + file.name, 'error'); continue; }

    if (state.useSupabase && state.supabaseClient) {
      // Tải file thật lên Supabase Storage — bảng contractors chỉ lưu URL nhỏ
      // gọn, tránh nhồi base64 khổng lồ vào cột jsonb gây timeout truy vấn.
      const tempId = uid();
      state.pendingContractorFiles.push({ id: tempId, name: file.name, size: file.size, status: 'uploading', uploaded_at: new Date().toISOString() });
      renderContractorFileList();
      try {
        const { path, url } = await uploadContractorFileToStorage(file);
        const idx = state.pendingContractorFiles.findIndex(x => x.id === tempId);
        if (idx > -1) state.pendingContractorFiles[idx] = { id: tempId, name: file.name, size: file.size, url, path, uploaded_at: new Date().toISOString() };
        renderContractorFileList();
      } catch (e) {
        console.error('Lỗi tải file lên Supabase Storage:', e);
        showToast('Không thể tải file "' + file.name + '" lên Supabase Storage.', 'error');
        state.pendingContractorFiles = state.pendingContractorFiles.filter(x => x.id !== tempId);
        renderContractorFileList();
      }
    } else {
      // Chế độ Local Storage: vẫn nhúng base64 như trước, nhưng chặn file
      // quá lớn để không vượt quota localStorage của trình duyệt.
      if (file.size > MAX_LOCAL_FILE_SIZE) {
        showToast('File "' + file.name + '" vượt quá ' + formatFileSize(MAX_LOCAL_FILE_SIZE) + ' — chế độ Local Storage chỉ lưu được file nhỏ. Kết nối Supabase Cloud (⚙️ Cài Đặt) để lưu file lớn hơn.', 'error');
        continue;
      }
      await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = e => {
          state.pendingContractorFiles.push({ id: uid(), name: file.name, size: file.size, dataUrl: e.target.result, uploaded_at: new Date().toISOString() });
          renderContractorFileList();
          resolve();
        };
        reader.onerror = () => { showToast('Không thể đọc file: ' + file.name, 'error'); resolve(); };
        reader.readAsDataURL(file);
      });
    }
  }
}

async function openContractorForm(id) {
  document.getElementById('contractorForm').reset();
  state.editingContractorId = id || null;
  state.pendingContractorFiles = [];
  if (id) {
    const c = state.contractors.find(x => x.id === id);
    if (!c) return;
    // Phải có đủ danh sách file trước khi mở form: lưu form sẽ ghi đè cột files
    try {
      if (!Array.isArray(c.files)) showToast('Đang tải file đính kèm…', 'info');
      await DB.loadContractorFiles(c);
    } catch(e) { console.error(e); showToast('Không tải được file đính kèm: ' + friendlyError(e), 'error'); return; }
    document.getElementById('contractorModalTitle').textContent = 'Sửa Nhà Thầu';
    document.getElementById('contractorId').value = c.id;
    document.getElementById('contractorMa').value = c.ma_nha_thau || '';
    document.getElementById('contractorTen').value = c.ten_nha_thau || '';
    document.getElementById('contractorMST').value = c.mst || '';
    document.getElementById('contractorLoaiHinh').value = c.loai_hinh || 'Vận tải';
    document.getElementById('contractorDiaChi').value = c.dia_chi || '';
    document.getElementById('contractorSTK').value = c.stk || '';
    document.getElementById('contractorNganHang').value = c.ten_ngan_hang || '';
    document.getElementById('contractorKyDoiSoat').value = c.ky_doi_soat || '';
    state.pendingContractorFiles = JSON.parse(JSON.stringify(c.files || []));
  } else {
    document.getElementById('contractorModalTitle').textContent = 'Thêm Nhà Thầu';
    document.getElementById('contractorId').value = '';
    document.getElementById('contractorMa').value = 'NT' + pad(state.contractors.length + 1, 4);
    document.getElementById('contractorLoaiHinh').value = 'Vận tải';
  }
  renderContractorFileList();
  openModal('contractorModalOverlay');
}

async function viewContractor(id) {
  const c = state.contractors.find(x => x.id === id);
  if (!c) return;
  try {
    if (!Array.isArray(c.files)) showToast('Đang tải file đính kèm…', 'info');
    await DB.loadContractorFiles(c);
  } catch(e) { console.error(e); showToast('Không tải được file đính kèm: ' + friendlyError(e), 'error'); return; }
  const files = c.files || [];
  const filesHtml = files.length ? files.map(f => `
    <li class="file-item">
      <div class="file-info">
        <span class="file-icon">📄</span>
        <div class="file-meta">
          <span class="file-name">${escHtml(f.name)}</span>
          <span class="file-size">${formatFileSize(f.size)}</span>
        </div>
      </div>
      <div class="file-actions">
        <button type="button" class="btn-icon-sm" data-view-file-ro="${f.id}" title="Xem / Tải">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
      </div>
    </li>`).join('') : '<li class="file-empty">Chưa có file hợp đồng nào được đính kèm.</li>';

  document.getElementById('contractorViewContent').innerHTML = `
    <div class="view-grid">
      <div class="view-item"><span class="view-label">Mã Nhà Thầu</span><span class="view-value">${escHtml(c.ma_nha_thau)}</span></div>
      <div class="view-item"><span class="view-label">Tên Nhà Thầu</span><span class="view-value">${escHtml(c.ten_nha_thau)}</span></div>
      <div class="view-item"><span class="view-label">Mã Số Thuế</span><span class="view-value">${escHtml(c.mst||'—')}</span></div>
      <div class="view-item"><span class="view-label">Loại Hình</span><span class="view-value">${escHtml(c.loai_hinh||'—')}</span></div>
      <div class="view-item full"><span class="view-label">Địa Chỉ</span><span class="view-value">${escHtml(c.dia_chi||'—')}</span></div>
      <div class="view-item"><span class="view-label">Số Tài Khoản</span><span class="view-value">${escHtml(c.stk||'—')}</span></div>
      <div class="view-item"><span class="view-label">Ngân Hàng</span><span class="view-value">${escHtml(c.ten_ngan_hang||'—')}</span></div>
      <div class="view-item"><span class="view-label">Kỳ Đối Soát</span><span class="view-value">${c.ky_doi_soat ? escHtml(c.ky_doi_soat) + ' ngày' : '—'}</span></div>
      <div class="view-divider"></div>
      <div class="view-section-title">File Hợp Đồng &amp; Phụ Lục (${files.length})</div>
    </div>
    <ul class="file-list" style="margin-top:12px;">${filesHtml}</ul>`;

  openModal('contractorViewModalOverlay');
  document.querySelectorAll('[data-view-file-ro]').forEach(b => b.addEventListener('click', () => {
    const f = files.find(x => x.id === b.dataset.viewFileRo);
    openContractorFile(f);
  }));
}

async function saveContractor() {
  if (!requirePerm('contractors', state.editingContractorId ? 'edit' : 'create')) return;
  const ma =document.getElementById('contractorMa').value.trim();
  const ten = document.getElementById('contractorTen').value.trim();
  const kyDoiSoat = parseInt(document.getElementById('contractorKyDoiSoat').value, 10);
  if (!ma || !ten) { showToast('Vui lòng điền đầy đủ các trường bắt buộc (*).', 'error'); return; }
  if (!kyDoiSoat || isNaN(kyDoiSoat) || kyDoiSoat <= 0) { showToast('Vui lòng nhập Kỳ Đối Soát hợp lệ (số ngày lớn hơn 0).', 'error'); return; }
  const dup = state.contractors.find(x => x.ma_nha_thau.toLowerCase() === ma.toLowerCase() && x.id !== state.editingContractorId);
  if (dup) { showToast('Mã Nhà Thầu này đã tồn tại.', 'error'); return; }
  const c = {
    id: state.editingContractorId || undefined,
    ma_nha_thau: ma, ten_nha_thau: ten,
    mst: document.getElementById('contractorMST').value.trim(),
    loai_hinh: document.getElementById('contractorLoaiHinh').value,
    dia_chi: document.getElementById('contractorDiaChi').value.trim(),
    stk: document.getElementById('contractorSTK').value.trim(),
    ten_ngan_hang: document.getElementById('contractorNganHang').value.trim(),
    ky_doi_soat: kyDoiSoat,
    files: state.pendingContractorFiles
  };
  try {
    if (state.editingContractorId) {
      const ex = state.contractors.find(x => x.id === state.editingContractorId);
      c.id = state.editingContractorId; c.created_at = ex ? ex.created_at : new Date().toISOString();
      await DB.updateContractor(c); showToast('Đã cập nhật nhà thầu.', 'success');
      // Keep denormalized contractor info in existing reconciliations in sync
      // (chỉ khi có quyền sửa bảng kê — không thì RLS chặn, bảng kê giữ tên cũ)
      const toSync = can('reconciliations', 'edit') ? state.reconciliations.filter(r => r.nha_thau_id === c.id) : [];
      for (const r of toSync) { r.nha_thau_ten = c.ten_nha_thau; r.nha_thau_ma = c.ma_nha_thau; await DB.updateReconciliation(r); }
      if (toSync.length) await reloadReconciliations();
    } else { await DB.addContractor(c); showToast('Đã thêm nhà thầu mới.', 'success'); }
    await reloadContractors(); closeModal('contractorModalOverlay');
  } catch(e) { console.error(e); showToast('Lỗi khi lưu nhà thầu: ' + friendlyError(e), 'error'); }
}

async function reloadContractors() {
  await reloadTables(['contractors']);
  if (state.currentView === 'contractors') prefetchContractorFiles();
}

/* ============================================================
   RECONCILIATION MODULE (Bảng Kê Đối Soát)
   ============================================================ */
const RECON_STATUS_CLASS = {
  'Chưa nhận hồ sơ': 'status-badge-pending',
  'Đã nhận hồ sơ': 'status-badge-received',
  'Đã hoàn thiện hồ sơ': 'status-badge-complete'
};

function formatDateVN(iso) {
  if (!iso) return '—';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}
function todayISODate() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth()+1,2) + '-' + pad(d.getDate(),2);
}
function generateMaBangKe() {
  const d = new Date();
  const prefix = 'BK-' + pad(d.getFullYear()%100,2) + pad(d.getMonth()+1,2) + pad(d.getDate(),2) + '-';
  const count = state.reconciliations.filter(r => (r.ma_bang_ke||'').indexOf(prefix) === 0).length;
  return prefix + pad(count + 1, 3);
}

/* Combobox gõ-để-tìm cho trường "Chọn Nhà Thầu Vận Tải" trong form Tạo
   Bảng Kê — cùng cơ chế với initOrderContractorCombobox(). */
function initReconContractorCombobox() {
  const input = document.getElementById('reconNhaThauInput');
  const hidden = document.getElementById('reconNhaThau');
  const dropdown = document.getElementById('reconNhaThauDropdown');

  function matchingContractors(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return state.contractors;
    return state.contractors.filter(c =>
      (c.ten_nha_thau || '').toLowerCase().includes(q) || (c.ma_nha_thau || '').toLowerCase().includes(q)
    );
  }

  function renderList(query) {
    const options = matchingContractors(query);
    dropdown.innerHTML = options.length
      ? options.slice(0, 50).map(c => `<div class="combo-item" data-id="${c.id}">${escHtml(contractorLabel(c))}</div>`).join('')
      : '<div class="combo-empty">Không tìm thấy nhà thầu</div>';
    dropdown.classList.add('open');
    dropdown.querySelectorAll('.combo-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const c = state.contractors.find(x => x.id === item.dataset.id);
        input.value = c ? contractorLabel(c) : '';
        hidden.value = item.dataset.id;
        dropdown.classList.remove('open');
      });
    });
  }

  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('input', () => {
    renderList(input.value);
    const match = state.contractors.find(c => contractorLabel(c) === input.value);
    hidden.value = match ? match.id : '';
  });
  input.addEventListener('blur', () => { setTimeout(() => dropdown.classList.remove('open'), 120); });
}

/* Tìm kiếm chung: khớp với BẤT KỲ chữ nào hiện trên dòng, không phân biệt
   hoa/thường và dấu tiếng Việt ("da gui" khớp "Đã gửi"). */
function normSearch(s) {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}
function rowMatchesSearch(q, parts) {
  const nq = normSearch(q).trim();
  return !nq || normSearch(parts.join(' | ')).includes(nq);
}

/* Ô lọc gõ-để-tìm (lọc nhà thầu ở Bảng Kê, lọc doanh nghiệp ở Tài Liệu): gõ để tìm thay vì cuộn danh sách.
   Đang gõ dở → bảng lọc ngay theo chữ đã gõ; chọn 1 gợi ý → lọc đúng mục đó. Để trống = tất cả.
   options(): [{ value, label }]; giá trị đã chọn nằm ở ô hidden, chữ đang gõ ở ô input. */
function initFilterCombo({ wrapId, inputId, hiddenId, dropdownId, clearId, options, emptyText, onChange }) {
  const wrap = document.getElementById(wrapId);
  const input = document.getElementById(inputId);
  const hidden = document.getElementById(hiddenId);
  const dropdown = document.getElementById(dropdownId);
  const changed = () => { wrap.classList.toggle('has-value', !!input.value); onChange(); };

  function renderList() {
    const q = normSearch(input.value).trim();
    const list = options().filter(o => !q || normSearch(o.label).includes(q));
    dropdown.innerHTML = list.length
      ? list.slice(0, 50).map(o => `<div class="combo-item${o.value === hidden.value ? ' active' : ''}" data-value="${escHtml(o.value)}">${escHtml(o.label)}</div>`).join('')
      : `<div class="combo-empty">${escHtml(emptyText)}</div>`;
    dropdown.classList.add('open');
    dropdown.querySelectorAll('.combo-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const o = options().find(x => x.value === item.dataset.value);
        input.value = o ? o.label : '';
        hidden.value = item.dataset.value;
        dropdown.classList.remove('open');
        input.blur();
        changed();
      });
    });
  }

  input.addEventListener('focus', renderList);
  input.addEventListener('input', () => {
    const match = options().find(o => o.label === input.value);
    hidden.value = match ? match.value : '';
    renderList();
    changed();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const first = dropdown.querySelector('.combo-item'); if (first) first.dispatchEvent(new MouseEvent('mousedown')); }
    if (e.key === 'Escape') { dropdown.classList.remove('open'); input.blur(); }
  });
  input.addEventListener('blur', () => { setTimeout(() => dropdown.classList.remove('open'), 120); });
  const clear = () => { input.value = ''; hidden.value = ''; dropdown.classList.remove('open'); changed(); };
  document.getElementById(clearId).addEventListener('click', clear);
  return { clear };
}

function initReconContractorFilter() {
  initFilterCombo({
    wrapId: 'reconContractorFilterWrap', inputId: 'reconContractorFilterInput', hiddenId: 'reconciliationContractorFilter',
    dropdownId: 'reconContractorFilterDropdown', clearId: 'reconContractorFilterClear', emptyText: 'Không tìm thấy nhà thầu',
    options: () => state.contractors
      .slice().sort((a, b) => (a.ten_nha_thau||'').localeCompare(b.ten_nha_thau||'', 'vi'))
      .map(c => ({ value: c.id, label: contractorLabel(c) })),
    onChange: () => renderReconciliationTable(document.getElementById('reconciliationSearchInput').value)
  });
}

function getFilteredReconciliations(q) {
  const statusFilter = document.getElementById('reconciliationStatusFilter').value;
  const contractorId = document.getElementById('reconciliationContractorFilter').value;
  const contractorText = normSearch(document.getElementById('reconContractorFilterInput').value).trim();
  let list = state.reconciliations;
  if (contractorId) list = list.filter(r => r.nha_thau_id === contractorId);
  else if (contractorText) list = list.filter(r => normSearch((r.nha_thau_ten || '') + ' ' + (r.nha_thau_ma || '')).includes(contractorText));
  if (statusFilter) list = list.filter(r => r.trang_thai === statusFilter);
  if (q) {
    list = list.filter(r => rowMatchesSearch(q, [
      r.ma_bang_ke, r.nha_thau_ten, r.nha_thau_ma, r.so_hoa_don, r.gia_tri, formatCurrency(r.gia_tri),
      r.trang_thai, r.ghi_chu, formatDateVN(r.ngay_nhan), formatDateVN(r.ngay_cap_nhat_trang_thai)
    ]));
  }
  return list;
}

function renderReconciliationTable(q) {
  const tbody = document.getElementById('reconciliationTableBody');
  const empty = document.getElementById('reconciliationEmptyState');
  const list = getFilteredReconciliations(q);
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  const canEdit = can('reconciliations', 'edit'), canDel = can('reconciliations', 'delete');
  tbody.innerHTML = list.map(r => {
    const cls = RECON_STATUS_CLASS[r.trang_thai] || '';
    const dateLine = r.ngay_cap_nhat_trang_thai ? `<span class="status-date">Cập nhật: ${formatDateVN(r.ngay_cap_nhat_trang_thai)}</span>` : '';
    return `
    <tr>
      <td class="cell-bill">${escHtml(r.ma_bang_ke)}</td>
      <td>
        <div class="cell-contractor">
          <span>${escHtml(r.nha_thau_ten)}</span>
          ${r.ghi_chu ? `<span class="cell-muted" style="font-size:12px;">${escHtml(r.ghi_chu)}</span>` : ''}
        </div>
      </td>
      <td class="cell-muted">${escHtml(r.so_hoa_don||'—')}</td>
      <td class="text-right">${formatCurrency(r.gia_tri)}</td>
      <td><div class="status-cell"><span class="status-badge ${cls}">${escHtml(r.trang_thai)}</span>${dateLine}</div></td>
      <td class="row-actions"><div class="actions-inner">
        <button class="btn-icon-sm" data-view-r="${r.id}" title="Xem chi tiết">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        ${canEdit ? `<button class="btn-icon-sm" data-edit-r="${r.id}" title="Sửa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="btn-icon-sm" data-status-r="${r.id}" title="Cập nhật trạng thái">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
        </button>` : ''}
        ${canDel ? `<button class="btn-icon-sm danger" data-del-r="${r.id}" title="Xóa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
        </button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-view-r]').forEach(b => b.addEventListener('click', () => viewReconciliation(b.dataset.viewR)));
  tbody.querySelectorAll('[data-edit-r]').forEach(b => b.addEventListener('click', () => openReconciliationForm(b.dataset.editR)));
  tbody.querySelectorAll('[data-status-r]').forEach(b => b.addEventListener('click', () => openReconStatusModal(b.dataset.statusR)));
  tbody.querySelectorAll('[data-del-r]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.delR;
    askConfirm('Xóa bảng kê này?', async () => { await DB.deleteReconciliation(id); await reloadReconciliations(); showToast('Đã xóa bảng kê.', 'success'); });
  }));
}

function openReconciliationForm(id) {
  if (!id && !state.contractors.length) { showToast('Vui lòng thêm nhà thầu trước khi tạo bảng kê.', 'error'); return; }
  document.getElementById('reconciliationForm').reset();
  document.getElementById('reconGiaTri').dataset.raw = '';

  const initialStatusGroup = document.getElementById('reconTrangThaiInitialGroup');
  const editStatusNote = document.getElementById('reconEditStatusNote');

  if (id) {
    const r = state.reconciliations.find(x => x.id === id);
    if (!r) return;
    document.getElementById('reconciliationModalTitle').textContent = 'Sửa Bảng Kê Đối Soát';
    document.getElementById('reconciliationEditId').value = r.id;
    document.getElementById('reconMaBangKe').value = r.ma_bang_ke;
    const nt = state.contractors.find(c => c.id === r.nha_thau_id);
    document.getElementById('reconNhaThauInput').value = nt ? contractorLabel(nt) : (r.nha_thau_ten || '');
    document.getElementById('reconNhaThau').value = r.nha_thau_id || '';
    document.getElementById('reconNgayNhan').value = r.ngay_nhan || '';
    document.getElementById('reconGiaTri').value = formatNumberInput(r.gia_tri);
    document.getElementById('reconGiaTri').dataset.raw = String(r.gia_tri || 0);
    document.getElementById('reconSoHoaDon').value = r.so_hoa_don || '';
    document.getElementById('reconGhiChu').value = r.ghi_chu || '';
    // Sửa bảng kê KHÔNG đụng đến trạng thái — trạng thái chỉ đổi qua modal
    // "Cập Nhật Trạng Thái" riêng, để không quên cập nhật ngày kèm theo.
    initialStatusGroup.style.display = 'none';
    editStatusNote.style.display = '';
  } else {
    document.getElementById('reconciliationModalTitle').textContent = 'Tạo Bảng Kê Đối Soát Mới';
    document.getElementById('reconciliationEditId').value = '';
    document.getElementById('reconMaBangKe').value = generateMaBangKe();
    document.getElementById('reconNgayNhan').value = todayISODate();
    document.getElementById('reconTrangThaiInitial').value = 'Chưa nhận hồ sơ';
    initialStatusGroup.style.display = '';
    editStatusNote.style.display = 'none';
  }
  openModal('reconciliationModalOverlay');
}

async function saveReconciliation() {
  const editId = document.getElementById('reconciliationEditId').value;
  if (!requirePerm('reconciliations', editId ? 'edit' : 'create')) return;
  const contractorId = document.getElementById('reconNhaThau').value;
  const ngayNhan = document.getElementById('reconNgayNhan').value;
  const giaTri = parseCurrencyInput(document.getElementById('reconGiaTri').value);
  if (!contractorId || !ngayNhan || !giaTri) { showToast('Vui lòng điền đầy đủ các trường bắt buộc (*).', 'error'); return; }
  const nt = state.contractors.find(c => c.id === contractorId);

  try {
    if (editId) {
      const existing = state.reconciliations.find(x => x.id === editId);
      if (!existing) { showToast('Không tìm thấy bảng kê để sửa.', 'error'); return; }
      const r = {
        ...existing,
        nha_thau_id: contractorId, nha_thau_ten: nt ? nt.ten_nha_thau : '', nha_thau_ma: nt ? nt.ma_nha_thau : '',
        ngay_nhan: ngayNhan, gia_tri: giaTri,
        so_hoa_don: document.getElementById('reconSoHoaDon').value.trim(),
        ghi_chu: document.getElementById('reconGhiChu').value.trim()
        // trang_thai và ngay_cap_nhat_trang_thai giữ nguyên như cũ, không đụng tới
      };
      await DB.updateReconciliation(r);
      await reloadReconciliations();
      closeModal('reconciliationModalOverlay');
      showToast('Đã cập nhật bảng kê.', 'success');
    } else {
      const r = {
        ma_bang_ke: document.getElementById('reconMaBangKe').value,
        nha_thau_id: contractorId, nha_thau_ten: nt ? nt.ten_nha_thau : '', nha_thau_ma: nt ? nt.ma_nha_thau : '',
        ngay_nhan: ngayNhan, gia_tri: giaTri,
        so_hoa_don: document.getElementById('reconSoHoaDon').value.trim(),
        ghi_chu: document.getElementById('reconGhiChu').value.trim(),
        trang_thai: document.getElementById('reconTrangThaiInitial').value,
        ngay_cap_nhat_trang_thai: todayISODate()
      };
      await DB.addReconciliation(r);
      await reloadReconciliations();
      closeModal('reconciliationModalOverlay');
      showToast('Đã tạo bảng kê đối soát mới.', 'success');
    }
  } catch(e) { console.error(e); showToast('Lỗi khi lưu bảng kê: ' + friendlyError(e), 'error'); }
}

function viewReconciliation(id) {
  const r = state.reconciliations.find(x => x.id === id);
  if (!r) return;
  state.editingReconId = id;
  const cls = RECON_STATUS_CLASS[r.trang_thai] || '';
  document.getElementById('reconciliationViewContent').innerHTML = `
    <div class="view-grid">
      <div class="view-item"><span class="view-label">Mã Bảng Kê</span><span class="view-value">${escHtml(r.ma_bang_ke)}</span></div>
      <div class="view-item"><span class="view-label">Trạng Thái</span><span class="view-value"><span class="status-badge ${cls}">${escHtml(r.trang_thai)}</span></span></div>
      <div class="view-item full"><span class="view-label">Nhà Thầu</span><span class="view-value">${escHtml(r.nha_thau_ten)} (${escHtml(r.nha_thau_ma)})</span></div>
      <div class="view-item"><span class="view-label">Số Hóa Đơn VAT</span><span class="view-value">${escHtml(r.so_hoa_don||'—')}</span></div>
      <div class="view-item"><span class="view-label">Ngày Nhận Hồ Sơ</span><span class="view-value">${formatDateVN(r.ngay_nhan)}</span></div>
      <div class="view-item"><span class="view-label">Ngày Cập Nhật Trạng Thái</span><span class="view-value">${formatDateVN(r.ngay_cap_nhat_trang_thai)}</span></div>
      <div class="view-item"><span class="view-label">Giá Trị Bảng Kê</span><span class="view-value">${formatCurrency(r.gia_tri)}</span></div>
      <div class="view-item full"><span class="view-label">Ghi Chú</span><span class="view-value">${escHtml(r.ghi_chu||'—')}</span></div>
    </div>`;
  openModal('reconciliationViewModalOverlay');
}

function openReconStatusModal(id) {
  const r = state.reconciliations.find(x => x.id === id);
  if (!r) return;
  state.editingReconId = id;
  document.getElementById('reconStatusSummary').innerHTML = `Bảng kê <strong>${escHtml(r.ma_bang_ke)}</strong> — Nhà thầu <strong>${escHtml(r.nha_thau_ten)}</strong>`;
  document.querySelectorAll('input[name="reconStatusNew"]').forEach(radio => { radio.checked = (radio.value === r.trang_thai); });
  document.getElementById('reconStatusDate').value = r.ngay_cap_nhat_trang_thai || todayISODate();
  openModal('reconciliationStatusModalOverlay');
}

async function saveReconStatus() {
  if (!state.editingReconId || !requirePerm('reconciliations', 'edit')) return;
  const selected = document.querySelector('input[name="reconStatusNew"]:checked');
  if (!selected) { showToast('Vui lòng chọn một trạng thái.', 'error'); return; }
  const r = state.reconciliations.find(x => x.id === state.editingReconId);
  if (!r) return;
  r.trang_thai = selected.value;
  r.ngay_cap_nhat_trang_thai = document.getElementById('reconStatusDate').value || todayISODate();
  try {
    await DB.updateReconciliation(r);
    await reloadReconciliations();
    closeModal('reconciliationStatusModalOverlay');
    showToast('Đã cập nhật trạng thái hồ sơ.', 'success');
  } catch(e) { console.error(e); showToast('Lỗi khi cập nhật trạng thái: ' + friendlyError(e), 'error'); }
}

async function reloadReconciliations() { await reloadTables(['reconciliations']); }

/* ============================================================
   DOCUMENT MODULE (Quản Lý Tài Liệu — hồ sơ GỬI ĐI cho Khách hàng / Nhà thầu)
   Dùng chung quyền module 'reconciliations' (Bảng Kê & Tài Liệu).
   ============================================================ */
const DOC_TYPE_CUSTOMER = 'Khách hàng', DOC_TYPE_CONTRACTOR = 'Nhà thầu';
const DOC_STATUS_SENT = 'Đã gửi', DOC_STATUS_RETURNED = 'Đã nhận lại';
const DOC_STATUS_CLASS = {
  [DOC_STATUS_SENT]: 'status-badge-received',
  [DOC_STATUS_RETURNED]: 'status-badge-complete'
};
const DOCUMENTS_SQL_HINT = 'Chưa tạo bảng Tài Liệu trên Supabase — Admin cần chạy file supabase_documents_setup.sql.';

// Nguồn chọn doanh nghiệp theo luồng gửi: Khách hàng hoặc Nhà thầu
function docPartnerSource(type) {
  return type === DOC_TYPE_CUSTOMER
    ? { list: state.customers, label: customerLabel, name: c => c.ten_kh, code: c => c.ma_kh, empty: 'Không tìm thấy khách hàng' }
    : { list: state.contractors, label: contractorLabel, name: c => c.ten_nha_thau, code: c => c.ma_nha_thau, empty: 'Không tìm thấy nhà thầu' };
}
// Tên/mã doanh nghiệp: ưu tiên dữ liệu hiện tại (đã đổi tên vẫn đúng), mất liên kết thì dùng tên đã lưu
function docPartner(d) {
  const src = docPartnerSource(d.phan_loai);
  const p = d.doi_tac_id ? src.list.find(x => x.id === d.doi_tac_id) : null;
  return p ? { name: src.name(p) || '', code: src.code(p) || '' } : { name: d.doi_tac_ten || '', code: d.doi_tac_ma || '' };
}
function docPartnerKey(d) { return d.phan_loai + '|' + (d.doi_tac_id || d.doi_tac_ten || ''); }
function selectedDocType() {
  const r = document.querySelector('input[name="docPhanLoai"]:checked');
  return r ? r.value : DOC_TYPE_CONTRACTOR;
}

/* Combobox "Doanh Nghiệp" trong form Gửi Tài Liệu — đọc danh sách theo luồng
   đang chọn (Khách hàng / Nhà thầu) mỗi lần gõ/focus. */
function initDocPartnerCombobox() {
  const input = document.getElementById('docDoiTacInput');
  const hidden = document.getElementById('docDoiTac');
  const dropdown = document.getElementById('docDoiTacDropdown');

  function renderList(query) {
    const src = docPartnerSource(selectedDocType());
    const q = normSearch(query).trim();
    const options = q ? src.list.filter(p => normSearch(src.label(p)).includes(q)) : src.list;
    dropdown.innerHTML = options.length
      ? options.slice(0, 50).map(p => `<div class="combo-item" data-id="${p.id}">${escHtml(src.label(p))}</div>`).join('')
      : `<div class="combo-empty">${src.empty}</div>`;
    dropdown.classList.add('open');
    dropdown.querySelectorAll('.combo-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const p = src.list.find(x => x.id === item.dataset.id);
        input.value = p ? src.label(p) : '';
        hidden.value = item.dataset.id;
        dropdown.classList.remove('open');
      });
    });
  }

  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('input', () => {
    renderList(input.value);
    const src = docPartnerSource(selectedDocType());
    const match = src.list.find(p => src.label(p) === input.value);
    hidden.value = match ? match.id : '';
  });
  input.addEventListener('blur', () => { setTimeout(() => dropdown.classList.remove('open'), 120); });

  // Đổi luồng gửi → xóa doanh nghiệp đã chọn (id của khách hàng không dùng được cho nhà thầu)
  document.querySelectorAll('input[name="docPhanLoai"]').forEach(radio => radio.addEventListener('change', () => {
    input.value = ''; hidden.value = '';
    updateDocPartnerLabel();
  }));
}
function updateDocPartnerLabel() {
  const isCustomer = selectedDocType() === DOC_TYPE_CUSTOMER;
  document.getElementById('docDoiTacLabel').innerHTML = (isCustomer ? 'Khách Hàng' : 'Nhà Thầu') + ' <span class="req">*</span>';
  document.getElementById('docDoiTacInput').placeholder = isCustomer ? 'Gõ để tìm khách hàng...' : 'Gõ để tìm nhà thầu...';
}

// Gợi ý cho ô lọc doanh nghiệp: các khách hàng / nhà thầu đã từng được gửi tài liệu (theo phân loại đang lọc)
function documentPartnerOptions() {
  const typeFilter = document.getElementById('documentTypeFilter').value;
  const seen = new Map();
  state.documents.forEach(d => {
    if (typeFilter && d.phan_loai !== typeFilter) return;
    const key = docPartnerKey(d);
    if (seen.has(key)) return;
    const p = docPartner(d);
    seen.set(key, { value: key, label: p.name + (p.code ? ' (' + p.code + ')' : '') });
  });
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}
let documentPartnerFilter = null;
function initDocumentPartnerFilter() {
  documentPartnerFilter = initFilterCombo({
    wrapId: 'documentPartnerFilterWrap', inputId: 'documentPartnerFilterInput', hiddenId: 'documentPartnerFilter',
    dropdownId: 'documentPartnerFilterDropdown', clearId: 'documentPartnerFilterClear', emptyText: 'Không tìm thấy doanh nghiệp',
    options: documentPartnerOptions,
    onChange: () => renderDocumentTable(document.getElementById('documentSearchInput').value)
  });
}

function getFilteredDocuments(q) {
  const typeFilter = document.getElementById('documentTypeFilter').value;
  const partnerKey = document.getElementById('documentPartnerFilter').value;
  const partnerText = normSearch(document.getElementById('documentPartnerFilterInput').value).trim();
  const statusFilter = document.getElementById('documentStatusFilter').value;
  let list = state.documents;
  if (typeFilter) list = list.filter(d => d.phan_loai === typeFilter);
  if (partnerKey) list = list.filter(d => docPartnerKey(d) === partnerKey);
  else if (partnerText) list = list.filter(d => { const p = docPartner(d); return normSearch(p.name + ' ' + p.code).includes(partnerText); });
  if (statusFilter) list = list.filter(d => d.trang_thai === statusFilter);
  if (q) {
    list = list.filter(d => {
      const p = docPartner(d);
      return rowMatchesSearch(q, [p.name, p.code, d.doi_tac_ten, d.phan_loai, d.mo_ta, d.trang_thai, formatDateVN(d.ngay_gui), formatDateVN(d.ngay_nhan)]);
    });
  }
  // Mới gửi lên đầu
  return list.slice().sort((a, b) => (b.ngay_gui || '').localeCompare(a.ngay_gui || '') || (b.created_at || '').localeCompare(a.created_at || ''));
}

function renderDocumentTable(q) {
  const tbody = document.getElementById('documentTableBody');
  const empty = document.getElementById('documentEmptyState');
  const list = getFilteredDocuments(q);
  if (!list.length) {
    tbody.innerHTML = '';
    empty.querySelector('p').textContent = state.missingTables.has('documents')
      ? DOCUMENTS_SQL_HINT
      : (state.documents.length ? 'Không có tài liệu nào khớp bộ lọc.' : 'Chưa có tài liệu gửi đi nào. Bấm "+ Thêm mới" → "Gửi Tài Liệu" để bắt đầu.');
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';
  const canEdit = can('reconciliations', 'edit'), canDel = can('reconciliations', 'delete');
  tbody.innerHTML = list.map(d => {
    const p = docPartner(d);
    const cls = DOC_STATUS_CLASS[d.trang_thai] || '';
    return `
    <tr>
      <td class="cell-nowrap">${escHtml(p.name || '—')}</td>
      <td class="cell-nowrap">${escHtml(d.phan_loai)}</td>
      <td class="cell-desc">${escHtml(d.mo_ta || '—')}</td>
      <td class="cell-muted">${formatDateVN(d.ngay_gui)}</td>
      <td class="cell-muted">${formatDateVN(d.ngay_nhan)}</td>
      <td><span class="status-badge ${cls}">${escHtml(d.trang_thai)}</span></td>
      <td class="row-actions"><div class="actions-inner">
        <button class="btn-icon-sm" data-view-d="${d.id}" title="Xem chi tiết">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>
        ${canEdit ? `<button class="btn-icon-sm" data-edit-d="${d.id}" title="Sửa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="btn-icon-sm" data-status-d="${d.id}" title="Cập nhật trạng thái">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
        </button>` : ''}
        ${canDel ? `<button class="btn-icon-sm danger" data-del-d="${d.id}" title="Xóa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
        </button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('[data-view-d]').forEach(b => b.addEventListener('click', () => viewDocument(b.dataset.viewD)));
  tbody.querySelectorAll('[data-edit-d]').forEach(b => b.addEventListener('click', () => openDocumentForm(b.dataset.editD)));
  tbody.querySelectorAll('[data-status-d]').forEach(b => b.addEventListener('click', () => openDocStatusModal(b.dataset.statusD)));
  tbody.querySelectorAll('[data-del-d]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.delD;
    askConfirm('Xóa tài liệu này?', async () => { await DB.deleteDocument(id); await reloadDocuments(); showToast('Đã xóa tài liệu.', 'success'); });
  }));
}

function openDocumentForm(id) {
  if (state.missingTables.has('documents')) { showToast(DOCUMENTS_SQL_HINT, 'error'); return; }
  document.getElementById('documentForm').reset();
  const ngayNhanInput = document.getElementById('docNgayNhan');
  let type, d = null;
  if (id) {
    d = state.documents.find(x => x.id === id);
    if (!d) return;
    type = d.phan_loai;
  } else {
    // Đang lọc theo 1 phân loại → mặc định gửi theo đúng luồng đó
    type = document.getElementById('documentTypeFilter').value || DOC_TYPE_CONTRACTOR;
  }
  document.querySelectorAll('input[name="docPhanLoai"]').forEach(r => { r.checked = r.value === type; });
  updateDocPartnerLabel();

  if (d) {
    const src = docPartnerSource(d.phan_loai);
    const p = d.doi_tac_id ? src.list.find(x => x.id === d.doi_tac_id) : null;
    document.getElementById('documentModalTitle').textContent = 'Sửa Tài Liệu Gửi';
    document.getElementById('documentEditId').value = d.id;
    document.getElementById('docDoiTacInput').value = p ? src.label(p) : (d.doi_tac_ten || '');
    document.getElementById('docDoiTac').value = p ? p.id : '';
    document.getElementById('docMoTa').value = d.mo_ta || '';
    document.getElementById('docNgayGui').value = d.ngay_gui || '';
    ngayNhanInput.value = d.ngay_nhan || '';
    // Ngày nhận đi kèm trạng thái "Đã nhận lại" — chưa nhận thì cập nhật qua nút "Cập nhật trạng thái"
    ngayNhanInput.disabled = d.trang_thai !== DOC_STATUS_RETURNED;
    document.getElementById('docNgayNhanGroup').style.display = '';
  } else {
    document.getElementById('documentModalTitle').textContent = 'Gửi Tài Liệu Mới';
    document.getElementById('documentEditId').value = '';
    document.getElementById('docNgayGui').value = todayISODate();
    document.getElementById('docNgayNhanGroup').style.display = 'none';
  }
  openModal('documentModalOverlay');
}

async function saveDocument() {
  const editId = document.getElementById('documentEditId').value;
  if (!requirePerm('reconciliations', editId ? 'edit' : 'create')) return;
  if (state.missingTables.has('documents')) { showToast(DOCUMENTS_SQL_HINT, 'error'); return; }
  const type = selectedDocType();
  const partnerId = document.getElementById('docDoiTac').value;
  const ngayGui = document.getElementById('docNgayGui').value;
  const existing = editId ? state.documents.find(x => x.id === editId) : null;
  if (editId && !existing) { showToast('Không tìm thấy tài liệu để sửa.', 'error'); return; }
  // Sửa tài liệu cũ mà doanh nghiệp đã bị xóa: giữ nguyên tên đã lưu nếu người dùng không chọn lại
  const keepOldPartner = existing && !partnerId && existing.phan_loai === type && !!existing.doi_tac_ten
    && document.getElementById('docDoiTacInput').value === existing.doi_tac_ten;
  if ((!partnerId && !keepOldPartner) || !ngayGui) { showToast('Vui lòng chọn doanh nghiệp và ngày gửi (*).', 'error'); return; }
  const src = docPartnerSource(type);
  const p = partnerId ? src.list.find(x => x.id === partnerId) : null;
  const partner = p
    ? { doi_tac_id: p.id, doi_tac_ten: src.name(p), doi_tac_ma: src.code(p) }
    : { doi_tac_id: existing.doi_tac_id, doi_tac_ten: existing.doi_tac_ten, doi_tac_ma: existing.doi_tac_ma };
  const fields = { phan_loai: type, ...partner, mo_ta: document.getElementById('docMoTa').value.trim(), ngay_gui: ngayGui };

  try {
    if (existing) {
      const d = { ...existing, ...fields };
      if (existing.trang_thai === DOC_STATUS_RETURNED) d.ngay_nhan = document.getElementById('docNgayNhan').value || existing.ngay_nhan;
      await DB.updateDocument(d);
      await reloadDocuments();
      closeModal('documentModalOverlay');
      showToast('Đã cập nhật tài liệu.', 'success');
    } else {
      await DB.addDocument({ ...fields, ngay_nhan: null, trang_thai: DOC_STATUS_SENT });
      await reloadDocuments();
      closeModal('documentModalOverlay');
      showToast('Đã lưu tài liệu gửi đi.', 'success');
    }
  } catch(e) {
    console.error(e);
    showToast(isMissingTableError(e) ? DOCUMENTS_SQL_HINT : 'Lỗi khi lưu tài liệu: ' + friendlyError(e), 'error');
  }
}

function viewDocument(id) {
  const d = state.documents.find(x => x.id === id);
  if (!d) return;
  state.editingDocId = id;
  const p = docPartner(d);
  const cls = DOC_STATUS_CLASS[d.trang_thai] || '';
  document.getElementById('documentViewContent').innerHTML = `
    <div class="view-grid">
      <div class="view-item"><span class="view-label">Phân Loại</span><span class="view-value">${escHtml(d.phan_loai)}</span></div>
      <div class="view-item"><span class="view-label">Trạng Thái</span><span class="view-value"><span class="status-badge ${cls}">${escHtml(d.trang_thai)}</span></span></div>
      <div class="view-item full"><span class="view-label">Doanh Nghiệp</span><span class="view-value">${escHtml(p.name)}${p.code ? ' (' + escHtml(p.code) + ')' : ''}</span></div>
      <div class="view-item"><span class="view-label">Ngày Gửi</span><span class="view-value">${formatDateVN(d.ngay_gui)}</span></div>
      <div class="view-item"><span class="view-label">Ngày Nhận Lại</span><span class="view-value">${formatDateVN(d.ngay_nhan)}</span></div>
      <div class="view-item full"><span class="view-label">Mô Tả</span><span class="view-value" style="white-space:pre-wrap;">${escHtml(d.mo_ta||'—')}</span></div>
    </div>`;
  openModal('documentViewModalOverlay');
}

function syncDocStatusDateVisibility() {
  const selected = document.querySelector('input[name="docStatusNew"]:checked');
  document.getElementById('docStatusDateGroup').style.display = (selected && selected.value === DOC_STATUS_RETURNED) ? '' : 'none';
}
function openDocStatusModal(id) {
  const d = state.documents.find(x => x.id === id);
  if (!d) return;
  state.editingDocId = id;
  const p = docPartner(d);
  document.getElementById('docStatusSummary').innerHTML = `Tài liệu gửi ${escHtml(d.phan_loai.toLowerCase())} <strong>${escHtml(p.name)}</strong> ngày <strong>${formatDateVN(d.ngay_gui)}</strong>`;
  document.querySelectorAll('input[name="docStatusNew"]').forEach(radio => { radio.checked = (radio.value === d.trang_thai); });
  document.getElementById('docStatusDate').value = d.ngay_nhan || todayISODate();
  syncDocStatusDateVisibility();
  openModal('documentStatusModalOverlay');
}

async function saveDocStatus() {
  if (!state.editingDocId || !requirePerm('reconciliations', 'edit')) return;
  const selected = document.querySelector('input[name="docStatusNew"]:checked');
  if (!selected) { showToast('Vui lòng chọn một trạng thái.', 'error'); return; }
  const existing = state.documents.find(x => x.id === state.editingDocId);
  if (!existing) return;
  const returned = selected.value === DOC_STATUS_RETURNED;
  const d = { ...existing, trang_thai: selected.value, ngay_nhan: returned ? (document.getElementById('docStatusDate').value || todayISODate()) : null };
  try {
    await DB.updateDocument(d);
    await reloadDocuments();
    closeModal('documentStatusModalOverlay');
    showToast('Đã cập nhật trạng thái tài liệu.', 'success');
  } catch(e) { console.error(e); showToast('Lỗi khi cập nhật trạng thái: ' + friendlyError(e), 'error'); }
}

async function reloadDocuments() { await reloadTables(['documents']); }

/* ============================================================
   LEAD MODULE (Tìm Kiếm Nhà Thầu — danh sách nhà thầu tiềm năng)
   Sửa trực tiếp trên bảng: dòng đang sửa/thêm hiện ô nhập + nút "Lưu"; lưu xong
   trở lại dạng chữ với nút Sửa / Xóa. Dùng quyền module 'contractors'.
   Bản nháp nằm ở state.leadDrafts nên tải lại dữ liệu (realtime) không làm mất chữ đang gõ.
   ============================================================ */
const LEAD_FIELDS = ['ten_doanh_nghiep', 'loai_hinh', 'dia_diem', 'tuyen', 'kenh', 'duong_dan', 'ghi_chu'];
const LEADS_SQL_HINT = 'Chưa tạo bảng Tìm Kiếm Nhà Thầu trên Supabase — Admin cần chạy file supabase_contractor_leads_setup.sql.';
const LEAD_INPUT_PLACEHOLDERS = {
  ten_doanh_nghiep: 'Tên doanh nghiệp *', dia_diem: 'Địa điểm', tuyen: 'Tuyến', kenh: 'Kênh', duong_dan: 'https://...', ghi_chu: 'Ghi chú'
};

function leadTypeNames() {
  return state.contractor_lead_types.map(t => t.ten).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
}
// Loại hình để lọc: danh sách đã cấu hình + các giá trị đang có trên bảng
function leadTypeOptions() {
  const names = new Set(leadTypeNames());
  state.contractor_leads.forEach(l => { if (l.loai_hinh) names.add(l.loai_hinh); });
  return [...names].sort((a, b) => a.localeCompare(b, 'vi')).map(n => ({ value: n, label: n }));
}
function leadPlaceOptions() {
  const names = new Set();
  state.contractor_leads.forEach(l => { if (l.dia_diem) names.add(l.dia_diem.trim()); });
  return [...names].sort((a, b) => a.localeCompare(b, 'vi')).map(n => ({ value: n, label: n }));
}
// Bộ lọc gõ-để-tìm: chọn gợi ý → khớp đúng; đang gõ dở → chứa chữ đã gõ
function comboFilterMatch(value, hiddenId, inputId) {
  const exact = document.getElementById(hiddenId).value;
  if (exact) return (value || '').trim() === exact;
  const text = normSearch(document.getElementById(inputId).value).trim();
  return !text || normSearch(value).includes(text);
}

function getFilteredLeads(q) {
  return state.contractor_leads
    .filter(l => state.leadDrafts.has(l.id) || (   // dòng đang sửa luôn hiện, không bị bộ lọc giấu đi
      comboFilterMatch(l.loai_hinh, 'leadTypeFilter', 'leadTypeFilterInput') &&
      comboFilterMatch(l.dia_diem, 'leadPlaceFilter', 'leadPlaceFilterInput') &&
      rowMatchesSearch(q, LEAD_FIELDS.map(f => l[f]))))
    // Cũ trước, mới sau — dòng vừa thêm nằm ngay trên nút "+ Thêm dòng"
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
}

// Đường dẫn chỉ thành link khi là http(s) hoặc tên miền — tránh chèn "javascript:" vào href
function leadLinkHtml(url) {
  const u = (url || '').trim();
  if (!u) return '—';
  const href = /^https?:\/\//i.test(u) ? u : (/^[^\s/]+\.[^\s]{2,}/.test(u) ? 'https://' + u : '');
  return href ? `<a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer" title="${escHtml(u)}">${escHtml(u)}</a>` : escHtml(u);
}

function leadViewRowHtml(l, canEdit, canDel) {
  return `
    <tr data-lead-row="${escHtml(l.id)}">
      <td class="col-name">${escHtml(l.ten_doanh_nghiep || '—')}</td>
      <td class="cell-nowrap">${escHtml(l.loai_hinh || '—')}</td>
      <td>${escHtml(l.dia_diem || '—')}</td>
      <td>${escHtml(l.tuyen || '—')}</td>
      <td>${escHtml(l.kenh || '—')}</td>
      <td class="col-link">${leadLinkHtml(l.duong_dan)}</td>
      <td class="col-note">${escHtml(l.ghi_chu || '—')}</td>
      <td class="row-actions"><div class="actions-inner">
        ${canEdit ? `<button class="btn-icon-sm" data-edit-lead="${escHtml(l.id)}" title="Sửa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>` : ''}
        ${canDel ? `<button class="btn-icon-sm danger" data-del-lead="${escHtml(l.id)}" title="Xóa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
        </button>` : ''}
        ${!canEdit && !canDel ? '<span class="cell-muted">—</span>' : ''}
      </div></td>
    </tr>`;
}

function leadEditRowHtml(key, draft) {
  const f = draft.fields;
  const input = field => `<input type="text" class="cell-input" data-lead-key="${escHtml(key)}" data-field="${field}" value="${escHtml(f[field] || '')}" placeholder="${LEAD_INPUT_PLACEHOLDERS[field]}">`;
  const types = leadTypeNames();
  if (f.loai_hinh && !types.includes(f.loai_hinh)) types.unshift(f.loai_hinh); // loại hình cũ đã bị xóa khỏi danh sách
  const typeSelect = `<select class="cell-input" data-lead-key="${escHtml(key)}" data-field="loai_hinh">
      <option value="">— Chọn —</option>
      ${types.map(t => `<option value="${escHtml(t)}"${t === f.loai_hinh ? ' selected' : ''}>${escHtml(t)}</option>`).join('')}
    </select>`;
  return `
    <tr class="is-editing" data-lead-row="${escHtml(key)}">
      <td class="col-name">${input('ten_doanh_nghiep')}</td>
      <td>${typeSelect}</td>
      <td>${input('dia_diem')}</td>
      <td>${input('tuyen')}</td>
      <td>${input('kenh')}</td>
      <td>${input('duong_dan')}</td>
      <td class="col-note">${input('ghi_chu')}</td>
      <td class="row-actions"><div class="actions-inner">
        <button class="btn btn-success btn-save-row" data-save-lead="${escHtml(key)}"${draft.saving ? ' disabled' : ''}>${draft.saving ? 'Đang lưu…' : 'Lưu'}</button>
        <button class="btn-icon-sm" data-cancel-lead="${escHtml(key)}" title="${draft.isNew ? 'Bỏ dòng này' : 'Hủy sửa'}">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div></td>
    </tr>`;
}

function renderLeadTable(q) {
  const tbody = document.getElementById('leadTableBody');
  const empty = document.getElementById('leadEmptyState');
  // Bỏ bản nháp của dòng đã bị xóa ở máy khác
  state.leadDrafts.forEach((d, key) => { if (!d.isNew && !state.contractor_leads.some(l => l.id === key)) state.leadDrafts.delete(key); });

  // Giữ con trỏ đang gõ khi bảng được vẽ lại (VD: realtime tải lại dữ liệu)
  const active = document.activeElement;
  const focus = active && active.dataset && active.dataset.leadKey
    ? { key: active.dataset.leadKey, field: active.dataset.field, start: active.selectionStart, end: active.selectionEnd } : null;

  const missing = state.missingTables.has('contractor_leads');
  const canEdit = can('contractors', 'edit'), canDel = can('contractors', 'delete');
  const list = getFilteredLeads(q);
  const newDrafts = [...state.leadDrafts.entries()].filter(([, d]) => d.isNew);
  tbody.innerHTML = list.map(l => state.leadDrafts.has(l.id) ? leadEditRowHtml(l.id, state.leadDrafts.get(l.id)) : leadViewRowHtml(l, canEdit, canDel)).join('')
    + newDrafts.map(([key, d]) => leadEditRowHtml(key, d)).join('');

  const hasRows = list.length || newDrafts.length;
  empty.querySelector('p').textContent = missing ? LEADS_SQL_HINT
    : (state.contractor_leads.length ? 'Không có nhà thầu nào khớp bộ lọc.' : 'Chưa có nhà thầu nào trong danh sách tìm kiếm. Bấm "+ Thêm dòng" để bắt đầu.');
  empty.style.display = hasRows ? 'none' : 'flex';
  document.getElementById('btnAddLeadRow').disabled = missing;

  if (focus) {
    const el = tbody.querySelector(`[data-lead-key="${CSS.escape(focus.key)}"][data-field="${focus.field}"]`);
    if (el) { el.focus(); if (el.setSelectionRange && focus.start != null) el.setSelectionRange(focus.start, focus.end); }
  }
}
function rerenderLeads() { renderLeadTable(document.getElementById('leadSearchInput').value); }

function addLeadRow() {
  if (!requirePerm('contractors', 'create')) return;
  if (state.missingTables.has('contractor_leads')) { showToast(LEADS_SQL_HINT, 'error'); return; }
  const key = 'new_' + uid();
  const fields = {};
  LEAD_FIELDS.forEach(f => { fields[f] = ''; });
  // Đang lọc 1 loại hình → dòng mới điền sẵn loại hình đó
  fields.loai_hinh = document.getElementById('leadTypeFilter').value;
  state.leadDrafts.set(key, { isNew: true, fields });
  rerenderLeads();
  const el = document.querySelector(`#leadTableBody [data-lead-key="${key}"][data-field="ten_doanh_nghiep"]`);
  if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); }
}

function editLeadRow(id) {
  if (!requirePerm('contractors', 'edit')) return;
  const l = state.contractor_leads.find(x => x.id === id);
  if (!l) return;
  const fields = {};
  LEAD_FIELDS.forEach(f => { fields[f] = l[f] || ''; });
  state.leadDrafts.set(id, { isNew: false, fields });
  rerenderLeads();
  const el = document.querySelector(`#leadTableBody [data-lead-key="${CSS.escape(id)}"][data-field="ten_doanh_nghiep"]`);
  if (el) el.focus();
}

function cancelLeadRow(key) {
  state.leadDrafts.delete(key);
  rerenderLeads();
}

async function saveLeadRow(key) {
  const draft = state.leadDrafts.get(key);
  if (!draft || draft.saving) return;
  if (!requirePerm('contractors', draft.isNew ? 'create' : 'edit')) return;
  const fields = {};
  LEAD_FIELDS.forEach(f => { fields[f] = String(draft.fields[f] || '').trim(); });
  if (!fields.ten_doanh_nghiep) {
    showToast('Vui lòng nhập Tên doanh nghiệp.', 'error');
    const el = document.querySelector(`#leadTableBody [data-lead-key="${CSS.escape(key)}"][data-field="ten_doanh_nghiep"]`);
    if (el) { el.classList.add('invalid'); el.focus(); }
    return;
  }
  draft.saving = true; rerenderLeads();
  try {
    if (draft.isNew) {
      const row = await DB.insert('contractor_leads', fields);
      if (!state.contractor_leads.some(l => l.id === row.id)) state.contractor_leads.push(row);
    } else {
      const existing = state.contractor_leads.find(l => l.id === key);
      const row = await DB.update('contractor_leads', { ...existing, ...fields });
      Object.assign(existing, row);
    }
    state.leadDrafts.delete(key);
    rerenderLeads();
    showToast('Đã lưu ' + fields.ten_doanh_nghiep + '.', 'success');
    reloadTables(['contractor_leads']);
  } catch(e) {
    console.error(e);
    draft.saving = false; rerenderLeads();
    showToast(isMissingTableError(e) ? LEADS_SQL_HINT : 'Lỗi khi lưu: ' + friendlyError(e), 'error');
  }
}

function deleteLeadRow(id) {
  if (!requirePerm('contractors', 'delete')) return;
  const l = state.contractor_leads.find(x => x.id === id);
  askConfirm('Xóa "' + (l ? l.ten_doanh_nghiep : '') + '" khỏi danh sách tìm kiếm?', async () => {
    await DB.remove('contractor_leads', id);
    await reloadTables(['contractor_leads']);
    showToast('Đã xóa.', 'success');
  });
}

// Bảng dùng 1 listener ủy quyền cho cả ô nhập lẫn nút (bảng được vẽ lại liên tục)
function bindLeadTableEvents() {
  const tbody = document.getElementById('leadTableBody');
  const onEdit = e => {
    const el = e.target.closest('[data-lead-key]');
    if (!el) return;
    const draft = state.leadDrafts.get(el.dataset.leadKey);
    if (draft) draft.fields[el.dataset.field] = el.value;
    el.classList.remove('invalid');
  };
  tbody.addEventListener('input', onEdit);
  tbody.addEventListener('change', onEdit);
  tbody.addEventListener('keydown', e => {
    const el = e.target.closest('[data-lead-key]');
    if (el && e.key === 'Enter') { e.preventDefault(); saveLeadRow(el.dataset.leadKey); }
  });
  tbody.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.saveLead) saveLeadRow(b.dataset.saveLead);
    else if (b.dataset.cancelLead) cancelLeadRow(b.dataset.cancelLead);
    else if (b.dataset.editLead) editLeadRow(b.dataset.editLead);
    else if (b.dataset.delLead) deleteLeadRow(b.dataset.delLead);
  });
  document.getElementById('btnAddLeadRow').addEventListener('click', addLeadRow);
}

function initLeadFilters() {
  initFilterCombo({
    wrapId: 'leadTypeFilterWrap', inputId: 'leadTypeFilterInput', hiddenId: 'leadTypeFilter',
    dropdownId: 'leadTypeFilterDropdown', clearId: 'leadTypeFilterClear', emptyText: 'Không tìm thấy loại hình',
    options: leadTypeOptions, onChange: rerenderLeads
  });
  initFilterCombo({
    wrapId: 'leadPlaceFilterWrap', inputId: 'leadPlaceFilterInput', hiddenId: 'leadPlaceFilter',
    dropdownId: 'leadPlaceFilterDropdown', clearId: 'leadPlaceFilterClear', emptyText: 'Không tìm thấy địa điểm',
    options: leadPlaceOptions, onChange: rerenderLeads
  });
}

/* ---- Cấu hình danh sách Loại hình ---- */
function renderLeadTypeList() {
  const ul = document.getElementById('leadTypeList');
  if (state.missingTables.has('contractor_lead_types')) { ul.innerHTML = `<li class="type-list-empty">${escHtml(LEADS_SQL_HINT)}</li>`; return; }
  const types = state.contractor_lead_types.slice().sort((a, b) => (a.ten || '').localeCompare(b.ten || '', 'vi'));
  ul.innerHTML = types.length ? types.map(t => {
    const used = state.contractor_leads.filter(l => l.loai_hinh === t.ten).length;
    return `<li><span>${escHtml(t.ten)}${used ? `<small>${used} dòng</small>` : ''}</span>
      <button type="button" class="btn-icon-sm danger" data-del-type="${escHtml(t.id)}" title="Xóa loại hình">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
      </button></li>`;
  }).join('') : '<li class="type-list-empty">Chưa có loại hình nào.</li>';
}
function openLeadTypesModal() {
  if (!requirePerm('contractors', 'edit')) return;
  document.getElementById('leadTypeNewName').value = '';
  renderLeadTypeList();
  openModal('leadTypesModalOverlay');
  setTimeout(() => document.getElementById('leadTypeNewName').focus(), 50);
}
async function addLeadType() {
  if (!requirePerm('contractors', 'edit')) return;
  if (state.missingTables.has('contractor_lead_types')) { showToast(LEADS_SQL_HINT, 'error'); return; }
  const input = document.getElementById('leadTypeNewName');
  const ten = input.value.trim();
  if (!ten) { input.focus(); return; }
  if (state.contractor_lead_types.some(t => normSearch(t.ten) === normSearch(ten))) { showToast('Loại hình "' + ten + '" đã có.', 'error'); return; }
  try {
    await DB.insert('contractor_lead_types', { ten });
    await reloadTables(['contractor_lead_types']);
    input.value = ''; input.focus();
    renderLeadTypeList();
  } catch(e) { console.error(e); showToast('Lỗi khi thêm loại hình: ' + friendlyError(e), 'error'); }
}
async function deleteLeadType(id) {
  if (!requirePerm('contractors', 'edit')) return;
  try {
    await DB.remove('contractor_lead_types', id);
    await reloadTables(['contractor_lead_types']);
    renderLeadTypeList();
  } catch(e) { console.error(e); showToast('Lỗi khi xóa loại hình: ' + friendlyError(e), 'error'); }
}

/* ---- MẪU EXCEL DÙNG CHUNG (12/11/2026) ----
   Mẫu Bảng kê KH / Lãi lỗ / Đề nghị thanh toán lưu ở bảng app_templates trên kho chung
   (file nang_cap_2026-11-12_mau_excel_va_lich_su.sql): chọn mẫu 1 lần ở bất kỳ máy nào là
   mọi máy dùng được. Trình duyệt vẫn giữ 1 bản sao để mở nhanh / dùng khi mất mạng. Kho
   chưa có bảng này → tự dùng cách cũ (chỉ lưu trên máy này). */
const TemplateStore = {
  _cache: {},
  async get(key) {
    if (state.useSupabase && state.supabaseClient) {
      try {
        const { data, error } = await state.supabaseClient.from('app_templates').select('data_b64').eq('key', key).maybeSingle();
        if (!error) {
          if (data && data.data_b64) { try { localStorage.setItem(key, data.data_b64); } catch(e) {} return data.data_b64; }
          // Kho chưa có mẫu nhưng máy này còn bản cũ → đưa lên kho để máy khác dùng chung
          let local = null; try { local = localStorage.getItem(key); } catch(e) {}
          if (local) { this.set(key, local, true); return local; }
          return null;
        }
        if (!isMissingTableError(error)) console.warn('Đọc mẫu Excel trên kho lỗi:', error);
      } catch (e) { console.warn('Đọc mẫu Excel trên kho lỗi:', e); }
    }
    try { return localStorage.getItem(key); } catch(e) { return null; }
  },
  async set(key, b64, quiet) {
    try { localStorage.setItem(key, b64); } catch(e) { console.error(e); }
    if (!(state.useSupabase && state.supabaseClient)) return;
    try {
      const by = (state.auth && state.auth.profile && (state.auth.profile.email || state.auth.profile.full_name)) || null;
      const { error } = await state.supabaseClient.from('app_templates')
        .upsert({ key, data_b64: b64, updated_at: new Date().toISOString(), updated_by: by }, { onConflict: 'key' });
      if (error) throw error;
      if (!quiet) showToast('Đã lưu file mẫu lên hệ thống — mọi máy dùng chung mẫu này.', 'success');
    } catch (e) {
      console.warn('Lưu mẫu Excel lên kho lỗi:', e);
      if (!quiet) showToast(isMissingTableError(e) ? 'File mẫu mới lưu trên máy này (kho chưa nâng cấp để lưu chung).' : 'Chưa lưu được file mẫu lên hệ thống (' + friendlyError(e) + ') — tạm lưu trên máy này.', 'error');
    }
  },
  async remove(key) {
    try { localStorage.removeItem(key); } catch(e) {}
    if (state.useSupabase && state.supabaseClient) {
      try { await state.supabaseClient.from('app_templates').delete().eq('key', key); } catch(e) {}
    }
  }
};

const PAYMENT_TEMPLATE_KEY = 'vittrans_payment_template_b64';
const PAYMENT_TEMPLATE_DATA_START_ROW = 27;
// File mẫu hiện tại (đối chiếu trực tiếp từ file .xlsx đã xuất) chỉ có ĐÚNG
// 1 dòng chi tiết (dòng 27) — ngay dòng 28 đã là "Tổng cộng/Total amount".
// Hằng số này từng để 204 (theo một bản mẫu cũ có nhiều dòng trống hơn),
// khiến code ghi đè/ẩn nhầm lên đúng các dòng Tổng cộng/chữ ký thật ở dưới.
const PAYMENT_TEMPLATE_DATA_END_ROW = 27;

function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function numberToVietnameseWords(num) {
  const n = Math.round(Math.abs(Number(num) || 0));
  if (n === 0) return 'Không đồng';
  const digitWords = ['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
  const groupUnits = ['', 'ngàn', 'triệu', 'tỷ'];

  function readGroup(g, isFirstNonZeroGroup) {
    const hundred = Math.floor(g / 100);
    const rem = g % 100;
    const ten = Math.floor(rem / 10);
    const unit = rem % 10;
    const parts = [];
    if (hundred > 0) parts.push(digitWords[hundred] + ' trăm');
    else if (!isFirstNonZeroGroup) parts.push('không trăm');
    if (ten === 0) {
      if (unit > 0) {
        if (hundred > 0 || !isFirstNonZeroGroup) parts.push('lẻ ' + digitWords[unit]);
        else parts.push(digitWords[unit]);
      }
    } else if (ten === 1) {
      parts.push('mười');
      if (unit === 1) parts.push('một');
      else if (unit === 5) parts.push('lăm');
      else if (unit > 0) parts.push(digitWords[unit]);
    } else {
      parts.push(digitWords[ten] + ' mươi');
      if (unit === 1) parts.push('mốt');
      else if (unit === 5) parts.push('lăm');
      else if (unit > 0) parts.push(digitWords[unit]);
    }
    return parts.join(' ');
  }

  const groups = [];
  let rest = n;
  while (rest > 0) { groups.push(rest % 1000); rest = Math.floor(rest / 1000); }
  if (!groups.length) groups.push(0);

  const words = [];
  let firstDone = false;
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const groupWords = readGroup(g, !firstDone);
    firstDone = true;
    words.push(groupWords + (groupUnits[i] ? ' ' + groupUnits[i] : ''));
  }
  const sentence = words.join(' ').replace(/\s+/g, ' ').trim();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ' đồng';
}

function pickExcelFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files[0];
      document.body.removeChild(input);
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    });
    input.click();
  });
}

async function chooseAndStorePaymentTemplate() {
  const buffer = await pickExcelFile();
  if (!buffer) return null;
  if (!(await loadExcelJS())) return null;
  try {
    const test = new ExcelJS.Workbook();
    await test.xlsx.load(buffer);
    if (!test.getWorksheet('Form')) {
      showToast('File này không có sheet "Form". Vui lòng chọn đúng file "Đề nghị thanh toán VITTRANS".', 'error');
      return null;
    }
  } catch(e) {
    console.error(e);
    showToast('Không đọc được file Excel này. Vui lòng chọn lại.', 'error');
    return null;
  }
  const b64 = arrayBufferToBase64(buffer);
  await TemplateStore.set(PAYMENT_TEMPLATE_KEY, b64);
  return buffer;
}

async function exportReconciliationsToPaymentRequest() {
  const list = getFilteredReconciliations(document.getElementById('reconciliationSearchInput').value);
  if (!list.length) { showToast('Không có bảng kê nào để xuất. Hãy tìm/lọc trước khi xuất.', 'error'); return; }
  const distinctContractors = [...new Set(list.map(r => r.nha_thau_id || r.nha_thau_ten))];
  if (distinctContractors.length > 1) {
    showToast('Danh sách đang lọc có nhiều hơn 1 nhà thầu. Vui lòng gõ tên nhà thầu vào ô tìm kiếm để lọc còn 1 nhà thầu rồi xuất lại.', 'error');
    return;
  }
  const maxRows = PAYMENT_TEMPLATE_DATA_END_ROW - PAYMENT_TEMPLATE_DATA_START_ROW + 1;
  if (list.length > maxRows) {
    showToast(`File mẫu chỉ hỗ trợ tối đa ${maxRows} dòng bảng kê/lần xuất, danh sách đang lọc có ${list.length} dòng. Vui lòng lọc bớt (theo trạng thái/khoảng thời gian) rồi xuất lại.`, 'error');
    return;
  }
  const first = list[0];
  const nt = state.contractors.find(c => c.id === first.nha_thau_id);
  const tenNhaThau = nt ? nt.ten_nha_thau : (first.nha_thau_ten || '');
  const tenNganHang = nt ? (nt.ten_ngan_hang || '') : '';
  const stk = nt ? (nt.stk || '') : '';

  let stored = null;
  stored = await TemplateStore.get(PAYMENT_TEMPLATE_KEY);
  let buffer;
  if (stored) {
    buffer = base64ToArrayBuffer(stored);
  } else {
    showToast('Vui lòng chọn file Excel mẫu "Đề Nghị Thanh Toán" (có sheet "Form") — chỉ cần chọn 1 lần.', 'success');
    buffer = await chooseAndStorePaymentTemplate();
    if (!buffer) return;
  }

  if (!(await loadExcelJS())) return;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch(e) {
    console.error(e);
    showToast('File mẫu đã lưu bị lỗi. Vui lòng bấm "Đổi File Mẫu" để chọn lại.', 'error');
    return;
  }
  const ws = wb.getWorksheet('Form');
  if (!ws) {
    showToast('File mẫu không có sheet "Form". Vui lòng bấm "Đổi File Mẫu" để chọn lại.', 'error');
    await TemplateStore.remove(PAYMENT_TEMPLATE_KEY);
    return;
  }

  // Gỡ toàn bộ công thức trên sheet Form thành giá trị tĩnh — công thức cũ
  // tham chiếu sang sheet 'Chi tiết' (sẽ bị xóa bên dưới) nên sẽ báo lỗi
  // #REF! nếu giữ nguyên.
  ws.eachRow({ includeEmpty: true }, row => {
    row.eachCell({ includeEmpty: true }, cell => {
      if (cell.formula) cell.value = (cell.result !== undefined && cell.result !== null) ? cell.result : null;
    });
  });
  ws.autoFilter = null;

  ws.getCell('A12').value = 'PAYMENT REQUEST (ĐỀ NGHỊ THANH TOÁN)';
  const dateCell = ws.getCell('C14');
  dateCell.value = new Date();
  if (!dateCell.numFmt) dateCell.numFmt = 'dd/mm/yyyy';
  ws.getCell('C15').value = 'Hoàng Trung Kiên';
  ws.getCell('H20').value = tenNganHang;
  ws.getCell('H21').value = stk;
  ws.getCell('H22').value = tenNhaThau;

  // Xóa sạch vùng bảng chi tiết A27:J204 (kể cả cột phụ K:O còn sót lại từ
  // cơ chế lookup cũ) trước khi điền dữ liệu mới — KHÔNG đụng đến phần
  // Tổng cộng/Phải trả từ dòng 205 trở xuống.
  for (let r = PAYMENT_TEMPLATE_DATA_START_ROW; r <= PAYMENT_TEMPLATE_DATA_END_ROW; r++) {
    ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'].forEach(col => { ws.getCell(`${col}${r}`).value = null; });
  }

  list.forEach((r, idx) => {
    const row = PAYMENT_TEMPLATE_DATA_START_ROW + idx;
    ws.getRow(row).hidden = false; // các dòng không có dữ liệu giữ nguyên trạng thái ẩn sẵn có của file mẫu
    ws.getCell(`A${row}`).value = idx + 1;
    ws.getCell(`B${row}`).value = r.ghi_chu || '';
    ws.getCell(`C${row}`).value = 1;
    const priceCell = ws.getCell(`E${row}`);
    priceCell.value = Number(r.gia_tri) || 0;
    if (!priceCell.numFmt) priceCell.numFmt = '#,##0';
    const amountCell = ws.getCell(`H${row}`);
    // Kèm result đã tính sẵn — ExcelJS không tự chạy công thức, nếu chỉ đặt
    // formula mà không có result thì khi đọc lại giá trị (bản xem trước/PDF)
    // sẽ ra "undefined" cho đến khi người dùng mở file bằng Excel để tính lại.
    amountCell.value = { formula: `C${row}*E${row}`, result: Number(r.gia_tri) || 0 };
    if (!amountCell.numFmt) amountCell.numFmt = '#,##0';
    ws.getCell(`I${row}`).value = r.so_hoa_don || '';
    ws.getCell(`J${row}`).value = '';
  });

  // Ẩn (không xóa vật lý) các dòng trống còn lại trong vùng dữ liệu.
  // Lưu ý: đã thử xóa hẳn bằng ws.spliceRows() nhưng ExcelJS không dịch
  // theo các vùng merge cell nằm dưới (phần "Tổng cộng"/chữ ký), khiến
  // merge bị vỡ và nội dung hiển thị lặp lại nhiều lần. Ẩn dòng vẫn đạt
  // mục tiêu "không còn khoảng trắng" vì Excel/PDF/bản in đều mặc định bỏ
  // qua dòng ẩn khi in, mà không đụng tới các dòng/merge phía dưới.
  const lastDataRow = PAYMENT_TEMPLATE_DATA_START_ROW + list.length - 1;
  for (let r = lastDataRow + 1; r <= PAYMENT_TEMPLATE_DATA_END_ROW; r++) ws.getRow(r).hidden = true;

  // Tổng cộng (dòng 28 trong file mẫu thật — đã đối chiếu trực tiếp file
  // .xlsx đã xuất, KHÔNG phải 205 như hằng số cũ giả định) = tổng cột
  // Thành tiền của các dòng vừa điền. Số tiền tạm ứng/đặt cọc (29) và Phải
  // trả lại Công ty (30) không có nguồn dữ liệu tương ứng trong app nên đặt
  // về 0; Phải thanh toán cho NCC (31) = Tổng cộng.
  const total = list.reduce((s, r) => s + (Number(r.gia_tri) || 0), 0);
  // Tự ghi lại cả nhãn (không chỉ số tiền) — file mẫu đang lưu trong máy có
  // thể đã bị các lần xuất lỗi trước đó (hằng số dòng sai) xóa mất nhãn gốc,
  // nên ghi đè lại tường minh mỗi lần xuất để tự phục hồi, không phụ thuộc
  // vào việc file mẫu còn giữ đúng nhãn hay không.
  ws.getCell('A28').value = 'Tổng cộng/Total amount';
  ws.getCell('H28').value = { formula: `SUM(H${PAYMENT_TEMPLATE_DATA_START_ROW}:H${lastDataRow})`, result: total };
  ws.getCell('A29').value = 'Số tiền đã tạm ứng, đặt cọc/ Advance/Deposit amount';
  ws.getCell('H29').value = 0;
  ws.getCell('A30').value = 'Phải trả lại Công ty/Payable to Company';
  ws.getCell('H30').value = 0;
  ws.getCell('A31').value = 'Phải thanh toán cho NCC, nhân viên/Payable to Supplier, staff';
  ws.getCell('H31').value = { formula: 'H28', result: total };

  const setTextCell = (ref, text) => {
    const cell = ws.getCell(ref);
    cell.value = text;
    cell.font = { name: 'Times New Roman', size: 12 };
  };
  // Dòng 34 (dòng 33 chỉ là dòng đệm cao 9.75pt, dòng "Thành tiền:" thật
  // trong file mẫu nằm ở 34): đọc Thành tiền (H31) bằng chữ, thay cho công
  // thức cũ tham chiếu sang sheet 'Sheet1' (đã bị xóa).
  setTextCell('A34', 'Thành tiền:');
  setTextCell('B34', numberToVietnameseWords(total));

  // Khối chữ ký (dòng 36/37/45 trong file mẫu thật) — nội dung đã có sẵn
  // trong file mẫu, ở đây set lại tường minh + ép cỡ chữ 12/Times New Roman
  // theo yêu cầu.
  setTextCell('A36', 'Requester ');
  setTextCell('C36', 'Budget owner');
  setTextCell('E36', 'Accountant');
  setTextCell('I36', 'Aprroved by');
  setTextCell('A37', '(Người đề nghị)');
  setTextCell('C37', '(Trưởng bộ phận)');
  setTextCell('E37', '(Kế toán)');
  setTextCell('I37', '(Phê duyệt)');
  setTextCell('A45', 'Hoàng Trung Kiên');
  setTextCell('E45', 'Hoàng Thị Hải Yến');
  setTextCell('I45', 'Ngô Văn Hưng');

  // Chỉ giữ lại sheet Form khi xuất ra — các sheet khác của file mẫu chứa
  // dữ liệu tài chính thật của các nhà thầu khác, không được xuất kèm.
  [...wb.worksheets].forEach(sheet => { if (sheet.name !== 'Form') wb.removeWorksheet(sheet.id); });

  const outBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const maBangKeStr = list.map(r => r.ma_bang_ke).filter(Boolean).join('+');
  const filenameBase = `De nghi thanh toan - ${maBangKeStr} - ${tenNhaThau || 'Nha thau'} - ${todayISODate()}`;
  triggerBlobDownload(blob, filenameBase + '.xlsx');
  showToast('Đã xuất file Đề Nghị Thanh Toán.', 'success');
}

/* ============================================================
   ORDER MODULE
   ============================================================ */
function bindCurrencyInput(el, cb) {
  el.addEventListener('input', () => {
    const raw = parseCurrencyInput(el.value);
    const caret = el.value.length - el.selectionStart;
    el.value = formatNumberInput(raw);
    const pos = Math.max(0, el.value.length - caret);
    el.setSelectionRange(pos, pos);
    cb();
  });
}

function recalcOrderFinancials() {
  const cuocMua = parseCurrencyInput(document.getElementById('orderCuocMua').value);
  const psMua = parseCurrencyInput(document.getElementById('orderPhatSinhMua').value);
  const cuocBan = parseCurrencyInput(document.getElementById('orderCuocBan').value);
  const psBan = parseCurrencyInput(document.getElementById('orderPhatSinhBan').value);
  const tongMua = cuocMua + psMua;
  const tongBan = cuocBan + psBan;
  const loi = tongBan - tongMua;
  document.getElementById('orderTongMua').textContent = formatCurrency(tongMua);
  document.getElementById('orderTongBan').textContent = formatCurrency(tongBan);
  document.getElementById('orderLoiNhuan').textContent = formatCurrency(loi);
  const banner = document.getElementById('orderProfitBanner');
  loi < 0 ? banner.classList.add('negative') : banner.classList.remove('negative');
  return { cuocMua, psMua, tongMua, cuocBan, psBan, tongBan, loi };
}

// readOnly: phòng ban chỉ có quyền Xem → mở form để xem đủ thông tin, khóa mọi ô, ẩn nút Lưu
function openOrderForm(id, readOnly) {
  if (!id && !requirePerm('orders', 'create')) return;
  readOnly = !!id && (readOnly || !can('orders', 'edit'));
  document.getElementById('orderForm').reset();
  document.querySelectorAll('#orderForm input, #orderForm select, #orderForm textarea').forEach(el => { el.disabled = readOnly; });
  document.getElementById('btnSaveOrder').style.display = readOnly ? 'none' : '';
  state.editingOrderId = id || null;
  if (id) {
    const o = state.orders.find(x => x.id === id);
    if (!o) return;
    document.getElementById('orderModalTitle').textContent = (readOnly ? 'Xem Đơn Xe — ' : 'Sửa Đơn Xe — ') + o.bill_vit;
    document.getElementById('orderId').value = o.id;
    document.getElementById('orderKhachHang').value = o.khach_hang_id || '';
    { const kh = state.customers.find(x => x.id === o.khach_hang_id); document.getElementById('orderKhachHangInput').value = kh ? customerLabel(kh) : (o.khach_hang_name || ''); }
    document.getElementById('orderNhanVien').value = o.nhan_vien || '';
    document.getElementById('orderNhaThau').value = o.nha_thau_id || '';
    document.getElementById('orderNhaThauInput').value = o.nha_thau_id ? (o.nha_thau_ten + (o.nha_thau_ma ? ' (' + o.nha_thau_ma + ')' : '')) : '';
    document.getElementById('orderBKS').value = o.bks || '';
    document.getElementById('orderTaiTrongXe').value = o.tai_trong_xe || '';
    document.getElementById('orderBillVit').value = o.bill_vit || '';
    document.getElementById('orderBillKhachHang').value = o.bill_khach_hang || '';
    document.getElementById('orderBillDoiTac').value = o.bill_doi_tac || '';
    document.getElementById('orderKhoLayHang').value = o.kho_lay_hang || '';
    document.getElementById('orderNgayGiaoHang').value = o.ngay_giao_hang || '';
    document.getElementById('orderTinhGui').value = o.tinh_gui || '';
    document.getElementById('orderPhuongGui').value = o.phuong_gui || '';
    document.getElementById('orderNguoiGui').value = o.nguoi_gui || '';
    document.getElementById('orderDTGui').value = o.dt_gui || '';
    document.getElementById('orderSDTNhan').value = o.sdt_nhan || '';
    document.getElementById('orderTenNhan').value = o.ten_nhan || '';
    document.getElementById('orderDiaChiNhan').value = o.dia_chi_nhan || '';
    document.getElementById('orderTinhNhan').value = o.tinh_nhan || '';
    document.getElementById('orderPhuongNhan').value = o.phuong_nhan || '';
    document.getElementById('orderSanPham').value = o.san_pham || '';
    document.getElementById('orderKhoiLuong').value = o.khoi_luong || '';
    document.getElementById('orderSoKien').value = o.so_kien || '';
    document.getElementById('orderCuocMua').value = formatNumberInput(o.cuoc_mua);
    document.getElementById('orderPhatSinhMua').value = formatNumberInput(o.phat_sinh_mua);
    document.getElementById('orderCuocBan').value = formatNumberInput(o.cuoc_ban);
    document.getElementById('orderPhatSinhBan').value = formatNumberInput(o.phat_sinh_ban);
    document.getElementById('orderGhiChu').value = o.ghi_chu || '';
  } else {
    document.getElementById('orderModalTitle').textContent = 'Tạo Đơn Xe';
    document.getElementById('orderId').value = '';
    document.getElementById('orderBillVit').value = generateNextBillVit();
  }
  recalcOrderFinancials();
  openModal('orderModalOverlay');
}

async function saveOrder() {
  if (!requirePerm('orders', state.editingOrderId ? 'edit' : 'create')) return;
  const khId = document.getElementById('orderKhachHang').value;
  const khoLayHang = document.getElementById('orderKhoLayHang').value.trim();
  const ngayGiaoHang = document.getElementById('orderNgayGiaoHang').value;
  const tGui = document.getElementById('orderTinhGui').value;
  const pGui = document.getElementById('orderPhuongGui').value;
  const tNhan = document.getElementById('orderTinhNhan').value;
  const pNhan = document.getElementById('orderPhuongNhan').value;
  const diaChiNhan = document.getElementById('orderDiaChiNhan').value.trim();
  const sp = document.getElementById('orderSanPham').value.trim();
  if (!khId || !khoLayHang || !ngayGiaoHang || !tGui || !pGui || !tNhan || !pNhan || !diaChiNhan) {
    showToast('Vui lòng điền đầy đủ các trường bắt buộc (*).', 'error'); return;
  }
  const kh = state.customers.find(c => c.id === khId);
  const ntId = document.getElementById('orderNhaThau').value;
  const nt = state.contractors.find(c => c.id === ntId);
  const fin = recalcOrderFinancials();
  const o = {
    id: state.editingOrderId || undefined,
    bill_vit: document.getElementById('orderBillVit').value,
    khach_hang_id: khId, khach_hang_name: kh ? kh.ten_kh : '',
    nhan_vien: document.getElementById('orderNhanVien').value.trim(),
    nha_thau_id: ntId || null, nha_thau_ten: nt ? nt.ten_nha_thau : '', nha_thau_ma: nt ? nt.ma_nha_thau : '',
    bks: document.getElementById('orderBKS').value.trim(),
    tai_trong_xe: Number(document.getElementById('orderTaiTrongXe').value)||0,
    bill_khach_hang: document.getElementById('orderBillKhachHang').value.trim(),
    bill_doi_tac: document.getElementById('orderBillDoiTac').value.trim(),
    kho_lay_hang: khoLayHang,
    ngay_giao_hang: ngayGiaoHang || null,
    tinh_gui: tGui, phuong_gui: pGui,
    nguoi_gui: document.getElementById('orderNguoiGui').value.trim(),
    dt_gui: document.getElementById('orderDTGui').value.trim(),
    sdt_nhan: document.getElementById('orderSDTNhan').value.trim(),
    ten_nhan: document.getElementById('orderTenNhan').value.trim(),
    dia_chi_nhan: diaChiNhan,
    tinh_nhan: tNhan, phuong_nhan: pNhan,
    san_pham: sp, khoi_luong: Number(document.getElementById('orderKhoiLuong').value)||0, so_kien: Number(document.getElementById('orderSoKien').value)||0,
    cuoc_mua: fin.cuocMua, phat_sinh_mua: fin.psMua, tong_mua: fin.tongMua,
    cuoc_ban: fin.cuocBan, phat_sinh_ban: fin.psBan, tong_ban: fin.tongBan,
    loi_nhuan: fin.loi,
    ghi_chu: document.getElementById('orderGhiChu').value.trim()
  };
  try {
    if (state.editingOrderId) {
      const ex = state.orders.find(x => x.id === state.editingOrderId);
      o.id = state.editingOrderId; o.created_at = ex ? ex.created_at : new Date().toISOString();
      await DB.updateOrder(o); showToast('Đã cập nhật đơn hàng.', 'success');
    } else { await DB.addOrder(o); showToast('Tạo đơn thành công: ' + o.bill_vit, 'success'); }
    await reloadOrders(); closeModal('orderModalOverlay');
  } catch(e) { console.error(e); showToast('Lỗi khi lưu đơn hàng: ' + friendlyError(e), 'error'); }
}

// Nhân đôi: chép nguyên đơn thành đơn mới, chỉ cấp Bill VIT mới (theo ngày hôm nay); sửa lại bằng nút Sửa nếu cần
async function duplicateOrder(id) {
  if (!requirePerm('orders', 'create')) return;
  const src = state.orders.find(x => x.id === id);
  if (!src) return;
  const o = { ...src, bill_vit: generateNextBillVit() };
  delete o.id; delete o.created_at;
  try {
    await DB.addOrder(o);
    await reloadOrders();
    showToast('Đã nhân đôi ' + src.bill_vit + ' → ' + o.bill_vit, 'success');
  } catch(e) { console.error(e); showToast('Lỗi khi nhân đôi đơn hàng: ' + friendlyError(e), 'error'); }
}

async function reloadOrders() { await reloadTables(['orders']); }

/* ============================================================
   DASHBOARD
   ============================================================ */
const ORDER_FILTER_COLUMNS = {
  ngay_giao_hang: { label: 'Ngày Giao Hàng', get: o => o.ngay_giao_hang ? formatDateVN(o.ngay_giao_hang) : '—' },
  khach_hang_ma: { label: 'Mã Khách Hàng', get: o => {
    const kh = customerById(o.khach_hang_id);
    return (kh && kh.ma_kh) ? kh.ma_kh : (o.khach_hang_name || '—');
  } },
  tuyen_duong: { label: 'Tuyến Đường', get: o => `${o.tinh_gui || '?'} → ${o.tinh_nhan || '?'}` },
  bks: { label: 'BKS', get: o => o.bks || '—' },
  nha_thau: { label: 'Nhà Thầu', get: o => o.nha_thau_ma || o.nha_thau_ten || '—' },
  tai_trong_xe: { label: 'Tải Trọng Xe', get: o => o.tai_trong_xe ? (Number(o.tai_trong_xe).toLocaleString('vi-VN') + ' tấn') : '—' }
};

function getFilteredOrders(excludeColKey) {
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  const from = document.getElementById('filterDateFrom').value;
  const to = document.getElementById('filterDateTo').value;
  let list = state.orders.filter(o => {
    if (q) {
      const hay = [o.bill_vit, o.khach_hang_name, o.nha_thau_ten, o.bks, o.tinh_gui, o.tinh_nhan, o.san_pham, o.ghi_chu].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (from || to) {
      if (!o.created_at) return false;
      const day = o.created_at.slice(0,10);
      if (from && day < from) return false;
      if (to && day > to) return false;
    }
    return true;
  });
  Object.keys(ORDER_FILTER_COLUMNS).forEach(key => {
    if (key === excludeColKey) return;
    const allowedSet = state.orderColFilters[key];
    if (allowedSet) {
      const getter = ORDER_FILTER_COLUMNS[key].get;
      list = list.filter(o => allowedSet.has(getter(o)));
    }
  });
  return list;
}

// Sort A→Z theo 1 cột của bảng Đơn hàng (chọn trong popover lọc cột).
// Ngày Giao Hàng so theo ngày thật (cũ → mới), Tải Trọng Xe so theo số,
// cột chữ so theo tiếng Việt + số tự nhiên (VD: KH2 trước KH10).
// Ô trống ('—') luôn nằm cuối. Array.sort ổn định nên các dòng bằng nhau
// giữ nguyên thứ tự gốc.
function orderSortValue(key, o) {
  if (key === 'ngay_giao_hang') return o.ngay_giao_hang || null;
  if (key === 'tai_trong_xe') { const n = Number(o.tai_trong_xe); return o.tai_trong_xe && !isNaN(n) ? n : null; }
  const v = ORDER_FILTER_COLUMNS[key].get(o);
  return v && v !== '—' ? v : null;
}
function sortOrdersForTable(list) {
  const key = state.orderSortKey;
  if (!key || !ORDER_FILTER_COLUMNS[key]) return list;
  const dir = state.orderSortDir === 'desc' ? -1 : 1;
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
  return list
    .map(o => ({ o, v: orderSortValue(key, o) }))
    .sort((a, b) => {
      // Ô trống luôn nằm cuối, bất kể đang sort A→Z hay Z→A.
      if (a.v === null || b.v === null) return (a.v === null) - (b.v === null);
      if (typeof a.v === 'number') return (a.v - b.v) * dir;
      return (key === 'ngay_giao_hang' ? (a.v < b.v ? -1 : a.v > b.v ? 1 : 0) : collator.compare(a.v, b.v)) * dir;
    })
    .map(x => x.o);
}

let activeFilterPopover = null;

function closeColFilterPopover() {
  if (activeFilterPopover) { activeFilterPopover.remove(); activeFilterPopover = null; }
  document.querySelectorAll('.th-filter-btn.active-btn').forEach(b => b.classList.remove('active-btn'));
}

function updateColFilterButtonIndicators() {
  document.querySelectorAll('.th-filter-btn').forEach(btn => {
    const key = btn.dataset.filterCol;
    btn.classList.toggle('active-filter', !!state.orderColFilters[key]);
    btn.classList.toggle('active-sort', state.orderSortKey === key);
  });
}

function openColFilterPopover(key, btnEl) {
  closeColFilterPopover();
  const col = ORDER_FILTER_COLUMNS[key];
  const isDateCol = key === 'ngay_giao_hang';
  const scopedOrders = getFilteredOrders(key);
  // Đếm số đơn theo từng giá trị — giống panel lọc cột kiểu Excel ở "Lịch lái
  // xe" (web Lương Lái Xe), hiện số lượng (count) cạnh mỗi giá trị.
  const countMap = new Map();
  scopedOrders.forEach(o => { const v = col.get(o); countMap.set(v, (countMap.get(v) || 0) + 1); });
  const allValues = [...countMap.keys()].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }));
  const existing = state.orderColFilters[key];
  const checkedState = new Map(allValues.map(v => [v, existing ? existing.has(v) : true]));

  // Cột Ngày Giao Hàng: gộp các ngày theo từng tháng (giống Excel) để danh
  // sách gọn gàng, sort đúng thứ tự thời gian (không sort theo chuỗi
  // "dd/mm/yyyy" vì sẽ lộn ngày/tháng/năm) — bấm vào tháng mới xổ ra các
  // ngày trong tháng đó.
  let dateGroups = null, dateOthers = null;
  if (isDateCol) {
    const groupMap = new Map();
    dateOthers = [];
    allValues.forEach(v => {
      const parts = v.split('/');
      if (parts.length === 3 && parts.every(p => /^\d+$/.test(p))) {
        const [dd, mm, yyyy] = parts;
        const gKey = `${yyyy}-${mm}`;
        if (!groupMap.has(gKey)) groupMap.set(gKey, { key: gKey, year: Number(yyyy), month: Number(mm), label: `Tháng ${Number(mm)}/${yyyy}`, days: [] });
        groupMap.get(gKey).days.push(v);
      } else {
        dateOthers.push(v);
      }
    });
    dateGroups = [...groupMap.values()].sort((a, b) => (a.year - b.year) || (a.month - b.month));
    dateGroups.forEach(g => g.days.sort((a, b) => Number(a.split('/')[0]) - Number(b.split('/')[0])));
  }

  const pop = document.createElement('div');
  pop.className = 'col-filter-popover';
  const isSortedAsc = state.orderSortKey === key && state.orderSortDir !== 'desc';
  const isSortedDesc = state.orderSortKey === key && state.orderSortDir === 'desc';
  const sortBtn = (dir, isActive, label, hint, letters) => `
    <button type="button" class="col-filter-sort${isActive ? ' active' : ''}" data-act="sort-${dir}" title="${isActive ? 'Bấm lần nữa để bỏ sắp xếp' : 'Sắp xếp bảng theo cột này'}">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16"></path><polyline points="3 16 7 20 11 16"></polyline><text x="14" y="10" font-size="8" font-weight="700" fill="currentColor" stroke="none">${letters[0]}</text><text x="14" y="20" font-size="8" font-weight="700" fill="currentColor" stroke="none">${letters[1]}</text></svg>
      <span>${label}${hint ? ` <span class="col-filter-sort-hint">${hint}</span>` : ''}</span>
      ${isActive ? '<svg class="col-filter-sort-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
    </button>`;
  pop.innerHTML = `
    ${sortBtn('az', isSortedAsc, 'Sắp xếp A → Z', isDateCol ? '(cũ → mới)' : '', ['A', 'Z'])}
    ${sortBtn('za', isSortedDesc, 'Sắp xếp Z → A', isDateCol ? '(mới → cũ)' : '', ['Z', 'A'])}
    <div class="col-filter-search"><input type="text" placeholder="Tìm trong danh sách…"></div>
    <label class="col-filter-all-row"><input type="checkbox" class="col-filter-all"> <b>Chọn tất cả</b></label>
    <div class="col-filter-list"></div>
    <div class="col-filter-actions">
      <button class="btn btn-primary" data-act="apply">OK</button>
      <button class="btn btn-ghost" data-act="cancel">Huỷ</button>
    </div>`;
  document.body.appendChild(pop);

  const rect = btnEl.getBoundingClientRect();
  const popWidth = 240;
  let left = rect.right - popWidth;
  left = Math.max(8, Math.min(left, window.innerWidth - popWidth - 8));
  pop.style.top = (rect.bottom + 6) + 'px';
  pop.style.left = left + 'px';

  const listEl = pop.querySelector('.col-filter-list');
  const searchInput = pop.querySelector('.col-filter-search input');
  const allBox = pop.querySelector('.col-filter-all');

  function itemHtml(v, indent) {
    const checked = checkedState.get(v) ? 'checked' : '';
    const safe = escHtml(v);
    return `<label class="col-filter-item${indent ? ' col-filter-item-indent' : ''}" data-cf-text="${safe.toLowerCase()}">
      <input type="checkbox" value="${safe}" ${checked}>
      <span class="col-filter-item-label">${safe}</span>
      <span class="col-filter-count">(${countMap.get(v)})</span>
    </label>`;
  }
  function groupHtml(g) {
    const groupCount = g.days.reduce((s, v) => s + countMap.get(v), 0);
    const safeLabel = escHtml(g.label);
    return `<div class="col-filter-group" data-cf-group="${g.key}">
      <div class="col-filter-item col-filter-group-row" data-cf-text="${safeLabel.toLowerCase()}">
        <button type="button" class="col-filter-group-toggle" title="Mở/đóng ${safeLabel}">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 6 15 12 9 18"></polyline></svg>
        </button>
        <input type="checkbox" class="col-filter-group-check">
        <span class="col-filter-item-label"><b>${safeLabel}</b></span>
        <span class="col-filter-count">(${groupCount})</span>
      </div>
      <div class="col-filter-group-days">${g.days.map(v => itemHtml(v, true)).join('')}</div>
    </div>`;
  }

  // Danh sách checkbox "lá" (ngày lẻ / giá trị thường) đang hiển thị theo ô
  // tìm — "Chọn tất cả" chỉ tác động đúng các dòng này.
  function visibleLeafBoxes() {
    if (!isDateCol) return [...listEl.querySelectorAll('.col-filter-item')].filter(l => !l.hidden).map(l => l.querySelector('input'));
    const out = [];
    listEl.querySelectorAll('.col-filter-group').forEach(g => {
      if (g.hidden) return;
      g.querySelectorAll('.col-filter-group-days .col-filter-item').forEach(l => { if (!l.hidden) out.push(l.querySelector('input')); });
    });
    listEl.querySelectorAll(':scope > .col-filter-item').forEach(l => { if (!l.hidden) out.push(l.querySelector('input')); });
    return out;
  }
  // Checkbox của từng tháng là tri-state theo TOÀN BỘ ngày trong tháng đó
  // (không phụ thuộc ô tìm) — tick/bỏ tick cả tháng luôn áp dụng hết.
  function syncGroupBoxes() {
    if (!isDateCol) return;
    listEl.querySelectorAll('.col-filter-group').forEach(g => {
      const groupBox = g.querySelector('.col-filter-group-check');
      const dayBoxes = [...g.querySelectorAll('.col-filter-group-days input[type=checkbox]')];
      if (!dayBoxes.length) { groupBox.checked = false; groupBox.indeterminate = false; return; }
      const checkedCount = dayBoxes.filter(cb => cb.checked).length;
      groupBox.checked = checkedCount === dayBoxes.length;
      groupBox.indeterminate = checkedCount > 0 && checkedCount < dayBoxes.length;
    });
  }
  function syncAllBox() {
    syncGroupBoxes();
    const boxes = visibleLeafBoxes();
    if (!boxes.length) { allBox.checked = false; allBox.indeterminate = false; return; }
    const checkedCount = boxes.filter(cb => cb.checked).length;
    allBox.checked = checkedCount === boxes.length;
    allBox.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
  }
  function renderList() {
    if (!allValues.length) { listEl.innerHTML = '<div class="col-filter-empty">Không có giá trị.</div>'; return; }
    if (!isDateCol) { listEl.innerHTML = allValues.map(v => itemHtml(v, false)).join(''); return; }
    listEl.innerHTML = dateGroups.map(groupHtml).join('') + dateOthers.map(v => itemHtml(v, false)).join('');
  }
  renderList();
  syncAllBox();

  // Ô tìm chỉ ẨN/HIỆN trên DOM, không đụng tới lựa chọn đã tick — giống
  // đúng hành vi ở "Lịch lái xe" (bindColFilterPanel / searchInput.oninput).
  // Với cột ngày: gõ khớp tên tháng hoặc khớp 1 ngày trong tháng đều tự mở
  // tháng đó ra (force-open) để thấy ngay kết quả.
  searchInput.addEventListener('input', e => {
    const ft = e.target.value.trim().toLowerCase();
    if (!isDateCol) {
      listEl.querySelectorAll('.col-filter-item').forEach(l => { l.hidden = !!ft && !l.dataset.cfText.includes(ft); });
      syncAllBox();
      return;
    }
    listEl.querySelectorAll(':scope > .col-filter-item').forEach(l => { l.hidden = !!ft && !l.dataset.cfText.includes(ft); });
    listEl.querySelectorAll('.col-filter-group').forEach(g => {
      const dayRows = [...g.querySelectorAll('.col-filter-group-days .col-filter-item')];
      if (!ft) { g.hidden = false; g.classList.remove('force-open'); dayRows.forEach(d => d.hidden = false); return; }
      const groupMatches = g.querySelector('.col-filter-group-row').dataset.cfText.includes(ft);
      let anyChildMatch = false;
      dayRows.forEach(d => {
        const match = d.dataset.cfText.includes(ft);
        d.hidden = groupMatches ? false : !match;
        if (match) anyChildMatch = true;
      });
      const show = groupMatches || anyChildMatch;
      g.hidden = !show;
      g.classList.toggle('force-open', show);
    });
    syncAllBox();
  });
  // Gõ xong bấm Enter = bấm OK (như Excel).
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyBtn.click(); }
  });
  // Bấm vào dòng tháng (trừ ô tick) = mở/đóng danh sách ngày trong tháng.
  listEl.addEventListener('click', e => {
    const row = e.target.closest('.col-filter-group-row');
    if (!row || e.target.closest('.col-filter-group-check')) return;
    e.preventDefault();
    row.closest('.col-filter-group').classList.toggle('open');
  });
  listEl.addEventListener('change', e => {
    if (!e.target.matches('input[type=checkbox]')) return;
    if (e.target.classList.contains('col-filter-group-check')) {
      const group = e.target.closest('.col-filter-group');
      group.querySelectorAll('.col-filter-group-days input[type=checkbox]').forEach(cb => {
        cb.checked = e.target.checked;
        checkedState.set(cb.value, e.target.checked);
      });
      syncAllBox();
      return;
    }
    checkedState.set(e.target.value, e.target.checked);
    syncAllBox();
  });
  allBox.onchange = () => {
    visibleLeafBoxes().forEach(cb => {
      cb.checked = allBox.checked;
      checkedState.set(cb.value, allBox.checked);
    });
    allBox.indeterminate = false;
    syncGroupBoxes();
  };
  // Bấm "Sắp xếp A → Z" / "Z → A" = sort ngay theo chiều đó (như Excel);
  // bấm lại nút đang chọn = bỏ sort, quay về thứ tự mặc định.
  pop.querySelector('[data-act="sort-az"]').onclick = () => {
    state.orderSortKey = isSortedAsc ? null : key;
    state.orderSortDir = 'asc';
    closeColFilterPopover();
    updateColFilterButtonIndicators();
    renderDashboard();
  };
  pop.querySelector('[data-act="sort-za"]').onclick = () => {
    state.orderSortKey = isSortedDesc ? null : key;
    state.orderSortDir = 'desc';
    closeColFilterPopover();
    updateColFilterButtonIndicators();
    renderDashboard();
  };
  pop.querySelector('[data-act="cancel"]').onclick = closeColFilterPopover;
  const applyBtn = pop.querySelector('[data-act="apply"]');
  applyBtn.onclick = () => {
    // Giống Excel: đang gõ trong ô tìm thì OK chỉ giữ các giá trị KHỚP chữ
    // vừa gõ (đang hiện + đang tick) — dòng bị ẩn do không khớp sẽ bị lọc bỏ
    // khỏi bảng. Ô tìm trống thì giữ đúng các ô đang tick như cũ.
    const ft = searchInput.value.trim();
    const selected = ft
      ? new Set(visibleLeafBoxes().filter(cb => cb.checked).map(cb => cb.value))
      : new Set(allValues.filter(v => checkedState.get(v)));
    if (selected.size >= allValues.length) delete state.orderColFilters[key];
    else state.orderColFilters[key] = selected;
    closeColFilterPopover();
    updateColFilterButtonIndicators();
    renderDashboard();
  };

  activeFilterPopover = pop;
  btnEl.classList.add('active-btn');
}

function renderKpis(orders) {
  const totalRev = orders.reduce((s, o) => s + (Number(o.tong_ban)||0), 0);
  const totalCost = orders.reduce((s, o) => s + (Number(o.tong_mua)||0), 0);
  const net = totalRev - totalCost;
  document.getElementById('kpiTotalOrders').textContent = orders.length.toLocaleString('vi-VN');
  document.getElementById('kpiTotalRevenue').textContent = formatCurrency(totalRev);
  document.getElementById('kpiTotalCost').textContent = formatCurrency(totalCost);
  const el = document.getElementById('kpiNetProfit');
  el.textContent = formatCurrency(net);
  el.style.color = net < 0 ? 'var(--color-accent-red)' : '';
}

// Tra khách hàng theo id bằng Map (thay cho .find() trong vòng lặp: O(n·m) → O(n)).
// Map được dựng lại khi state.customers là mảng mới (mỗi lần tải lại dữ liệu).
let _custMapSrc = null, _custMap = null;
function customerById(id) {
  if (_custMapSrc !== state.customers) { _custMapSrc = state.customers; _custMap = new Map(state.customers.map(c => [c.id, c])); }
  return _custMap.get(id);
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTableBody');
  const empty = document.getElementById('ordersEmptyState');
  if (!orders.length) { tbody.innerHTML = ''; empty.querySelector('p').textContent = ordersEmptyMessage(); empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  const canEdit = can('orders', 'edit'), canDel = can('orders', 'delete'), canDup = can('orders', 'create');
  tbody.innerHTML = orders.map(o => {
    const isNeg = Number(o.loi_nhuan) < 0;
    const profitBadge = `<span class="profit-badge ${isNeg ? 'neg' : 'pos'}">${formatCurrency(o.loi_nhuan)}</span>`;
    const kh = customerById(o.khach_hang_id);
    const khMaDisplay = kh && kh.ma_kh ? kh.ma_kh : (o.khach_hang_name || '—');
    const ntMaDisplay = o.nha_thau_ma || '—';
    return `<tr>
      <td class="cell-bill">${escHtml(o.bill_vit)}</td>
      <td class="cell-muted">${o.ngay_giao_hang ? formatDateVN(o.ngay_giao_hang) : '—'}</td>
      <td>${escHtml(khMaDisplay)}</td>
      <td class="cell-route">${escHtml(o.tinh_gui||'?')} → ${escHtml(o.tinh_nhan||'?')}</td>
      <td class="cell-muted">${escHtml(o.bks||'—')}</td>
      <td class="cell-muted">${escHtml(ntMaDisplay)}</td>
      <td class="cell-muted">${o.tai_trong_xe ? Number(o.tai_trong_xe).toLocaleString('vi-VN') + ' tấn' : '—'}</td>
      <td class="text-right">${formatCurrency(o.tong_mua)}</td>
      <td class="text-right">${formatCurrency(o.tong_ban)}</td>
      <td class="text-right">${profitBadge}</td>
      <td class="row-actions"><div class="actions-inner">
        ${canEdit ? `<button class="btn-icon-sm" data-edit-o="${o.id}" title="Sửa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>` : `<button class="btn-icon-sm" data-view-o="${o.id}" title="Xem chi tiết">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </button>`}
        ${canDup ? `<button class="btn-icon-sm" data-dup-o="${o.id}" title="Nhân đôi đơn (tạo đơn mới giống hệt, Bill VIT mới)">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>` : ''}
        ${canDel ? `<button class="btn-icon-sm danger" data-del-o="${o.id}" title="Xóa">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>
        </button>` : ''}
      </div></td>
    </tr>`;
  }).join('');
  // Nút Sửa/Xóa: 1 listener ủy quyền trên tbody (bindEvents), không gắn từng dòng
}

function renderDashboard() { const f = getFilteredOrders(); renderKpis(f); renderOrdersTable(sortOrdersForTable(f)); }

/* ============================================================
   EXPORT (CSV — dùng làm template để nhập lại)
   ============================================================ */
const EXPORT_HEADERS = [
  'Bill VIT','Ngày Giao Hàng','Khách Hàng','Nhà Thầu','Mã Nhà Thầu','BKS','Tải Trọng Xe(tấn)','Nhân Viên',
  'Bill KH','Bill Đối Tác','Kho Lấy Hàng','Tỉnh Gửi','Phường Gửi','Người Gửi','ĐT Gửi',
  'Tên Nhận','SĐT Nhận','Địa Chỉ Nhận','Tỉnh Nhận','Phường Nhận',
  'Sản Phẩm','Khối Lượng(kg)','Số Kiện',
  'Cước Mua','Phát Sinh Mua','Cước Bán','Phát Sinh Bán','Ghi Chú'
];

function getExportData() {
  return sortOrdersForTable(getFilteredOrders()).map(o => ({
    'Bill VIT': o.bill_vit, 'Ngày Giao Hàng': o.ngay_giao_hang ? formatDateVN(o.ngay_giao_hang) : '',
    'Khách Hàng': o.khach_hang_name, 'Nhà Thầu': o.nha_thau_ten, 'Mã Nhà Thầu': o.nha_thau_ma, 'BKS': o.bks,
    'Tải Trọng Xe(tấn)': o.tai_trong_xe,
    'Nhân Viên': o.nhan_vien, 'Bill KH': o.bill_khach_hang, 'Bill Đối Tác': o.bill_doi_tac,
    'Kho Lấy Hàng': o.kho_lay_hang, 'Tỉnh Gửi': o.tinh_gui, 'Phường Gửi': o.phuong_gui,
    'Người Gửi': o.nguoi_gui, 'ĐT Gửi': o.dt_gui, 'Tên Nhận': o.ten_nhan, 'SĐT Nhận': o.sdt_nhan,
    'Địa Chỉ Nhận': o.dia_chi_nhan, 'Tỉnh Nhận': o.tinh_nhan, 'Phường Nhận': o.phuong_nhan,
    'Sản Phẩm': o.san_pham, 'Khối Lượng(kg)': o.khoi_luong, 'Số Kiện': o.so_kien,
    'Cước Mua': o.cuoc_mua, 'Phát Sinh Mua': o.phat_sinh_mua, 'Cước Bán': o.cuoc_ban, 'Phát Sinh Bán': o.phat_sinh_ban,
    'Ghi Chú': o.ghi_chu
  }));
}

function exportCsv() {
  const data = getExportData();
  if (!data.length) { showToast('Không có dữ liệu để xuất.', 'error'); return; }
  const headers = EXPORT_HEADERS;
  const rows = data.map(r => headers.map(h => { const v = r[h] == null ? '' : String(r[h]); return (v.includes(',') || v.includes('"') || v.includes('\n')) ? '"' + v.replace(/"/g,'""') + '"' : v; }).join(','));
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'VITTRANS_DonHang_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('Đã xuất file CSV thành công.', 'success');
}

const PROFITLOSS_TEMPLATE_KEY = 'vittrans_profitloss_template_b64';
const PL_SHEET_NAME = 'Kế hoạch';
const PL_DATA_START_ROW = 14;
const PL_DATA_END_ROW = 579;

async function chooseAndStoreProfitLossTemplate() {
  const buffer = await pickExcelFile();
  if (!buffer) return null;
  if (!(await loadExcelJS())) return null;
  try {
    const test = new ExcelJS.Workbook();
    await test.xlsx.load(buffer);
    if (!test.getWorksheet(PL_SHEET_NAME)) {
      showToast(`File này không có sheet "${PL_SHEET_NAME}". Vui lòng chọn đúng file "Báo cáo lãi lỗ".`, 'error');
      return null;
    }
  } catch(e) {
    console.error(e);
    showToast('Không đọc được file Excel này. Vui lòng chọn lại.', 'error');
    return null;
  }
  const b64 = arrayBufferToBase64(buffer);
  await TemplateStore.set(PROFITLOSS_TEMPLATE_KEY, b64);
  return buffer;
}

async function exportOrdersProfitLossReport() {
  const orders = getFilteredOrders();
  if (!orders.length) { showToast('Không có dữ liệu để xuất.', 'error'); return; }
  const maxRows = PL_DATA_END_ROW - PL_DATA_START_ROW + 1;
  if (orders.length > maxRows) {
    showToast(`File mẫu chỉ hỗ trợ tối đa ${maxRows} dòng/lần xuất, danh sách đang lọc có ${orders.length} dòng. Vui lòng lọc bớt rồi xuất lại.`, 'error');
    return;
  }

  let stored = null;
  stored = await TemplateStore.get(PROFITLOSS_TEMPLATE_KEY);
  let buffer;
  if (stored) {
    buffer = base64ToArrayBuffer(stored);
  } else {
    showToast(`Vui lòng chọn file Excel mẫu "Báo Cáo Lãi Lỗ" (có sheet "${PL_SHEET_NAME}") — chỉ cần chọn 1 lần.`, 'success');
    buffer = await chooseAndStoreProfitLossTemplate();
    if (!buffer) return;
  }

  if (!(await loadExcelJS())) return;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch(e) {
    console.error(e);
    showToast('File mẫu đã lưu bị lỗi. Vui lòng bấm "Đổi File Mẫu" để chọn lại.', 'error');
    return;
  }
  const ws = wb.getWorksheet(PL_SHEET_NAME);
  if (!ws) {
    showToast(`File mẫu không có sheet "${PL_SHEET_NAME}". Vui lòng bấm "Đổi File Mẫu" để chọn lại.`, 'error');
    await TemplateStore.remove(PROFITLOSS_TEMPLATE_KEY);
    return;
  }

  // Tiêu đề báo cáo theo tháng: lấy theo "Từ ngày" đang lọc, nếu không lọc thì lấy tháng hiện tại
  const fromFilter = document.getElementById('filterDateFrom').value;
  const refDate = fromFilter ? new Date(fromFilter + 'T00:00:00') : new Date();
  ws.getCell('A10').value = `BÁO CÁO LÃI/LỖ THEO BẢNG KÊ THÁNG ${refDate.getMonth() + 1}.${refDate.getFullYear()}`;

  // Xóa sạch vùng dữ liệu cũ trước khi điền lại
  for (let r = PL_DATA_START_ROW; r <= PL_DATA_END_ROW; r++) {
    ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O'].forEach(col => { ws.getCell(`${col}${r}`).value = null; });
  }

  orders.forEach((o, idx) => {
    const row = PL_DATA_START_ROW + idx;
    const kh = state.customers.find(c => c.id === o.khach_hang_id);
    ws.getRow(row).hidden = false;
    ws.getCell(`A${row}`).value = idx + 1;
    ws.getCell(`B${row}`).value = kh ? (kh.ma_kh || '') : '';
    ws.getCell(`D${row}`).value = o.nha_thau_ma || '';
    ws.getCell(`E${row}`).value = o.bill_vit || '';
    ws.getCell(`F${row}`).value = `Cước vận chuyển từ ${o.phuong_gui || ''}, ${o.tinh_gui || ''} - ${o.phuong_nhan || ''}, ${o.tinh_nhan || ''}`;
    ws.getCell(`G${row}`).value = o.tai_trong_xe || 0;
    ws.getCell(`H${row}`).value = Number(o.cuoc_mua) || 0;
    ws.getCell(`I${row}`).value = Number(o.phat_sinh_mua) || 0;
    ws.getCell(`J${row}`).value = { formula: `H${row}+I${row}` };
    ws.getCell(`K${row}`).value = Number(o.cuoc_ban) || 0;
    ws.getCell(`L${row}`).value = Number(o.phat_sinh_ban) || 0;
    ws.getCell(`M${row}`).value = { formula: `K${row}+L${row}` };
    ws.getCell(`N${row}`).value = { formula: `M${row}-J${row}` };
    ws.getCell(`O${row}`).value = o.ghi_chu || '';
  });

  // Ngày ký (dòng chữ ký cuối báo cáo) cập nhật theo ngày xuất thực tế
  const today = new Date();
  const dateSignedCell = ws.getCell('L583');
  if (dateSignedCell.value) {
    dateSignedCell.value = `Hà Nội, ngày ${pad(today.getDate(),2)} tháng ${pad(today.getMonth()+1,2)} năm ${today.getFullYear()}`;
  }

  // Chỉ giữ lại sheet chính khi xuất ra — sheet khác của file mẫu chứa
  // dữ liệu kinh doanh thật của các đơn hàng/kỳ báo cáo trước, không xuất kèm.
  [...wb.worksheets].forEach(sheet => { if (sheet.name !== PL_SHEET_NAME) wb.removeWorksheet(sheet.id); });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bao cao lai lo - thang ${refDate.getMonth() + 1}.${refDate.getFullYear()} - ${todayISODate()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Đã xuất báo cáo lãi lỗ.', 'success');
}

/* ============================================================
   IMPORT EXCEL (bulk nhập đơn hàng)
   Cột file phải khớp với header xuất ra từ "Xuất CSV" (dùng làm template)
   ============================================================ */
function parseImportDate(value) {
  if (value === '' || value == null) return null;
  if (typeof value === 'number') {
    // Excel lưu ngày dạng số serial (số ngày kể từ 1899-12-30)
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2);
  }
  const s = String(value).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/); // yyyy-mm-dd
  if (m) return `${m[1]}-${pad(+m[2], 2)}-${pad(+m[3], 2)}`;
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/); // dd/mm/yyyy
  if (m) return `${m[3]}-${pad(+m[2], 2)}-${pad(+m[1], 2)}`;
  return null;
}

async function readFileAsRows(file) {
  if (!(await loadXLSX())) throw new Error('Không tải được thư viện đọc Excel');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        resolve(rows);
      } catch(err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function findOrCreateCustomerByName(name, cache) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  let c = state.customers.find(x => (x.ten_kh||'').trim().toLowerCase() === key);
  if (!c) {
    c = { id: uid(), ma_kh: 'KH' + pad(state.customers.length + cache.size + 1, 4), ten_kh: name.trim(), pic: '', sdt: '', dia_chi: '', mst: '' };
  }
  cache.set(key, c);
  return c;
}

function findOrCreateContractorByName(name, ma, cache) {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  let c = state.contractors.find(x => (x.ten_nha_thau||'').trim().toLowerCase() === key);
  if (!c) {
    c = { id: uid(), ma_nha_thau: (ma && ma.trim()) || ('NT' + pad(state.contractors.length + cache.size + 1, 4)), ten_nha_thau: name.trim(), mst: '', dia_chi: '', loai_hinh: 'Vận tải', ky_doi_soat: 30, files: [] };
  }
  cache.set(key, c);
  return c;
}

async function importOrdersFromFile(file) {
  let rows;
  try { rows = await readFileAsRows(file); }
  catch(e) { showToast('Không đọc được file. Vui lòng kiểm tra định dạng.', 'error'); return; }

  if (!rows.length) { showToast('File không có dữ liệu.', 'error'); return; }

  openImportPreview(rows);
}

/* ---- Xem trước & chỉnh sửa dữ liệu trước khi nhập thật vào hệ thống ---- */
let importPreviewRows = [];

const IMPORT_PREVIEW_COLS = [
  ['Bill VIT', 'Bill VIT'], ['Ngày Giao Hàng', 'Ngày Giao Hàng'], ['Khách Hàng', 'Khách Hàng *'],
  ['Nhà Thầu', 'Nhà Thầu'], ['Mã Nhà Thầu', 'Mã NT'], ['BKS', 'BKS'], ['Tải Trọng Xe(tấn)', 'Tải Trọng(tấn)'],
  ['Nhân Viên', 'Nhân Viên'], ['Bill KH', 'Bill KH'], ['Bill Đối Tác', 'Bill Đối Tác'],
  ['Kho Lấy Hàng', 'Kho Lấy Hàng'], ['Tỉnh Gửi', 'Tỉnh Gửi *'], ['Phường Gửi', 'Phường Gửi'],
  ['Người Gửi', 'Người Gửi'], ['ĐT Gửi', 'ĐT Gửi'], ['Tên Nhận', 'Tên Nhận'], ['SĐT Nhận', 'SĐT Nhận'],
  ['Địa Chỉ Nhận', 'Địa Chỉ Nhận'], ['Tỉnh Nhận', 'Tỉnh Nhận *'], ['Phường Nhận', 'Phường Nhận'],
  ['Sản Phẩm', 'Sản Phẩm *'], ['Khối Lượng(kg)', 'Khối Lượng(kg)'], ['Số Kiện', 'Số Kiện'],
  ['Cước Mua', 'Cước Mua'], ['Phát Sinh Mua', 'PS Mua'], ['Cước Bán', 'Cước Bán'], ['Phát Sinh Bán', 'PS Bán'],
  ['Ghi Chú', 'Ghi Chú']
];
const IMPORT_REQUIRED_KEYS = ['Khách Hàng', 'Tỉnh Gửi', 'Tỉnh Nhận', 'Sản Phẩm'];

function importRowIsValid(row) {
  return IMPORT_REQUIRED_KEYS.every(k => String(row[k] || '').trim());
}

function openImportPreview(rows) {
  importPreviewRows = rows.map(r => {
    const row = { ...r };
    // Excel trả ngày dạng số serial hoặc nhiều định dạng khác nhau — chuẩn hóa về dd/mm/yyyy để xem/sửa cho dễ.
    // Giữ nguyên chuỗi gốc nếu không parse được, để người dùng tự sửa thủ công trong bảng xem trước.
    const iso = parseImportDate(row['Ngày Giao Hàng']);
    row['Ngày Giao Hàng'] = iso ? formatDateVN(iso) : String(row['Ngày Giao Hàng'] || '');
    return row;
  });
  document.getElementById('importPreviewHead').innerHTML =
    '<tr><th>#</th>' + IMPORT_PREVIEW_COLS.map(c => `<th>${escHtml(c[1])}</th>`).join('') + '<th class="text-center">Xóa</th></tr>';
  renderImportPreview();
  openModal('importPreviewModalOverlay');
}

function renderImportPreview() {
  const tbody = document.getElementById('importPreviewBody');
  tbody.innerHTML = importPreviewRows.map((row, i) => {
    const valid = importRowIsValid(row);
    const cells = IMPORT_PREVIEW_COLS.map(([key]) => {
      const val = row[key] == null ? '' : row[key];
      const invalid = IMPORT_REQUIRED_KEYS.includes(key) && !String(val).trim();
      return `<td><input class="import-cell-input${invalid ? ' invalid' : ''}" data-row="${i}" data-key="${escHtml(key)}" value="${escHtml(String(val))}"></td>`;
    }).join('');
    return `<tr${valid ? '' : ' class="import-row-invalid"'}>` +
      `<td class="cell-muted">${i + 1}</td>${cells}` +
      `<td class="text-center"><button type="button" class="btn-icon-sm danger import-row-del" data-row="${i}" title="Xóa dòng này">` +
      `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>` +
      `</button></td></tr>`;
  }).join('');

  tbody.querySelectorAll('.import-cell-input').forEach(inp => {
    inp.oninput = () => {
      const row = importPreviewRows[+inp.dataset.row];
      row[inp.dataset.key] = inp.value;
      if (IMPORT_REQUIRED_KEYS.includes(inp.dataset.key)) {
        inp.classList.toggle('invalid', !inp.value.trim());
        inp.closest('tr').classList.toggle('import-row-invalid', !importRowIsValid(row));
      }
      updateImportPreviewSummary();
    };
  });
  tbody.querySelectorAll('.import-row-del').forEach(btn => {
    btn.onclick = () => { importPreviewRows.splice(+btn.dataset.row, 1); renderImportPreview(); };
  });
  updateImportPreviewSummary();
}

function updateImportPreviewSummary() {
  const total = importPreviewRows.length;
  const validCount = importPreviewRows.filter(importRowIsValid).length;
  const invalidCount = total - validCount;
  document.getElementById('importPreviewSummary').textContent = total === 0
    ? 'Không còn dòng nào.'
    : (invalidCount > 0
      ? `${total} dòng — ${validCount} hợp lệ, ${invalidCount} dòng thiếu Khách Hàng/Sản Phẩm/Tỉnh Gửi/Tỉnh Nhận (sẽ bị bỏ qua khi nhập).`
      : `${total} dòng, tất cả hợp lệ.`);
  const btn = document.getElementById('btnConfirmImportPreview');
  btn.textContent = `Nhập ${validCount} Dòng`;
  btn.disabled = validCount === 0;
}

async function commitImportRows(rows) {
  const customerCache = new Map();
  const contractorCache = new Map();
  const newCustomers = [];
  const newContractors = [];
  const ordersToImport = [];
  const errors = [];
  let billOffset = 0;

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // +2 vì hàng 1 là header, Excel 1-indexed
    const khName = String(row['Khách Hàng'] || '').trim();
    const sanPham = String(row['Sản Phẩm'] || '').trim();
    const tinhGui = String(row['Tỉnh Gửi'] || '').trim();
    const tinhNhan = String(row['Tỉnh Nhận'] || '').trim();

    if (!khName || !sanPham || !tinhGui || !tinhNhan) {
      errors.push(`Dòng ${rowNum}: thiếu Khách Hàng / Sản Phẩm / Tỉnh Gửi / Tỉnh Nhận — đã bỏ qua.`);
      return;
    }

    const kh = findOrCreateCustomerByName(khName, customerCache);
    if (!state.customers.some(x => x.id === kh.id) && !newCustomers.some(x => x.id === kh.id)) newCustomers.push(kh);

    const ntName = String(row['Nhà Thầu'] || '').trim();
    let nt = null;
    if (ntName) {
      nt = findOrCreateContractorByName(ntName, String(row['Mã Nhà Thầu'] || ''), contractorCache);
      if (!state.contractors.some(x => x.id === nt.id) && !newContractors.some(x => x.id === nt.id)) newContractors.push(nt);
    }

    const cuocMua = parseCurrencyInput(row['Cước Mua']);
    const psMua = parseCurrencyInput(row['Phát Sinh Mua']);
    const cuocBan = parseCurrencyInput(row['Cước Bán']);
    const psBan = parseCurrencyInput(row['Phát Sinh Bán']);
    const tongMua = cuocMua + psMua;
    const tongBan = cuocBan + psBan;

    let billVit = String(row['Bill VIT'] || '').trim();
    if (!billVit) { billVit = generateNextBillVit(billOffset); billOffset++; }

    ordersToImport.push({
      bill_vit: billVit,
      ngay_giao_hang: parseImportDate(row['Ngày Giao Hàng']),
      khach_hang_id: kh.id, khach_hang_name: kh.ten_kh,
      nha_thau_id: nt ? nt.id : null, nha_thau_ten: nt ? nt.ten_nha_thau : '', nha_thau_ma: nt ? nt.ma_nha_thau : '',
      bks: String(row['BKS'] || '').trim(),
      tai_trong_xe: Number(row['Tải Trọng Xe(tấn)']) || 0,
      nhan_vien: String(row['Nhân Viên'] || '').trim(),
      bill_khach_hang: String(row['Bill KH'] || '').trim(),
      bill_doi_tac: String(row['Bill Đối Tác'] || '').trim(),
      kho_lay_hang: String(row['Kho Lấy Hàng'] || '').trim(),
      tinh_gui: tinhGui, phuong_gui: String(row['Phường Gửi'] || '').trim(),
      nguoi_gui: String(row['Người Gửi'] || '').trim(), dt_gui: String(row['ĐT Gửi'] || '').trim(),
      ten_nhan: String(row['Tên Nhận'] || '').trim(), sdt_nhan: String(row['SĐT Nhận'] || '').trim(),
      dia_chi_nhan: String(row['Địa Chỉ Nhận'] || '').trim(),
      tinh_nhan: tinhNhan, phuong_nhan: String(row['Phường Nhận'] || '').trim(),
      san_pham: sanPham,
      khoi_luong: Number(row['Khối Lượng(kg)']) || 0, so_kien: Number(row['Số Kiện']) || 0,
      cuoc_mua: cuocMua, phat_sinh_mua: psMua, tong_mua: tongMua,
      cuoc_ban: cuocBan, phat_sinh_ban: psBan, tong_ban: tongBan,
      loi_nhuan: tongBan - tongMua,
      ghi_chu: String(row['Ghi Chú'] || '').trim()
    });
  });

  // Nhập hàng loạt: tắt realtime trong lúc nhập (mỗi dòng sẽ bắn 1 sự kiện → tải lại liên tục),
  // xong tải lại đúng 1 lần.
  state.suppressRealtime++;
  let success = 0, fail = 0, createdCustomers = 0, createdContractors = 0;
  try {
    // 1) Khách hàng / nhà thầu mới. ID tạm (uid()) không phải UUID nên Supabase cấp id thật → ánh xạ lại.
    const idMap = new Map();
    const remap = async (table, list, label) => {
      if (!list.length) return 0;
      const res = await DB.insertMany(table, list);
      let ok = 0;
      res.forEach((r, i) => {
        if (r.row) { idMap.set(list[i].id, r.row.id); ok++; }
        else errors.push('Không tạo được ' + label + ' "' + (list[i].ten_kh || list[i].ten_nha_thau) + '": ' + friendlyError(r.error));
      });
      return ok;
    };
    createdCustomers = await remap('customers', newCustomers, 'khách hàng');
    createdContractors = await remap('contractors', newContractors, 'nhà thầu');
    ordersToImport.forEach(o => {
      // Cloud: id chưa ánh xạ được (tạo lỗi) mà vẫn giữ id tạm sẽ vi phạm kiểu UUID → để trống
      const fix = id => idMap.get(id) || (state.useSupabase && !UUID_RE.test(id || '') ? null : id);
      o.khach_hang_id = fix(o.khach_hang_id);
      o.nha_thau_id = fix(o.nha_thau_id);
    });

    // 2) Đơn hàng: insert theo lô
    const res = await DB.insertMany('orders', ordersToImport);
    res.forEach((r, i) => {
      if (r.row) success++;
      else { fail++; errors.push('Lỗi tạo đơn ' + ordersToImport[i].bill_vit + ': ' + friendlyError(r.error)); }
    });
  } finally {
    state.suppressRealtime--;
  }
  await reloadTables(ALL_TABLES);

  showImportSummary(success, fail, errors, createdCustomers, createdContractors);
}

function showImportSummary(success, fail, errors, newCustCount, newContCount) {
  const body = document.getElementById('importSummaryBody');
  let html = `<p style="margin:0 0 10px;font-size:14px;"><strong style="color:var(--color-accent-green)">${success}</strong> đơn hàng đã nhập thành công.</p>`;
  if (fail > 0) html += `<p style="margin:0 0 10px;font-size:14px;"><strong style="color:var(--color-accent-red)">${fail}</strong> đơn hàng bị lỗi.</p>`;
  if (newCustCount > 0) html += `<p style="margin:0 0 10px;font-size:13px;color:var(--color-text-muted);">Đã tự động tạo ${newCustCount} khách hàng mới.</p>`;
  if (newContCount > 0) html += `<p style="margin:0 0 10px;font-size:13px;color:var(--color-text-muted);">Đã tự động tạo ${newContCount} nhà thầu mới.</p>`;
  if (errors.length) {
    html += `<div style="max-height:200px;overflow-y:auto;background:var(--color-bg);border:1px solid var(--color-border);border-radius:8px;padding:10px;margin-top:8px;">`;
    html += errors.map(e => `<div style="font-size:12.5px;color:var(--color-text-muted);padding:3px 0;">${escHtml(e)}</div>`).join('');
    html += `</div>`;
  }
  body.innerHTML = html;
  openModal('importSummaryModalOverlay');
  showToast(`Nhập Excel hoàn tất: ${success} thành công, ${fail} lỗi.`, fail > 0 ? 'error' : 'success');
}

/* ============================================================
   BẢNG KÊ KHÁCH HÀNG — xuất từ mục Đơn Hàng theo file mẫu "Mẫu excel tải về"
   ============================================================ */
const BK_KH_TEMPLATE_KEY = 'vittrans_bang_ke_kh_template_b64';
const BK_KH_SHEET_NAME = 'BẢNG KÊ';
const BK_KH_HEADER_ROW = 12;        // dòng header bảng kê (A12:XFD12)
const BK_KH_DATA_START_ROW = 13;    // dòng dữ liệu đầu tiên
const BK_KH_DATA_LAST_ROW = 100;    // vùng dòng chuẩn bị tới dòng 100; dòng trống sau dữ liệu được loại bỏ
const BK_KH_FOOTER_START_ROW = 29;  // dòng "TỔNG CỘNG" trong file mẫu (sau đó là VAT, THÀNH TIỀN, phần ký tên)
const BK_KH_FOOTER_MERGES = ['A29:H29', 'A30:H30', 'A31:H31', 'C41:D41', 'G41:I41', 'B42:E42', 'F42:J42'];
const BK_KH_PRINT_LAST_ROW = 42;    // vùng in của file mẫu là A1:J42
const BK_KH_HELPER_COLS = [11, 12, 13, 14]; // cột phụ K:N — công thức dòng 13 được chép xuống các dòng dữ liệu
const BK_KH_MAX_ROWS = BK_KH_DATA_LAST_ROW - BK_KH_DATA_START_ROW + 1;

// Cột của bảng kê được đổ theo TÊN HEADER ở dòng 12 của file mẫu (không theo vị trí cột cứng)
const BK_KH_FIELDS = [
  { key: 'stt',      header: 'stt',             value: (o, i) => i + 1 },
  { key: 'ngay',     header: 'ngày',            value: o => bkDateValue(o.ngay_giao_hang) },
  { key: 'diemDi',   header: 'điểm đi',         value: o => o.kho_lay_hang || '' },
  { key: 'diemDen',  header: 'điểm đến',        value: o => o.dia_chi_nhan || '' },
  { key: 'loaiXe',   header: 'loại xe',         value: o => Number(o.tai_trong_xe) || '' },
  { key: 'bks',      header: 'bks',             value: o => o.bks || '' },
  { key: 'cuoc',     header: 'cước vận chuyển', value: o => Number(o.cuoc_ban) || 0 },
  { key: 'phatSinh', header: 'phát sinh',       value: o => Number(o.phat_sinh_ban) || 0 },
  { key: 'tong',     header: 'tổng cộng',       value: null }, // = Cước vận chuyển + Phát sinh (công thức)
  { key: 'ghiChu',   header: 'ghi chú',         value: o => o.ghi_chu || '' }
];

function bkNormHeader(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase(); }
function bkDateValue(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  // ExcelJS ghi ngày theo UTC: dựng Date bằng Date.UTC để ô Excel hiển thị đúng ngày (tránh lệch 1 ngày ở múi giờ UTC+7)
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : '';
}
function bkColLetter(c) {
  let s = '';
  while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}
function bkCloneStyle(s) { return JSON.parse(JSON.stringify(s || {})); }
// Đổi các tham chiếu ô ở dòng fromRow (không khóa $ dòng) sang toRow; bỏ qua phần chữ trong dấu "..."
function bkShiftFormulaRow(f, fromRow, toRow) {
  return String(f).split('"').map((seg, i) => i % 2 ? seg :
    seg.replace(/(?<![A-Za-z0-9_$.])(\$?[A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g,
      (m, colPart, abs, row) => (abs || Number(row) !== fromRow) ? m : colPart + toRow)
  ).join('"');
}
function bkCloneValue(v) {
  if (v == null || typeof v !== 'object' || v instanceof Date) return v;
  return JSON.parse(JSON.stringify(v));
}

/* Dựng file bảng kê từ file mẫu (ExcelJS). Trả về ArrayBuffer của file .xlsx mới. */
async function buildCustomerStatementBuffer(templateBuffer, orders, kh) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);
  const ws = wb.getWorksheet(BK_KH_SHEET_NAME);
  if (!ws) throw new Error('File mẫu không có sheet "' + BK_KH_SHEET_NAME + '"');
  const n = orders.length;
  if (n < 1 || n > BK_KH_MAX_ROWS) throw new Error('Số dòng không hợp lệ: ' + n);

  // 1) Xác định vị trí cột theo header dòng 12
  const col = {};
  for (let c = 1; c <= 15; c++) {
    const h = bkNormHeader(ws.getCell(BK_KH_HEADER_ROW, c).value);
    const f = BK_KH_FIELDS.find(x => x.header === h);
    if (f && !col[f.key]) col[f.key] = c;
  }

  // 2) Chụp lại định dạng của dòng dữ liệu mẫu và toàn bộ phần chân bảng (từ TỔNG CỘNG trở xuống)
  //    Cột A:J lấy định dạng dòng 13; cột nào ở dòng 13 không có viền (vd J13 "Ghi chú" trong file mẫu)
  //    thì lấy định dạng của dòng mẫu đầu tiên bên dưới có viền, để cả cột kẻ khung đồng nhất.
  const bkHasBorder = s => !!(s && s.border && ['left', 'right', 'top', 'bottom'].some(k => s.border[k] && s.border[k].style));
  const dataStyle = {};
  for (let c = 1; c <= 10; c++) {
    let s = ws.getCell(BK_KH_DATA_START_ROW, c).style;
    if (!bkHasBorder(s)) {
      for (let r = BK_KH_DATA_START_ROW + 1; r < BK_KH_FOOTER_START_ROW; r++) {
        const s2 = ws.getCell(r, c).style;
        if (bkHasBorder(s2)) { s = s2; break; }
      }
    }
    dataStyle[c] = bkCloneStyle(s);
  }
  const dataHeight = ws.getRow(BK_KH_DATA_START_ROW).height;
  //    Cột phụ K13:N13: giữ nguyên công thức + định dạng, sẽ chép xuống mọi dòng có dữ liệu
  const helperTpl = BK_KH_HELPER_COLS.map(c => {
    const cell = ws.getCell(BK_KH_DATA_START_ROW, c);
    return { c, style: bkCloneStyle(cell.style), formula: cell.formula || null, value: cell.formula ? null : bkCloneValue(cell.value) };
  });
  const tplLastRow = ws.rowCount;
  const footer = [];
  for (let r = BK_KH_FOOTER_START_ROW; r <= tplLastRow; r++) {
    const cells = [];
    for (let c = 1; c <= 15; c++) {
      const cell = ws.getCell(r, c);
      const isSlave = ExcelJS.ValueType && cell.type === ExcelJS.ValueType.Merge; // ô con của merge
      cells.push({ c, style: bkCloneStyle(cell.style), value: isSlave ? null : bkCloneValue(cell.value) });
    }
    footer.push({ r, height: ws.getRow(r).height, cells });
  }

  // 3) Gỡ merge phần chân, xóa dữ liệu mẫu từ dòng 13 trở xuống (kể cả cột phụ K:O)
  BK_KH_FOOTER_MERGES.forEach(rg => { try { ws.unMergeCells(rg); } catch (e) {} });
  const clearTo = Math.max(tplLastRow, BK_KH_DATA_LAST_ROW);
  for (let r = BK_KH_DATA_START_ROW; r <= clearTo; r++) {
    for (let c = 1; c <= 15; c++) { const cell = ws.getCell(r, c); cell.value = null; cell.style = {}; }
    ws.getRow(r).height = undefined;
  }

  // 4) Đổ dữ liệu từ dòng 13. Các dòng trống còn lại (đến dòng 100) không được đưa vào file:
  //    phần chân bảng được đặt ngay sau dòng dữ liệu cuối cùng.
  const colCuoc = col.cuoc, colPS = col.phatSinh, colTong = col.tong;
  let sumTong = 0;
  orders.forEach((o, idx) => {
    const r = BK_KH_DATA_START_ROW + idx;
    for (let c = 1; c <= 10; c++) ws.getCell(r, c).style = bkCloneStyle(dataStyle[c]);
    ws.getRow(r).height = dataHeight;
    BK_KH_FIELDS.forEach(f => {
      const c = col[f.key];
      if (!c || !f.value) return;
      ws.getCell(r, c).value = f.value(o, idx);
    });
    if (colTong && colCuoc && colPS) {
      const cuoc = Number(o.cuoc_ban) || 0, ps = Number(o.phat_sinh_ban) || 0;
      ws.getCell(r, colTong).value = { formula: `${bkColLetter(colCuoc)}${r}+${bkColLetter(colPS)}${r}`, result: cuoc + ps };
      sumTong += cuoc + ps;
    }
    // Cột phụ K:N — công thức dòng 13 đổi số dòng theo dòng hiện tại (vd C13 → C14), hằng số chép nguyên
    helperTpl.forEach(h => {
      const cell = ws.getCell(r, h.c);
      cell.style = bkCloneStyle(h.style);
      if (h.formula) cell.value = { formula: bkShiftFormulaRow(h.formula, BK_KH_DATA_START_ROW, r) };
      else if (h.value != null) cell.value = bkCloneValue(h.value);
    });
  });
  // Công thức cột phụ không có sẵn kết quả → yêu cầu Excel tính lại toàn bộ khi mở file
  try { wb.calcProperties.fullCalcOnLoad = true; } catch (e) {}

  // 5) Đặt lại phần chân bảng, dịch lên/xuống theo số dòng dữ liệu
  const lastDataRow = BK_KH_DATA_START_ROW + n - 1;
  const offset = (lastDataRow + 1) - BK_KH_FOOTER_START_ROW;
  footer.forEach(fr => {
    const nr = fr.r + offset;
    if (fr.height) ws.getRow(nr).height = fr.height;
    fr.cells.forEach(cd => {
      const cell = ws.getCell(nr, cd.c);
      cell.style = bkCloneStyle(cd.style);
      if (cd.value != null) cell.value = bkCloneValue(cd.value);
    });
  });
  const tongL = colTong ? bkColLetter(colTong) : 'I';
  const rowTotal = BK_KH_FOOTER_START_ROW + offset;   // TỔNG CỘNG
  const rowVat = rowTotal + 1;                         // VAT (8%)
  const rowAmount = rowTotal + 2;                      // THÀNH TIỀN
  const vat = sumTong * 0.08, thanhTien = sumTong + vat;
  if (colTong) {
    ws.getCell(rowTotal, colTong).value = { formula: `SUBTOTAL(9,${tongL}${BK_KH_DATA_START_ROW}:${tongL}${lastDataRow})`, result: sumTong };
    ws.getCell(rowVat, colTong).value = { formula: `${tongL}${rowTotal}*8%`, result: vat };
    ws.getCell(rowAmount, colTong).value = { formula: `SUM(${tongL}${rowTotal}:${tongL}${rowVat})`, result: thanhTien };
  }
  // Dòng "Tổng tiền bằng chữ" (ô D, cùng dòng với nhãn ở C): ghi thẳng chữ (không dùng Sheet3 nữa)
  ws.getCell(33 + offset, 4).value = numberToVietnameseWords(thanhTien);
  BK_KH_FOOTER_MERGES.forEach(rg => {
    ws.mergeCells(rg.replace(/\d+/g, m => String(Number(m) + offset)));
  });
  // ExcelJS tự thêm "$" trước cột: viết "A$1:J$n" để ra tham chiếu tuyệt đối $A$1:$J$n (như file mẫu)
  try { ws.pageSetup.printArea = `A$1:J$${BK_KH_PRINT_LAST_ROW + offset}`; } catch (e) {}

  // 6) Thông tin khách hàng (C7:C10 theo file mẫu, có dấu ":" đứng đầu)
  const setKh = (r, v) => { ws.getCell(r, 3).value = ': ' + (v || ''); };
  setKh(7, kh.ten_kh);
  setKh(8, kh.dia_chi);
  setKh(9, kh.mst);
  setKh(10, kh.pic);

  // 7) Bỏ hẳn mọi sheet khác ngoài BẢNG KÊ (Sheet3 chỉ là sheet phụ đọc số thành chữ, đã thay bằng chữ ghi thẳng).
  //    Ô nào trên BẢNG KÊ còn công thức trỏ sang sheet khác thì đổi thành giá trị tĩnh để không bị #REF!.
  [...wb.worksheets].forEach(sheet => { if (sheet.name !== BK_KH_SHEET_NAME) wb.removeWorksheet(sheet.id); });
  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const f = cell.formula || '';
      if (/!/.test(f)) {
        const res = cell.value && cell.value.result;
        cell.value = (res === undefined || (res && typeof res === 'object')) ? null : res;
      }
    });
  });

  // 8) Dọn các phần ExcelJS không giữ được — nếu để lại, Excel báo "We found a problem with some content":
  //  a) Công thức trỏ tới workbook bên ngoài (vd Sheet3!C17 = [1]DEBIT!#REF!): ExcelJS bỏ phần
  //     externalLink khi ghi nhưng vẫn giữ công thức → đổi các ô đó thành giá trị trống.
  wb.worksheets.forEach(sheet => {
    sheet.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        const f = cell.formula || (cell.value && cell.value.sharedFormula) || '';
        if (/\[\d+\]/.test(f)) cell.value = null;
      });
    });
  });
  //  b) Tên hệ thống _xlnm.* (vd _xlnm._FilterDatabase của bộ lọc header) bị ExcelJS ghi lại thành tên
  //     toàn workbook (mất localSheetId) — Excel không chấp nhận. Bỏ đi; bộ lọc header (autoFilter) vẫn giữ,
  //     vùng in vẫn ghi đúng qua pageSetup.printArea.
  try {
    wb.definedNames.model = wb.definedNames.model.filter(d => !/^_xlnm\./i.test(d.name));
  } catch (e) { console.warn(e); }

  return await wb.xlsx.writeBuffer();
}

async function chooseAndStoreCustomerStatementTemplate() {
  const buffer = await pickExcelFile();
  if (!buffer) return null;
  if (!(await loadExcelJS())) return null;
  try {
    const test = new ExcelJS.Workbook();
    await test.xlsx.load(buffer);
    if (!test.getWorksheet(BK_KH_SHEET_NAME)) {
      showToast(`File này không có sheet "${BK_KH_SHEET_NAME}". Vui lòng chọn đúng file "Mẫu excel tải về".`, 'error');
      return null;
    }
  } catch(e) {
    console.error(e);
    showToast('Không đọc được file Excel này. Vui lòng chọn lại.', 'error');
    return null;
  }
  await TemplateStore.set(BK_KH_TEMPLATE_KEY, arrayBufferToBase64(buffer));
  return buffer;
}

async function exportCustomerStatement() {
  const orders = getFilteredOrders();
  if (!orders.length) { showToast('Không có đơn hàng nào để xuất. Hãy tìm/lọc trước khi xuất.', 'error'); return; }
  const distinctKh = new Set(orders.map(o => o.khach_hang_id || o.khach_hang_name || ''));
  if (distinctKh.size > 1) {
    showToast('Danh sách đang lọc có nhiều hơn 1 khách hàng. Vui lòng gõ tên khách hàng vào ô tìm kiếm để lọc còn 1 khách hàng rồi xuất lại.', 'error');
    return;
  }
  if (orders.length > BK_KH_MAX_ROWS) {
    showToast(`File mẫu chỉ hỗ trợ tối đa ${BK_KH_MAX_ROWS} dòng/lần xuất, danh sách đang lọc có ${orders.length} dòng. Vui lòng lọc bớt rồi xuất lại.`, 'error');
    return;
  }
  const list = orders.slice().sort((a, b) => (a.ngay_giao_hang || '9999').localeCompare(b.ngay_giao_hang || '9999'));
  const first = list[0];
  const kh = customerById(first.khach_hang_id) || { ten_kh: first.khach_hang_name || '' };

  let stored = null;
  stored = await TemplateStore.get(BK_KH_TEMPLATE_KEY);
  let buffer;
  if (stored) {
    try { buffer = base64ToArrayBuffer(stored); } catch(e) { buffer = null; }
  }
  if (!buffer) {
    showToast('Vui lòng chọn file Excel mẫu "Mẫu excel tải về" (có sheet "BẢNG KÊ") — chỉ cần chọn 1 lần.', 'success');
    buffer = await chooseAndStoreCustomerStatementTemplate();
    if (!buffer) return;
  }

  if (!(await loadExcelJS())) return;
  let outBuffer;
  try {
    outBuffer = await buildCustomerStatementBuffer(buffer, list, kh);
  } catch(e) {
    console.error(e);
    showToast('Không xuất được bảng kê. File mẫu đã lưu có thể bị lỗi — vui lòng bấm "Đổi Mẫu Bảng Kê" để chọn lại.', 'error');
    return;
  }
  const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const tenSafe = String(kh.ten_kh || 'Khach hang').replace(/[\\/:*?"<>|]/g, '').trim();
  triggerBlobDownload(blob, `Bang ke khach hang - ${tenSafe} - ${todayISODate()}.xlsx`);
  showToast('Đã xuất bảng kê khách hàng.', 'success');
}

/* ============================================================
   VIEW SWITCHING (Đơn Hàng / Khách Hàng / Nhà Thầu) — driven by sidebar
   ============================================================ */
const VIEW_ORDER = ['orders', 'customers', 'contractors', 'admin'];
function viewAllowed(view) {
  switch (view) {
    case 'orders': return can('orders', 'view');
    case 'customers': return can('customers', 'view');
    case 'contractors': return can('contractors', 'view') || can('reconciliations', 'view');
    case 'admin': return isAdmin();
  }
  return false;
}

// Ghép vào Trang chủ VIT TRANS: ô ở Trang chủ mở thẳng trang/tab bằng địa chỉ
// van-don/index.html?view=orders|customers|contractors|admin&tab=onboarding|reconciliation|documents|leads
// Chỉ áp dụng 1 lần ngay sau khi đăng nhập xong (không có quyền thì showView tự chuyển trang khác).
// Mỗi ô ở Trang chủ mở phần Vận đơn với 1 "phạm vi" (scope): thanh bên CHỈ hiện các mục của ô đó,
// không lặp lại chức năng đã có ô riêng ngoài Trang chủ (Khách hàng, Danh sách Nhà thầu, Quản trị).
//   vandon      → Đơn Hàng                                                [ô "Vận đơn"]
//   customers   → Khách Hàng                                              [ô "Danh sách Khách hàng"]
//   contractors → Nhà Thầu › Hợp Đồng, Bảng Kê, Tài Liệu, Tìm Kiếm        [ô "Quản lý nhà thầu"]
//   admin       → Quản Trị                                                [ô "Hệ thống"]
const SCOPE_NAV = {
  vandon:      ['navBtnOrders'],
  customers:   ['navBtnCustomers'],
  contractors: ['navBtnContractors', 'tabbtn-onboarding', 'tabbtn-reconciliation', 'tabbtn-documents', 'tabbtn-leads'],
  admin:       ['navBtnAdmin']
};
const SCOPE_DEFAULT_VIEW = { vandon: 'orders', customers: 'customers', contractors: 'contractors', admin: 'admin' };
const SCOPE_BRAND = { vandon: 'Vận đơn', customers: 'Danh sách khách hàng', contractors: 'Quản lý nhà thầu', admin: 'Hệ thống' };
let _scope = 'vandon';
function applyScope() {
  // 16/11 — đổi sang 1 thanh menu trên cùng DÙNG CHUNG, luôn hiện đủ mọi mục
  // (chỉ data-perm/quyền thật mới ẩn bớt) — bỏ việc ẩn bớt nav theo "scope"
  // (".scope-off") của thiết kế sidebar-riêng-từng-ô cũ; chỉ còn giữ lại tiêu
  // đề trang theo scope cho đẹp.
  document.title = SCOPE_BRAND[_scope] + ' — VIT TRANS';
}
let _deepLinkDone = false;
function applyDeepLink() {
  if (_deepLinkDone) return;
  _deepLinkDone = true;
  let q;
  try { q = new URLSearchParams(location.search); } catch (e) { q = new URLSearchParams(''); }
  let view = q.get('view'); const tab = q.get('tab');
  const sc = q.get('scope');
  _scope = SCOPE_NAV[sc] ? sc : (view === 'customers' ? 'customers' : view === 'admin' ? 'admin' : view === 'contractors' ? 'contractors' : 'vandon');
  applyScope();
  if (!VIEW_ORDER.includes(view)) view = SCOPE_DEFAULT_VIEW[_scope];
  state.currentView = view;
  if (view === 'contractors' && tab) {
    const btn = document.getElementById('tabbtn-' + tab);
    if (btn && btn.classList.contains('nav-subitem') && !btn.classList.contains('perm-hidden')) activateContractorSubpanel(btn);
  }
}

// Trang không có quyền → chuyển sang trang đầu tiên được phép; không có trang nào → 'none'
// 16/11: BỎ giới hạn theo "_scope" (từ thời mỗi ô Trang chủ chỉ mở 1 phần sidebar
// riêng) — thanh menu trên cùng giờ dùng chung, bấm mục nào trong bất kỳ dropdown
// nào cũng phải chuyển view được, chỉ còn bị chặn bởi quyền thật (viewAllowed).
function showView(view) {
  if (!VIEW_ORDER.includes(view)) view = 'orders';
  if (!viewAllowed(view)) view = VIEW_ORDER.find(viewAllowed) || 'none';
  state.currentView = view;
  if (view === 'contractors') ensureContractorSubpanel();
  document.getElementById('viewOrders').style.display = view === 'orders' ? '' : 'none';
  document.getElementById('viewCustomers').style.display = view === 'customers' ? '' : 'none';
  document.getElementById('viewContractors').style.display = view === 'contractors' ? '' : 'none';
  document.getElementById('viewAdmin').style.display = view === 'admin' ? '' : 'none';
  document.getElementById('viewNoAccess').style.display = view === 'none' ? '' : 'none';
  document.getElementById('navBtnOrders').classList.toggle('active', view === 'orders');
  document.getElementById('navBtnCustomers').classList.toggle('active', view === 'customers');
  document.getElementById('navBtnContractors').classList.toggle('active', view === 'contractors');
  document.getElementById('navBtnAdmin').classList.toggle('active', view === 'admin');
  syncTopNavCurrent(view);

  // Thanh tìm kiếm/lọc trên topbar — chỉ hiện khối đúng với trang đang xem
  document.getElementById('toolbarOrders').style.display = view === 'orders' ? '' : 'none';
  document.getElementById('toolbarCustomers').style.display = view === 'customers' ? '' : 'none';
  document.getElementById('toolbarAdmin').style.display = view === 'admin' ? '' : 'none';
  syncContractorToolbars(view === 'contractors');

  syncAddMenu();

  if (view === 'contractors') prefetchContractorFiles();
  if (view === 'admin') loadAdminData();
}

// Trang Nhà Thầu có 3 tab con (Hợp Đồng / Bảng Kê = hồ sơ nhận / Tài Liệu = hồ sơ gửi),
// mỗi tab một thanh tìm kiếm + lọc riêng trên topbar
const CONTRACTOR_PANEL_TOOLBARS = {
  'panel-onboarding': 'toolbarContractors',
  'panel-reconciliation': 'toolbarReconciliation',
  'panel-documents': 'toolbarDocuments',
  'panel-leads': 'toolbarLeads'
};
// Tiêu đề trang theo tab: Hợp Đồng / Bảng Kê dùng chung tiêu đề, Tài Liệu có tiêu đề riêng
const CONTRACTOR_PAGE_HEAD_DEFAULT = {
  title: 'Quản Lý Nhà Thầu & Đối Soát Thanh Toán',
  desc: 'Chuẩn hóa hồ sơ ký kết hợp đồng nhà thầu vận tải và đối soát bảng kê thanh quyết toán.'
};
const CONTRACTOR_PAGE_HEADS = {
  'panel-documents': {
    title: 'Quản lý tài liệu gửi',
    desc: 'Theo dõi tài liệu gửi khách hàng / nhà thầu và ngày nhận lại.'
  },
  'panel-leads': {
    title: 'Tìm kiếm nhà thầu',
    desc: 'Danh sách nhà thầu tiềm năng — sửa trực tiếp trên bảng, bấm "Lưu" ở cuối dòng.'
  }
};
function syncContractorToolbars(show) {
  const active = document.querySelector('#viewContractors .panel.active');
  Object.entries(CONTRACTOR_PANEL_TOOLBARS).forEach(([panelId, toolbarId]) => {
    document.getElementById(toolbarId).style.display = (show && active && active.id === panelId) ? '' : 'none';
  });
  const head = (active && CONTRACTOR_PAGE_HEADS[active.id]) || CONTRACTOR_PAGE_HEAD_DEFAULT;
  document.getElementById('contractorPageTitle').textContent = head.title;
  document.getElementById('contractorPageDesc').textContent = head.desc;
}
// Phòng chỉ được xem 1 tab thì tự chọn tab đó
function activateContractorSubpanel(btn) {
  document.querySelectorAll('.nav-subitem').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
  document.getElementById(btn.dataset.target).classList.add('active');
  syncContractorToolbars(true);
  syncAddMenu();
}

// Menu "+ Thêm mới" chỉ xổ ra các mục tạo mới của trang/tab đang xem (Đơn Hàng → Tạo Đơn Hàng,
// Khách Hàng → Thêm Khách Hàng, ...). Gắn data-scope cho mục mới để nó hiện đúng trang.
function currentAddScope() {
  if (state.currentView !== 'contractors') return state.currentView;
  const active = document.querySelector('#viewContractors .panel.active');
  return 'contractors:' + (active ? active.id : '');
}
function visibleAddMenuItems() {
  return [...document.querySelectorAll('#addMenuDropdown .doc-menu-item')]
    .filter(el => !el.classList.contains('scope-hidden') && !el.classList.contains('perm-hidden'));
}
function syncAddMenu() {
  const scope = currentAddScope();
  document.querySelectorAll('#addMenuDropdown .doc-menu-item').forEach(el => el.classList.toggle('scope-hidden', el.dataset.scope !== scope));
  const visible = visibleAddMenuItems();
  document.getElementById('addMenu').classList.toggle('perm-hidden', !visible.length);
  document.getElementById('addMenuDropdown').classList.remove('open');
  document.getElementById('btnAddMenuToggle').classList.remove('open');
}
function ensureContractorSubpanel() {
  const active = document.querySelector('.nav-subitem.active');
  if (active && !active.classList.contains('perm-hidden') && !active.classList.contains('scope-off')) return;
  const first = document.querySelector('.nav-subitem:not(.perm-hidden):not(.scope-off)');
  if (first) activateContractorSubpanel(first);
}

/* ============================================================
   THANH MENU TRÊN CÙNG (16/11) — 5 dropdown (Kế hoạch/Vận hành/Đội xe/
   Danh mục/Quản trị), cùng recipe mở/đóng với .doc-menu (addMenu/userMenu)
   đã có sẵn: bấm tab → toggle, click ra ngoài/Escape → đóng, 1 cái mở tại 1
   thời điểm. Panel dùng position:fixed (không phải absolute/top:100%) vì
   #navroot phải overflow-x:auto để 6 tab cuộn ngang trên màn hình hẹp — mà hễ
   overflow-x khác visible thì overflow-y cũng tự thành auto theo, cắt mất
   panel xổ xuống dưới nếu còn absolute trong luồng của #navroot (lỗi gặp khi
   làm bên app Lương, sửa bằng cách tính toạ độ tay qua getBoundingClientRect).
   ============================================================ */
// Tab của nhóm chứa trang đang mở được gạch chân (giống bố cục tham khảo):
// Đơn Hàng nằm trong "Kế hoạch", Khách Hàng + Nhà Thầu trong "Danh mục",
// Quản Trị trong "Quản trị" — khớp đúng TOP_NAV bên app Lương (../app.js).
const VIEW_TOP_TAB = { orders: 'keplan', customers: 'danhmuc', contractors: 'danhmuc', admin: 'quantri' };
function syncTopNavCurrent(view) {
  const cur = VIEW_TOP_TAB[view] || '';
  document.querySelectorAll('#navroot .topnav-tab').forEach(t => t.classList.toggle('current', t.dataset.tab === cur));
}

let openTopNavDD = null;
function closeTopNavDD() {
  if (!openTopNavDD) return;
  const panel = document.getElementById('dd-' + openTopNavDD);
  const trigger = document.querySelector('.topnav-tab[data-dd="' + openTopNavDD + '"]');
  if (panel) panel.hidden = true;
  if (trigger) trigger.classList.remove('open');
  openTopNavDD = null;
}
function toggleTopNavDD(id) {
  if (openTopNavDD === id) { closeTopNavDD(); return; }
  closeTopNavDD();
  const panel = document.getElementById('dd-' + id);
  const trigger = document.querySelector('.topnav-tab[data-dd="' + id + '"]');
  if (!panel || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  panel.hidden = false; // phải hiện trước mới đo được bề rộng thật (offsetWidth)
  // Panel của tab gần mép phải (VD "Quản trị") không được tràn ra ngoài màn
  // hình — ghim theo mép PHẢI của trigger thay vì mép trái khi cần.
  const maxLeft = window.innerWidth - panel.offsetWidth - 8;
  panel.style.left = Math.round(Math.min(rect.left, Math.max(8, maxLeft))) + 'px';
  panel.style.top = Math.round(rect.bottom + 6) + 'px';
  trigger.classList.add('open');
  openTopNavDD = id;
}

/* ============================================================
   EVENT BINDING — ONLY X BUTTON CLOSES MODALS
   ============================================================ */
function bindEvents() {
  document.getElementById('closeCustomerModal').onclick = () => closeModal('customerModalOverlay');
  document.getElementById('closeCustomerModal2').onclick = () => closeModal('customerModalOverlay');
  document.getElementById('closeContractorModal').onclick = () => closeModal('contractorModalOverlay');
  document.getElementById('closeContractorModal2').onclick = () => closeModal('contractorModalOverlay');
  document.getElementById('closeContractorViewModal').onclick = () => closeModal('contractorViewModalOverlay');
  document.getElementById('closeContractorViewModal2').onclick = () => closeModal('contractorViewModalOverlay');
  document.getElementById('closeReconciliationModal').onclick = () => closeModal('reconciliationModalOverlay');
  document.getElementById('closeReconciliationModal2').onclick = () => closeModal('reconciliationModalOverlay');
  document.getElementById('closeReconciliationViewModal').onclick = () => closeModal('reconciliationViewModalOverlay');
  document.getElementById('closeReconciliationViewModal2').onclick = () => closeModal('reconciliationViewModalOverlay');
  document.getElementById('closeReconciliationStatusModal').onclick = () => closeModal('reconciliationStatusModalOverlay');
  document.getElementById('closeReconciliationStatusModal2').onclick = () => closeModal('reconciliationStatusModalOverlay');
  document.getElementById('closeLeadTypesModal').onclick = () => closeModal('leadTypesModalOverlay');
  document.getElementById('closeLeadTypesModal2').onclick = () => closeModal('leadTypesModalOverlay');
  document.getElementById('closeDocumentModal').onclick = () => closeModal('documentModalOverlay');
  document.getElementById('closeDocumentModal2').onclick = () => closeModal('documentModalOverlay');
  document.getElementById('closeDocumentViewModal').onclick = () => closeModal('documentViewModalOverlay');
  document.getElementById('closeDocumentViewModal2').onclick = () => closeModal('documentViewModalOverlay');
  document.getElementById('closeDocumentStatusModal').onclick = () => closeModal('documentStatusModalOverlay');
  document.getElementById('closeDocumentStatusModal2').onclick = () => closeModal('documentStatusModalOverlay');
  document.getElementById('closeOrderModal').onclick = () => closeModal('orderModalOverlay');
  document.getElementById('closeOrderModal2').onclick = () => closeModal('orderModalOverlay');
  document.getElementById('closeSettingsModal').onclick = () => closeModal('settingsModalOverlay');
  document.getElementById('closeSettingsModal2').onclick = () => closeModal('settingsModalOverlay');
  document.getElementById('closeImportSummaryModal').onclick = () => closeModal('importSummaryModalOverlay');
  document.getElementById('closeImportSummaryModal2').onclick = () => closeModal('importSummaryModalOverlay');
  document.getElementById('closeImportPreviewModal').onclick = () => closeModal('importPreviewModalOverlay');
  document.getElementById('closeImportPreviewModal2').onclick = () => closeModal('importPreviewModalOverlay');
  document.getElementById('btnConfirmImportPreview').onclick = async () => {
    const rows = importPreviewRows.filter(importRowIsValid);
    if (!rows.length) return;
    closeModal('importPreviewModalOverlay');
    showToast('Đang nhập dữ liệu...', 'info');
    await commitImportRows(rows);
  };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(o => closeModal(o.id)); });

  // Thanh menu trên cùng — primary navigation (Đơn Hàng / Khách Hàng / Nhà Thầu)
  document.getElementById('navBtnOrders').onclick = () => showView('orders');
  document.getElementById('navBtnCustomers').onclick = () => showView('customers');
  document.getElementById('navBtnContractors').onclick = () => showView('contractors');
  document.getElementById('navBtnAdmin').onclick = () => showView('admin');

  // 4 mục "Nhà cung cấp/Quản lý bảng kê/Quản lý tài liệu/Tìm kiếm nhà thầu" (16/11:
  // trước đây lồng dưới "Nhà Thầu", giờ là 4 dòng riêng trong dropdown "Danh mục")
  // — bấm 1 trong 4 phải TỰ mở view "contractors" trước (showView), vì không
  // còn tab cha "Nhà Thầu" nào được bấm để làm việc đó nữa.
  document.querySelectorAll('.nav-subitem').forEach(btn => {
    btn.addEventListener('click', () => { showView('contractors'); activateContractorSubpanel(btn); });
  });

  document.getElementById('btnNewOrder').onclick = withPerm('orders', 'create', () => { showView('orders'); openOrderForm(null); });

  // Customer form
  document.getElementById('btnSaveCustomer').onclick = saveCustomer;
  document.getElementById('customerForm').onsubmit = e => e.preventDefault();
  document.getElementById('customerSearchInput').oninput = e => renderCustomerTable(e.target.value);
  document.getElementById('btnOpenNewCustomer').onclick = withPerm('customers', 'create', () => openCustomerForm(null));

  // Contractor form (Quản Lý Hợp Đồng)
  document.getElementById('btnOpenNewContractor').onclick = withPerm('contractors', 'create', () => openContractorForm(null));
  document.getElementById('btnSaveContractor').onclick = saveContractor;
  document.getElementById('contractorForm').onsubmit = e => e.preventDefault();
  document.getElementById('contractorSearchInput').oninput = e => renderContractorTable(e.target.value);

  const cfDropzone = document.getElementById('contractorFileDropzone');
  const cfInput = document.getElementById('contractorFileInput');
  cfDropzone.addEventListener('click', () => cfInput.click());
  cfDropzone.addEventListener('dragover', e => { e.preventDefault(); cfDropzone.classList.add('dragover'); });
  cfDropzone.addEventListener('dragleave', () => cfDropzone.classList.remove('dragover'));
  cfDropzone.addEventListener('drop', e => { e.preventDefault(); cfDropzone.classList.remove('dragover'); if (e.dataTransfer && e.dataTransfer.files) handleContractorFiles(e.dataTransfer.files); });
  cfInput.addEventListener('change', e => { handleContractorFiles(e.target.files); e.target.value = ''; });

  // Reconciliation form (Quản Lý Bảng Kê)
  document.getElementById('btnNewReconciliation').onclick = withPerm('reconciliations', 'create', () => openReconciliationForm());
  document.getElementById('btnSaveReconciliation').onclick = saveReconciliation;
  document.getElementById('reconciliationForm').onsubmit = e => e.preventDefault();
  document.getElementById('reconciliationSearchInput').oninput = e => renderReconciliationTable(e.target.value);
  document.getElementById('reconciliationStatusFilter').onchange = () => renderReconciliationTable(document.getElementById('reconciliationSearchInput').value);
  document.getElementById('btnExportReconciliation').onclick = withPerm('reconciliations', 'export', exportReconciliationsToPaymentRequest);
  document.getElementById('btnChangePaymentTemplate').onclick = withPerm('reconciliations', 'export', async () => {
    const buf = await chooseAndStorePaymentTemplate();
    if (buf) showToast('Đã lưu file mẫu mới cho các lần xuất sau.', 'success');
  });
  bindCurrencyInput(document.getElementById('reconGiaTri'), () => {});
  document.getElementById('btnGotoStatusFromView').onclick = () => {
    if (!state.editingReconId || !requirePerm('reconciliations', 'edit')) return;
    closeModal('reconciliationViewModalOverlay');
    openReconStatusModal(state.editingReconId);
  };
  document.getElementById('btnSaveReconStatus').onclick = saveReconStatus;

  // Document form (Quản Lý Tài Liệu — hồ sơ gửi đi)
  document.getElementById('btnNewDocument').onclick = withPerm('reconciliations', 'create', () => {
    showView('contractors');
    activateContractorSubpanel(document.getElementById('tabbtn-documents'));
    openDocumentForm();
  });
  document.getElementById('btnSaveDocument').onclick = saveDocument;
  document.getElementById('documentForm').onsubmit = e => e.preventDefault();
  const rerenderDocuments = () => renderDocumentTable(document.getElementById('documentSearchInput').value);
  document.getElementById('documentSearchInput').oninput = rerenderDocuments;
  document.getElementById('documentStatusFilter').onchange = rerenderDocuments;
  document.getElementById('documentTypeFilter').onchange = () => {
    // Đổi phân loại mà doanh nghiệp đang lọc không thuộc loại đó → bỏ lọc doanh nghiệp
    const type = document.getElementById('documentTypeFilter').value;
    const key = document.getElementById('documentPartnerFilter').value;
    if (type && key && key.indexOf(type + '|') !== 0) documentPartnerFilter.clear();
    else rerenderDocuments();
  };
  document.getElementById('btnGotoDocStatusFromView').onclick = () => {
    if (!state.editingDocId || !requirePerm('reconciliations', 'edit')) return;
    closeModal('documentViewModalOverlay');
    openDocStatusModal(state.editingDocId);
  };
  document.querySelectorAll('input[name="docStatusNew"]').forEach(r => r.addEventListener('change', syncDocStatusDateVisibility));
  document.getElementById('btnSaveDocStatus').onclick = saveDocStatus;

  // Tìm Kiếm Nhà Thầu (bảng sửa trực tiếp)
  bindLeadTableEvents();
  document.getElementById('btnNewLead').onclick = withPerm('contractors', 'create', () => {
    showView('contractors');
    activateContractorSubpanel(document.getElementById('tabbtn-leads'));
    addLeadRow();
  });
  document.getElementById('leadSearchInput').oninput = rerenderLeads;
  document.getElementById('btnLeadTypes').onclick = openLeadTypesModal;
  document.getElementById('leadTypeAddForm').onsubmit = e => { e.preventDefault(); addLeadType(); };
  document.getElementById('leadTypeList').addEventListener('click', e => {
    const b = e.target.closest('[data-del-type]');
    if (b) deleteLeadType(b.dataset.delType);
  });

  // Order form
  document.getElementById('btnSaveOrder').onclick = saveOrder;
  document.getElementById('orderForm').onsubmit = e => e.preventDefault();
  ['orderCuocMua','orderPhatSinhMua','orderCuocBan','orderPhatSinhBan'].forEach(id => bindCurrencyInput(document.getElementById(id), recalcOrderFinancials));

  // Filters
  document.getElementById('searchInput').oninput = debounce(renderDashboard, 200);
  document.getElementById('filterDateFrom').onchange = renderDashboard;
  document.getElementById('filterDateTo').onchange = renderDashboard;
  document.getElementById('btnClearFilters').onclick = () => {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    state.orderColFilters = {};
    state.orderSortKey = 'ngay_giao_hang';
    state.orderSortDir = 'desc';
    updateColFilterButtonIndicators();
    renderDashboard();
  };
  document.querySelectorAll('.th-filter-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key = btn.dataset.filterCol;
      if (activeFilterPopover && btn.classList.contains('active-btn')) { closeColFilterPopover(); return; }
      openColFilterPopover(key, btn);
    });
  });
  document.addEventListener('click', e => {
    if (activeFilterPopover && !activeFilterPopover.contains(e.target) && !e.target.closest('.th-filter-btn')) {
      closeColFilterPopover();
    }
  });

  // Thanh menu trên cùng — 5 dropdown (Kế hoạch/Vận hành/Đội xe/Danh mục/Quản trị)
  document.querySelectorAll('.topnav-tab[data-dd]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); toggleTopNavDD(btn.dataset.dd); };
  });
  document.querySelectorAll('.topnav-dd-menu').forEach(menu => {
    menu.addEventListener('click', e => { if (e.target.closest('.nav-item')) setTimeout(closeTopNavDD, 0); });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.topnav-dd')) closeTopNavDD(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTopNavDD(); });

  // Menu "+ Thêm mới" — chỉ chứa mục của trang đang xem (xem syncAddMenu)
  document.getElementById('btnAddMenuToggle').onclick = e => {
    e.stopPropagation();
    document.getElementById('addMenuDropdown').classList.toggle('open');
    document.getElementById('btnAddMenuToggle').classList.toggle('open');
  };
  document.getElementById('addMenuDropdown').addEventListener('click', e => {
    if (e.target.closest('.doc-menu-item')) {
      document.getElementById('addMenuDropdown').classList.remove('open');
      document.getElementById('btnAddMenuToggle').classList.remove('open');
    }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#addMenu')) {
      document.getElementById('addMenuDropdown').classList.remove('open');
      document.getElementById('btnAddMenuToggle').classList.remove('open');
    }
  });

  // Menu tài liệu (Nhập/Xuất Excel, CSV, Báo cáo, Đổi mẫu) gộp trong 1 nút tròn
  document.getElementById('btnDocMenuToggle').onclick = e => {
    e.stopPropagation();
    document.getElementById('docMenuDropdown').classList.toggle('open');
    document.getElementById('btnDocMenuToggle').classList.toggle('open');
  };
  document.getElementById('docMenuDropdown').addEventListener('click', e => {
    if (e.target.closest('.doc-menu-item')) {
      document.getElementById('docMenuDropdown').classList.remove('open');
      document.getElementById('btnDocMenuToggle').classList.remove('open');
    }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#docMenu')) {
      document.getElementById('docMenuDropdown').classList.remove('open');
      document.getElementById('btnDocMenuToggle').classList.remove('open');
    }
  });

  // Menu tài liệu ở "Quản Lý Bảng Kê" (Xuất Đề Nghị Thanh Toán, Đổi File Mẫu)
  document.getElementById('btnReconDocMenuToggle').onclick = e => {
    e.stopPropagation();
    document.getElementById('reconDocMenuDropdown').classList.toggle('open');
    document.getElementById('btnReconDocMenuToggle').classList.toggle('open');
  };
  document.getElementById('reconDocMenuDropdown').addEventListener('click', e => {
    if (e.target.closest('.doc-menu-item')) {
      document.getElementById('reconDocMenuDropdown').classList.remove('open');
      document.getElementById('btnReconDocMenuToggle').classList.remove('open');
    }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#reconDocMenu')) {
      document.getElementById('reconDocMenuDropdown').classList.remove('open');
      document.getElementById('btnReconDocMenuToggle').classList.remove('open');
    }
  });

  // Export / Import
  document.getElementById('btnExportCsv').onclick = withPerm('orders', 'export', exportCsv);
  document.getElementById('btnExportProfitLoss').onclick = withPerm('orders', 'export', exportOrdersProfitLossReport);
  document.getElementById('btnChangeProfitLossTemplate').onclick = withPerm('orders', 'export', async () => {
    const buf = await chooseAndStoreProfitLossTemplate();
    if (buf) showToast('Đã lưu file mẫu mới cho các lần xuất sau.', 'success');
  });
  document.getElementById('btnExportCustomerStatement').onclick = withPerm('orders', 'export', exportCustomerStatement);
  document.getElementById('btnChangeCustomerStatementTemplate').onclick = withPerm('orders', 'export', async () => {
    const buf = await chooseAndStoreCustomerStatementTemplate();
    if (buf) showToast('Đã lưu file mẫu bảng kê mới cho các lần xuất sau.', 'success');
  });
  document.getElementById('btnImportExcel').onclick = withPerm('orders', 'create', () => document.getElementById('importFileInput').click());
  document.getElementById('importFileInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast('Đang xử lý file...', 'info');
    await importOrdersFromFile(file);
    e.target.value = '';
  };

  // Settings
  document.getElementById('btnOpenSettings').onclick = () => {
    if (!isAdmin()) return;
    document.getElementById('settingsSupabaseUrl').value = SUPABASE_URL;
    document.getElementById('settingsSupabaseKey').value = (SUPABASE_KEY && SUPABASE_KEY !== 'YOUR_SUPABASE_ANON_KEY') ? SUPABASE_KEY : '';
    openModal('settingsModalOverlay');
  };
  document.getElementById('btnSaveSettings').onclick = async () => {
    if (!isAdmin()) return;
    const k = document.getElementById('settingsSupabaseKey').value.trim();
    k ? localStorage.setItem(LOCAL_KEYS.supabaseKey, k) : localStorage.removeItem(LOCAL_KEYS.supabaseKey);
    closeModal('settingsModalOverlay');
    showToast('Đang kết nối lại...', 'info');
    // Client mới → đọc lại phiên đăng nhập đã lưu rồi tải dữ liệu theo quyền
    await DB.init();
    await bootAuth();
  };

  // Confirm — lỗi trong callback (mất mạng, trùng khóa…) phải báo cho người dùng, không được nuốt/treo modal
  document.getElementById('btnConfirmCancel').onclick = () => closeModal('confirmModalOverlay');
  document.getElementById('btnConfirmOk').onclick = async () => {
    const cb = state.confirmCallback;
    state.confirmCallback = null; closeModal('confirmModalOverlay');
    if (typeof cb !== 'function') return;
    try { await cb(); }
    catch(e) { console.error(e); showToast('Không thực hiện được: ' + friendlyError(e), 'error'); }
  };

  // Đơn hàng: 1 listener ủy quyền cho nút Sửa/Xóa (thay vì gắn lại cho từng dòng mỗi lần render)
  document.getElementById('ordersTableBody').addEventListener('click', e => {
    const edit = e.target.closest('[data-edit-o]');
    if (edit) { openOrderForm(edit.dataset.editO); return; }
    const view = e.target.closest('[data-view-o]');
    if (view) { openOrderForm(view.dataset.viewO, true); return; }
    const dup = e.target.closest('[data-dup-o]');
    if (dup && requirePerm('orders', 'create')) {
      const src = state.orders.find(x => x.id === dup.dataset.dupO);
      if (!src) return;
      askConfirm('Nhân đôi đơn ' + src.bill_vit + '? Sẽ tạo 1 đơn mới giống hệt với Bill VIT mới.',
        () => duplicateOrder(src.id), { okText: 'Nhân đôi', okClass: 'btn-success' });
      return;
    }
    const del = e.target.closest('[data-del-o]');
    if (del && requirePerm('orders', 'delete')) {
      const id = del.dataset.delO;
      askConfirm('Xóa đơn hàng này?', async () => { await DB.deleteOrder(id); await reloadOrders(); showToast('Đã xóa đơn hàng.', 'success'); });
    }
  });

  bindAuthEvents();
  bindAdminEvents();
}

/* ============================================================
   TẢI LẠI / RENDER / REALTIME / KHÔI PHỤC KẾT NỐI
   ============================================================ */
function renderAll() {
  renderDashboard();
  renderCustomerTable(document.getElementById('customerSearchInput').value);
  renderContractorTable(document.getElementById('contractorSearchInput').value);
  renderReconciliationTable(document.getElementById('reconciliationSearchInput').value);
  renderDocumentTable(document.getElementById('documentSearchInput').value);
  rerenderLeads();
}

// Tải lại một số bảng rồi vẽ lại. Mất mạng → giữ nguyên dữ liệu đang hiển thị (không xóa trắng).
async function reloadTables(names) {
  const ok = await DB.loadTables(names);
  renderAll();
  return ok;
}

// Tải lại toàn bộ (dùng cho tự thử lại / quay lại tab). Bỏ qua nếu đang có lượt tải khác chạy.
// Kèm đọc lại quyền của chính mình: Admin vừa đổi phân quyền / khóa tài khoản thì giao diện theo kịp.
async function refreshAll() {
  if (!state.useSupabase || state.refreshing || !state.auth.user) return;
  state.refreshing = true;
  try {
    if (!(await refreshMyAccess())) return;
    await reloadTables(ALL_TABLES);
  }
  finally { state.refreshing = false; }
}

// Realtime: gom (debounce) các sự kiện và chỉ tải lại đúng bảng vừa đổi
const _pendingRealtime = new Set();
let _realtimeTimer = null;
function onRealtimeChange(table) {
  if (state.suppressRealtime > 0) return;
  _pendingRealtime.add(table);
  clearTimeout(_realtimeTimer);
  _realtimeTimer = setTimeout(async () => {
    const tables = [..._pendingRealtime]; _pendingRealtime.clear();
    await reloadTables(tables);
    if (tables.includes('contractors') && state.currentView === 'contractors') prefetchContractorFiles();
  }, 600);
}

// Tải nền cột files của nhà thầu (có thể nặng) để hiện đúng số file; không chặn giao diện
let _prefetchingFiles = false;
async function prefetchContractorFiles() {
  if (_prefetchingFiles || !state.useSupabase) return;
  _prefetchingFiles = true;
  try {
    await DB.loadAllContractorFiles();
    renderContractorTable(document.getElementById('contractorSearchInput').value);
  } catch(e) { console.warn('Tải nền file nhà thầu lỗi:', e && e.message ? e.message : e); }
  finally { _prefetchingFiles = false; }
}

// Máy vừa có mạng lại / quay lại tab: thử kết nối ngay, hoặc làm mới nếu dữ liệu đã cũ > 60s
function bindConnectionRecovery() {
  window.addEventListener('online', () => { if (state.useSupabase && state.cloudOnline === false) refreshAll(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !state.useSupabase || state.loading || !state.auth.user) return;
    if (state.cloudOnline === false || Date.now() - state.lastLoadAt > 60000) refreshAll();
  });
}

function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

/* ============================================================
   ĐĂNG NHẬP & PHÂN QUYỀN
   Bảo mật thật nằm ở RLS trên Supabase (supabase_auth_setup.sql): ẩn nút ở đây chỉ để
   giao diện gọn — gọi thẳng API thì máy chủ vẫn chặn thao tác không có quyền.
   ============================================================ */
const DEPARTMENTS = [
  { code: 'kinh_doanh', name: 'Kinh doanh' },
  { code: 'van_hanh',   name: 'Vận hành' },
  { code: 'ke_toan',    name: 'Kế toán' },
  { code: 'cung_ung',   name: 'Cung ứng' }
];
const PERM_MODULES = [
  { key: 'orders',          name: 'Đơn Hàng' },
  { key: 'customers',       name: 'Khách Hàng' },
  { key: 'contractors',     name: 'Nhà Thầu / Hợp Đồng' },
  { key: 'reconciliations', name: 'Bảng Kê & Tài Liệu' }
];
// Gộp kho với phần mềm Lương lái xe (file gop_kho_1_tao_bang_luong.sql): thêm phân hệ
// "Lương lái xe" + phòng "Nhân sự - Tiền lương". Chỉ bật khi kho ĐÃ chạy file đó (nhận biết
// qua dòng quyền module 'payroll') — chưa chạy thì giữ nguyên 4 phòng × 4 module như cũ,
// tránh lưu phân quyền bị máy chủ từ chối.
const PAYROLL_DEPARTMENT = { code: 'nhan_su', name: 'Nhân sự - Tiền lương' };
const PAYROLL_MODULE = { key: 'payroll', name: 'Lương lái xe' };
function enablePayrollModule() {
  if (!PERM_MODULES.some(m => m.key === PAYROLL_MODULE.key)) PERM_MODULES.push(PAYROLL_MODULE);
  if (!DEPARTMENTS.some(x => x.code === PAYROLL_DEPARTMENT.code)) DEPARTMENTS.push(PAYROLL_DEPARTMENT);
}
const PERM_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];
const PERM_ACTION_LABELS = { view: 'xem', create: 'thêm mới', edit: 'sửa', delete: 'xóa', export: 'xuất file' };
const MIN_PASSWORD_LEN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function deptName(code) { if (code === PAYROLL_DEPARTMENT.code) return PAYROLL_DEPARTMENT.name; const d = DEPARTMENTS.find(x => x.code === code); return d ? d.name : ''; }
function isAdmin() { return !!(state.auth.profile && state.auth.profile.is_admin); }
function can(module, action) {
  if (isAdmin()) return true;
  const p = state.auth.perms[module];
  return !!(p && p[action]);
}
function requirePerm(module, action) {
  if (can(module, action)) return true;
  const m = PERM_MODULES.find(x => x.key === module);
  showToast('Bạn không có quyền ' + PERM_ACTION_LABELS[action] + ' ' + (m ? m.name : module) + '.', 'error');
  return false;
}
function withPerm(module, action, fn) { return (...args) => { if (requirePerm(module, action)) return fn(...args); }; }

function permsFromRows(rows) {
  const perms = {};
  (rows || []).forEach(r => {
    perms[r.module] = { view: !!r.can_view, create: !!r.can_create, edit: !!r.can_edit, delete: !!r.can_delete, export: !!r.can_export };
  });
  return perms;
}

// Profile + quyền phòng ban của tài khoản đang đăng nhập
async function loadMyAccess(userId) {
  const profile = await DB.cloud(c => c.from('profiles').select('*').eq('id', userId).maybeSingle());
  let perms = {};
  if (profile && profile.department && !profile.is_admin) {
    const rows = await DB.cloud(c => c.from('department_permissions').select('*').eq('department', profile.department));
    perms = permsFromRows(rows);
  }
  return { profile, perms };
}

// Lý do không cho vào app (null = hợp lệ)
function accessDeniedReason(profile) {
  if (!profile) return 'Tài khoản chưa có hồ sơ phân quyền — Admin cần chạy file supabase_auth_setup.sql hoặc tạo lại tài khoản trong mục Quản Trị.';
  if (!profile.active) return 'Tài khoản đã bị khóa hoặc chưa được Admin kích hoạt.';
  if (!profile.is_admin && !profile.department) return 'Tài khoản chưa được gán phòng ban — liên hệ Admin.';
  return null;
}

function authErrorMessage(err) {
  const code = String((err && err.code) || '');
  const m = String((err && err.message) || '').toLowerCase();
  if (code === 'invalid_credentials' || m.includes('invalid login credentials')) return 'Sai email hoặc mật khẩu.';
  if (code === 'email_not_confirmed' || m.includes('email not confirmed')) return 'Email chưa được xác nhận — Admin cần tắt "Confirm email" trên Supabase, hoặc đặt lại mật khẩu cho tài khoản này.';
  if (code === 'user_already_exists' || m.includes('already registered')) return 'Email này đã có tài khoản.';
  if (code === 'signup_disabled' || m.includes('signups not allowed')) return 'Supabase đang tắt đăng ký tài khoản mới — bật lại "Allow new users to sign up" trong Authentication.';
  if (code.includes('rate_limit') || m.includes('rate limit')) return 'Supabase giới hạn số lần gửi email — tắt "Confirm email" trong Authentication rồi thử lại.';
  if (code === 'weak_password' || m.includes('password should')) return 'Mật khẩu chưa đủ mạnh theo cấu hình Supabase.';
  if (code === 'same_password' || m.includes('different from the old')) return 'Mật khẩu mới phải khác mật khẩu cũ.';
  if (!err || (!err.status && !err.code)) return 'Không kết nối được máy chủ (mạng chậm hoặc bị ngắt).';
  return err.message || 'lỗi không xác định';
}
function anyErrorMessage(e) { return e && /^Auth/.test(e.name || '') ? authErrorMessage(e) : friendlyError(e); }

function setAuthScreen(mode) { // 'checking' | 'login' | 'ok'
  document.body.classList.toggle('auth-checking', mode === 'checking');
  document.body.classList.toggle('auth-login', mode === 'login');
  document.body.classList.toggle('auth-ok', mode === 'ok');
}
function showLoginError(msg) {
  const el = document.getElementById('loginError');
  el.textContent = msg || '';
  el.classList.toggle('show', !!msg);
}
// Thống nhất (12/11/2026): chỉ còn 1 màn hình đăng nhập — của Trang chủ (../index.html).
// Cần đăng nhập (chưa đăng nhập / hết phiên / đăng xuất / bị khoá…) → chuyển về đó, kèm lý do.
// Mở thẳng file này (không nằm trong thư mục van-don của hệ thống) thì vẫn dùng màn hình cũ.
const HOME_URL = '../index.html';
function showLoginScreen(msg) {
  if (/\/van-don\//.test(location.pathname.replace(/\\/g, '/'))) {
    try { if (msg) sessionStorage.setItem('vittrans_login_msg', msg); } catch (e) {}
    setAuthScreen('checking');
    location.replace(HOME_URL);
    return;
  }
  setAuthScreen('login');
  showLoginError(msg);
  const btn = document.getElementById('btnLogin');
  btn.disabled = false; btn.textContent = 'Đăng Nhập';
  document.getElementById('loginPassword').value = '';
  setTimeout(() => {
    const em = document.getElementById('loginEmail');
    (em.value ? document.getElementById('loginPassword') : em).focus();
  }, 50);
}

async function signOutQuietly() {
  if (!state.supabaseClient) return;
  try { await state.supabaseClient.auth.signOut({ scope: 'local' }); } catch (e) { console.warn('signOut error:', e); }
}

// Xóa sạch dữ liệu đang hiển thị khi đăng xuất (máy dùng chung không lộ dữ liệu phiên trước)
function clearSessionData() {
  DB.unsubscribeRealtime();
  state.auth = { user: null, profile: null, perms: {} };
  ALL_TABLES.forEach(t => { state[t] = []; });
  state.leadDrafts.clear();
  state.profiles = []; state.deptPerms = [];
  state.cloudLoaded = false;
  document.querySelectorAll('.modal-overlay.open').forEach(o => closeModal(o.id));
  renderAll();
}

// Phiên hết hạn / đăng xuất ở tab khác (đã ở màn hình đăng nhập thì giữ nguyên thông báo đang hiện)
function handleSignedOut() {
  if (document.body.classList.contains('auth-login')) return;
  clearSessionData();
  showLoginScreen('Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.');
}

let _authListenerClient = null;
async function bootAuth() {
  setAuthScreen('checking');
  if (!state.useSupabase || !state.supabaseClient) {
    showLoginScreen('Không kết nối được máy chủ dữ liệu (mạng chặn hoặc chưa cấu hình Supabase). Kiểm tra mạng rồi tải lại trang.');
    return;
  }
  const client = state.supabaseClient;
  if (_authListenerClient !== client) {
    _authListenerClient = client;
    // Không gọi supabase ngay trong callback (supabase-js có thể treo khóa phiên) → setTimeout
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' && client === state.supabaseClient) setTimeout(handleSignedOut, 0);
    });
  }
  let session = null;
  try { ({ data: { session } } = await client.auth.getSession()); }
  catch (e) { console.warn('getSession error:', e); }
  if (session && session.user) await startSession(session.user);
  else showLoginScreen();
}

async function startSession(user) {
  let access;
  try { access = await loadMyAccess(user.id); }
  catch (e) {
    console.error(e);
    if (isNetworkError(e)) { showLoginScreen('Không kết nối được máy chủ (mạng chậm hoặc bị ngắt). Tải lại trang để thử lại.'); return false; }
    const missing = e.code === 'PGRST205' || e.code === '42P01';
    await signOutQuietly();
    showLoginScreen(missing ? 'Chưa cài đặt phân quyền trên Supabase — Admin cần chạy file supabase_auth_setup.sql.' : 'Không tải được thông tin tài khoản: ' + friendlyError(e));
    return false;
  }
  const reason = accessDeniedReason(access.profile);
  if (reason) { await signOutQuietly(); showLoginScreen(reason); return false; }

  state.auth = { user, profile: access.profile, perms: access.perms };
  setAuthScreen('ok');
  renderUserChip();
  applyPermissionsUI();
  applyDeepLink();
  showView(state.currentView);
  state.loading = true; renderAll(); updateConnStatusUI();
  await DB.loadTables(ALL_TABLES);
  state.loading = false;
  renderAll(); updateConnStatusUI();
  if (state.useSupabase) DB.subscribeRealtime(onRealtimeChange);
  return true;
}

// Đọc lại quyền khi làm mới: bị khóa → đăng xuất; quyền đổi → vẽ lại menu/nút
async function refreshMyAccess() {
  const user = state.auth.user;
  if (!user) return false;
  let access;
  try { access = await loadMyAccess(user.id); }
  catch (e) { return true; } // mạng chập chờn: giữ quyền đang có, lần sau thử lại
  const reason = accessDeniedReason(access.profile);
  if (reason) { clearSessionData(); await signOutQuietly(); showLoginScreen(reason); return false; }
  const changed = JSON.stringify([access.profile, access.perms]) !== JSON.stringify([state.auth.profile, state.auth.perms]);
  state.auth.profile = access.profile; state.auth.perms = access.perms;
  if (changed) { renderUserChip(); applyPermissionsUI(); showView(state.currentView); }
  return true;
}

async function doLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { showLoginError('Vui lòng nhập email và mật khẩu.'); return; }
  if (!state.useSupabase || !state.supabaseClient) { showLoginError('Không kết nối được máy chủ dữ liệu — kiểm tra mạng rồi tải lại trang.'); return; }
  const btn = document.getElementById('btnLogin');
  btn.disabled = true; btn.textContent = 'Đang đăng nhập…'; showLoginError('');
  try {
    const { data, error } = await state.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await startSession(data.user); // bị từ chối → startSession tự hiện lý do trên màn hình đăng nhập
  } catch (err) {
    console.warn('Login error:', err);
    showLoginError(authErrorMessage(err));
  } finally {
    btn.disabled = false; btn.textContent = 'Đăng Nhập';
  }
}

async function doLogout() {
  clearSessionData();
  await signOutQuietly();
  showLoginScreen();
}

function renderUserChip() {
  const p = state.auth.profile || {};
  const name = p.full_name || p.email || '';
  const words = String(p.full_name || (p.email || '').split('@')[0] || '?').trim().split(/\s+/);
  document.getElementById('userChipAvatar').textContent = (words.length > 1 ? words.slice(-2).map(w => w[0]).join('') : words[0].slice(0, 2)).toUpperCase();
  document.getElementById('userChipName').textContent = name;
  // Giống phần Lương: "email · vai trò"
  document.getElementById('userChipDept').textContent = (p.email ? p.email + ' · ' : '') + (p.is_admin ? 'Admin' : (deptName(p.department) || 'Chưa phân phòng'));
  document.getElementById('userMenuName').textContent = name;
  document.getElementById('userMenuEmail').textContent = p.email || '';
  const rb = document.getElementById('userMenuRole');
  rb.textContent = p.is_admin ? 'Admin — toàn quyền' : 'Phòng ' + (deptName(p.department) || '—');
  rb.className = 'role-badge' + (p.is_admin ? ' admin' : '');
}

// data-perm="module.action" (nhiều điều kiện nối bằng |, hoặc "admin") → ẩn khi không đủ quyền
function permSpecAllowed(spec) {
  return spec.split('|').some(s => s === 'admin' ? isAdmin() : can(...s.split('.')));
}
function applyPermissionsUI() {
  document.querySelectorAll('[data-perm]').forEach(el => el.classList.toggle('perm-hidden', !permSpecAllowed(el.dataset.perm)));
  // Menu thả xuống không còn mục nào → ẩn luôn nút mở menu
  ['docMenu', 'reconDocMenu'].forEach(id => {
    const menu = document.getElementById(id);
    menu.classList.toggle('perm-hidden', !menu.querySelector('.doc-menu-item:not(.perm-hidden)'));
  });
  syncAddMenu();
}

/* ---- Đổi mật khẩu (của mình) / Admin đặt lại mật khẩu (người khác) ---- */
function openPasswordModal(targetId) {
  const self = !targetId || (state.auth.user && targetId === state.auth.user.id);
  if (!self && !isAdmin()) return;
  state.passwordTargetId = self ? null : targetId;
  document.getElementById('passwordForm').reset();
  const p = self ? state.auth.profile : state.profiles.find(x => x.id === targetId);
  const email = escHtml(p ? p.email : '');
  document.getElementById('passwordModalTitle').textContent = self ? 'Đổi Mật Khẩu' : 'Đặt Lại Mật Khẩu';
  document.getElementById('passwordModalSummary').innerHTML = self
    ? `Tài khoản <strong>${email}</strong>`
    : `Đặt mật khẩu mới cho <strong>${email}</strong> — gửi mật khẩu này cho nhân viên.`;
  openModal('passwordModalOverlay');
  setTimeout(() => document.getElementById('newPassword').focus(), 50);
}

async function savePassword() {
  const pw = document.getElementById('newPassword').value;
  const pw2 = document.getElementById('newPassword2').value;
  if (pw.length < MIN_PASSWORD_LEN) { showToast('Mật khẩu tối thiểu ' + MIN_PASSWORD_LEN + ' ký tự.', 'error'); return; }
  if (pw !== pw2) { showToast('Hai mật khẩu nhập không khớp.', 'error'); return; }
  const btn = document.getElementById('btnSavePassword');
  btn.disabled = true;
  try {
    if (state.passwordTargetId) {
      if (!isAdmin()) return;
      await DB.cloud(c => c.rpc('admin_set_password', { p_user_id: state.passwordTargetId, p_password: pw }));
    } else {
      const { error } = await state.supabaseClient.auth.updateUser({ password: pw });
      if (error) throw error;
    }
    closeModal('passwordModalOverlay');
    showToast('Đã lưu mật khẩu mới.', 'success');
  } catch (e) { console.error(e); showToast('Lỗi khi đổi mật khẩu: ' + anyErrorMessage(e), 'error'); }
  finally { btn.disabled = false; }
}

function bindAuthEvents() {
  document.getElementById('loginForm').addEventListener('submit', doLogin);
  document.getElementById('btnToggleLoginPassword').onclick = () => {
    const input = document.getElementById('loginPassword');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    document.getElementById('btnToggleLoginPassword').classList.toggle('on', show);
  };
  document.getElementById('btnLogout').onclick = doLogout;
  document.getElementById('btnChangeMyPassword').onclick = () => openPasswordModal(null);
  document.getElementById('closePasswordModal').onclick = () => closeModal('passwordModalOverlay');
  document.getElementById('closePasswordModal2').onclick = () => closeModal('passwordModalOverlay');
  document.getElementById('btnSavePassword').onclick = savePassword;
  document.getElementById('passwordForm').onsubmit = e => { e.preventDefault(); savePassword(); };

  // Menu tài khoản (tên, phòng ban, đổi mật khẩu, đăng xuất)
  const closeUserMenu = () => {
    document.getElementById('userMenuDropdown').classList.remove('open');
    document.getElementById('btnUserMenuToggle').classList.remove('open');
  };
  document.getElementById('btnUserMenuToggle').onclick = e => {
    e.stopPropagation();
    document.getElementById('userMenuDropdown').classList.toggle('open');
    document.getElementById('btnUserMenuToggle').classList.toggle('open');
  };
  document.getElementById('userMenuDropdown').addEventListener('click', e => { if (e.target.closest('.doc-menu-item')) closeUserMenu(); });
  document.addEventListener('click', e => { if (!e.target.closest('#userMenu')) closeUserMenu(); });
}

/* ============================================================
   QUẢN TRỊ — tài khoản & ma trận phân quyền (chỉ Admin)
   ============================================================ */
let _adminLoading = false;
async function loadAdminData() {
  if (!isAdmin() || _adminLoading || !state.useSupabase) return;
  _adminLoading = true;
  try {
    const [profiles, perms] = await Promise.all([
      DB.cloud(c => c.from('profiles').select('*').order('created_at', { ascending: true })),
      DB.cloud(c => c.from('department_permissions').select('*'))
    ]);
    state.profiles = profiles || [];
    state.deptPerms = perms || [];
    if (state.deptPerms.some(r => r.module === PAYROLL_MODULE.key)) enablePayrollModule();
  } catch (e) { console.error(e); showToast('Không tải được dữ liệu quản trị: ' + friendlyError(e), 'error'); }
  finally { _adminLoading = false; }
  renderUserTable(document.getElementById('userSearchInput').value);
  renderPermTable();
}

function isProtectedAccount(p) {
  return !!p && ((state.auth.user && p.id === state.auth.user.id) || (p.email || '').toLowerCase() === ADMIN_EMAIL);
}

function userStatusBadge(p) {
  if (p.active) return '<span class="role-badge active">Hoạt động</span>';
  return (p.department || p.is_admin) ? '<span class="role-badge locked">Đã khóa</span>' : '<span class="role-badge pending">Chờ duyệt</span>';
}

function renderUserTable(q) {
  const tbody = document.getElementById('userTableBody');
  const empty = document.getElementById('userEmptyState');
  let list = state.profiles;
  if (q) {
    const lq = q.toLowerCase();
    list = list.filter(p => (p.email||'').toLowerCase().includes(lq) || (p.full_name||'').toLowerCase().includes(lq) || deptName(p.department).toLowerCase().includes(lq));
  }
  if (!list.length) { tbody.innerHTML = ''; empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  const myId = state.auth.user && state.auth.user.id;
  tbody.innerHTML = list.map(p => `
    <tr>
      <td class="cell-bill">${escHtml(p.email)}${p.id === myId ? ' <span class="cell-muted">(bạn)</span>' : ''}</td>
      <td>${escHtml(p.full_name || '—')}</td>
      <td>${escHtml(deptName(p.department) || '—')}</td>
      <td>${p.is_admin ? '<span class="role-badge admin">Admin</span>' : '<span class="role-badge">Nhân viên</span>'}</td>
      <td>${userStatusBadge(p)}</td>
      <td class="row-actions"><div class="actions-inner">
        <button class="btn-icon-sm" data-edit-u="${p.id}" title="Sửa / Khóa tài khoản">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <button class="btn-icon-sm" data-pw-u="${p.id}" title="Đặt lại mật khẩu">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </button>
        ${isProtectedAccount(p) ? '' : `<button class="btn-icon-sm danger" data-del-u="${p.id}" title="Xóa tài khoản">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>
        </button>`}
      </div></td>
    </tr>`).join('');
}

function permCheckbox(dept, mod, act) {
  return document.querySelector(`#permTableBody input[data-dept="${dept}"][data-mod="${mod}"][data-act="${act}"]`);
}
function renderPermTable() {
  const byKey = new Map(state.deptPerms.map(r => [r.department + '|' + r.module, r]));
  document.getElementById('permTableBody').innerHTML = DEPARTMENTS.map(d => PERM_MODULES.map((m, i) => {
    const r = byKey.get(d.code + '|' + m.key) || {};
    return `<tr class="${i === 0 ? 'dept-first' : ''}">
      ${i === 0 ? `<td class="dept-cell" rowspan="${PERM_MODULES.length}">${escHtml(d.name)}</td>` : ''}
      <td>${escHtml(m.name)}</td>
      ${PERM_ACTIONS.map(a => `<td class="text-center"><input type="checkbox" data-dept="${d.code}" data-mod="${m.key}" data-act="${a}"${r['can_' + a] ? ' checked' : ''} aria-label="${escHtml(d.name + ' — ' + m.name + ' — ' + PERM_ACTION_LABELS[a])}"></td>`).join('')}
    </tr>`;
  }).join('')).join('');
}

async function savePermissions() {
  if (!isAdmin()) return;
  const rows = [];
  DEPARTMENTS.forEach(d => PERM_MODULES.forEach(m => {
    const row = { department: d.code, module: m.key };
    PERM_ACTIONS.forEach(a => { const cb = permCheckbox(d.code, m.key, a); row['can_' + a] = !!(cb && cb.checked); });
    rows.push(row);
  }));
  const btn = document.getElementById('btnSavePermissions');
  btn.disabled = true;
  try {
    await DB.cloud(c => c.from('department_permissions').upsert(rows, { onConflict: 'department,module' }));
    state.deptPerms = rows;
    showToast('Đã lưu phân quyền phòng ban.', 'success');
  } catch (e) { console.error(e); showToast('Lỗi khi lưu phân quyền: ' + friendlyError(e), 'error'); }
  finally { btn.disabled = false; }
}

function openUserForm(id) {
  if (!isAdmin()) return;
  const p = id ? state.profiles.find(x => x.id === id) : null;
  if (id && !p) return;
  document.getElementById('userForm').reset();
  state.editingUserId = p ? p.id : null;
  const email = document.getElementById('userEmail');
  email.value = p ? p.email : '';
  email.readOnly = !!p; email.classList.toggle('input-readonly', !!p);
  document.getElementById('userFullName').value = p ? (p.full_name || '') : '';
  const sel = document.getElementById('userDepartment');
  sel.innerHTML = '<option value="">— Chưa gán phòng ban —</option>' + DEPARTMENTS.map(d => `<option value="${d.code}">${escHtml(d.name)}</option>`).join('');
  sel.value = p ? (p.department || '') : '';
  document.getElementById('userIsAdmin').checked = !!(p && p.is_admin);
  document.getElementById('userActive').checked = p ? !!p.active : true;
  document.getElementById('userPasswordGroup').style.display = p ? 'none' : '';
  document.getElementById('userActiveGroup').style.display = p ? '' : 'none';
  // Không tự hạ quyền / tự khóa chính mình, không đụng Admin gốc → tránh mất quyền quản trị
  const locked = isProtectedAccount(p);
  document.getElementById('userIsAdmin').disabled = locked;
  document.getElementById('userActive').disabled = locked;
  document.getElementById('userModalTitle').textContent = p ? 'Sửa Tài Khoản' : 'Thêm Tài Khoản';
  openModal('userModalOverlay');
}

// Client phụ không lưu phiên: signUp tài khoản mới KHÔNG làm Admin bị đổi phiên đăng nhập
let _signupClient = null, _signupClientKey = null;
function signupClient() {
  if (!_signupClient || _signupClientKey !== SUPABASE_KEY) {
    _signupClientKey = SUPABASE_KEY;
    _signupClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { fetch: resilientFetch },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'vittrans-signup' }
    });
  }
  return _signupClient;
}

async function adminCreateUser(email, password, fullName, department, adminFlag) {
  // 1) Lời mời: trigger handle_new_user đọc để gán phòng ban/vai trò ngay khi tài khoản được tạo
  await DB.cloud(c => c.from('user_invites').upsert({ email, full_name: fullName, department, is_admin: adminFlag }));
  let user;
  try {
    const { data, error } = await signupClient().auth.signUp({ email, password });
    if (error) throw error;
    user = data && data.user;
    // Email đã tồn tại (khi bật Confirm email): Supabase trả user "giả" không có identities
    if (!user || (Array.isArray(user.identities) && user.identities.length === 0)) {
      const dup = new Error('User already registered'); dup.name = 'AuthApiError'; throw dup;
    }
  } catch (e) {
    try { await DB.cloud(c => c.from('user_invites').delete().eq('email', email)); } catch (e2) { console.warn(e2); }
    throw e;
  }
  // 2) Ghi chắc profile đúng thông tin (phòng khi trigger chưa cài)
  await DB.cloud(c => c.from('profiles').upsert({ id: user.id, email, full_name: fullName, department, is_admin: adminFlag, active: true }));
}

async function saveUser() {
  if (!isAdmin()) return;
  const fullName = document.getElementById('userFullName').value.trim();
  const department = document.getElementById('userDepartment').value || null;
  const adminChk = document.getElementById('userIsAdmin');
  const activeChk = document.getElementById('userActive');
  if (!fullName) { showToast('Vui lòng nhập Họ Tên.', 'error'); return; }
  if (!adminChk.checked && !department) { showToast('Vui lòng chọn phòng ban (hoặc tick Quyền Admin).', 'error'); return; }
  const btn = document.getElementById('btnSaveUser');
  btn.disabled = true;
  try {
    if (state.editingUserId) {
      const upd = { full_name: fullName, department };
      if (!adminChk.disabled) upd.is_admin = adminChk.checked;
      if (!activeChk.disabled) upd.active = activeChk.checked;
      await DB.cloud(c => c.from('profiles').update(upd).eq('id', state.editingUserId));
      showToast('Đã cập nhật tài khoản.', 'success');
    } else {
      const email = document.getElementById('userEmail').value.trim().toLowerCase();
      const password = document.getElementById('userPassword').value;
      if (!EMAIL_RE.test(email)) { showToast('Email không hợp lệ.', 'error'); return; }
      if (password.length < MIN_PASSWORD_LEN) { showToast('Mật khẩu tối thiểu ' + MIN_PASSWORD_LEN + ' ký tự.', 'error'); return; }
      if (state.profiles.some(p => (p.email || '').toLowerCase() === email)) { showToast('Email này đã có tài khoản.', 'error'); return; }
      await adminCreateUser(email, password, fullName, department, adminChk.checked);
      showToast('Đã tạo tài khoản ' + email + '.', 'success');
    }
    closeModal('userModalOverlay');
    await loadAdminData();
  } catch (e) { console.error(e); showToast('Lỗi khi lưu tài khoản: ' + anyErrorMessage(e), 'error'); }
  finally { btn.disabled = false; }
}

function bindAdminEvents() {
  document.getElementById('btnNewUser').onclick = () => openUserForm(null);
  document.getElementById('btnNewUser2').onclick = () => openUserForm(null);
  document.getElementById('closeUserModal').onclick = () => closeModal('userModalOverlay');
  document.getElementById('closeUserModal2').onclick = () => closeModal('userModalOverlay');
  document.getElementById('btnSaveUser').onclick = saveUser;
  document.getElementById('userForm').onsubmit = e => e.preventDefault();
  document.getElementById('userSearchInput').oninput = e => renderUserTable(e.target.value);
  document.getElementById('btnSavePermissions').onclick = savePermissions;

  document.getElementById('userTableBody').addEventListener('click', e => {
    const edit = e.target.closest('[data-edit-u]');
    if (edit) { openUserForm(edit.dataset.editU); return; }
    const pw = e.target.closest('[data-pw-u]');
    if (pw) { openPasswordModal(pw.dataset.pwU); return; }
    const del = e.target.closest('[data-del-u]');
    if (del) {
      const p = state.profiles.find(x => x.id === del.dataset.delU);
      if (!p || isProtectedAccount(p)) return;
      askConfirm('Xóa hẳn tài khoản ' + p.email + '? (Chỉ muốn tạm ngưng thì bấm Sửa → bỏ tick "Đang hoạt động".)', async () => {
        await DB.cloud(c => c.rpc('admin_delete_user', { p_user_id: p.id }));
        await loadAdminData();
        showToast('Đã xóa tài khoản.', 'success');
      });
    }
  });

  // Quyền Thêm/Sửa/Xóa/Xuất cần quyền Xem đi kèm; bỏ Xem thì bỏ hết
  document.getElementById('permTableBody').addEventListener('change', e => {
    const cb = e.target;
    if (!cb.matches('input[type="checkbox"]')) return;
    const { dept, mod, act } = cb.dataset;
    if (act === 'view' && !cb.checked) PERM_ACTIONS.forEach(a => { if (a !== 'view') permCheckbox(dept, mod, a).checked = false; });
    if (act !== 'view' && cb.checked) permCheckbox(dept, mod, 'view').checked = true;
  });
}

/* ============================================================
   INIT
   ============================================================ */
async function initApp() {
  bindEvents();
  initLocationDropdowns();
  initOrderContractorCombobox();
  initOrderCustomerCombobox();
  initReconContractorCombobox();
  initDocPartnerCombobox();
  initReconContractorFilter();
  initDocumentPartnerFilter();
  initLeadFilters();
  bindConnectionRecovery();
  await DB.init();
  // Chỉ tải dữ liệu sau khi đăng nhập thành công (xem startSession)
  await bootAuth();
  // Khi đã rảnh: nạp sẵn thư viện Excel để lần nhập/xuất đầu tiên không phải chờ
  setTimeout(() => { loadLib('exceljs'); loadLib('xlsx'); }, 3000);
}

document.addEventListener('DOMContentLoaded', initApp);
