/* =============================================================================
   VIT TRANS ERP — bản desktop (Windows).
   Mở ERP trong 1 cửa sổ riêng, không cần trình duyệt, không cần cài Python.
   Các file giao diện (index.html, app.js, styles.css, van-don/...) đọc từ thư
   mục "web" nằm CẠNH file VIT-TRANS-ERP.exe — bản mới tự tải từ GitHub (xem
   TỰ CẬP NHẬT bên dưới), hoặc chép đè file mới vào thư mục "web" rồi bấm F5.
   Dữ liệu vẫn lấy từ kho chung Supabase qua mạng, y như bản web.
   ============================================================================= */
'use strict';
const { app, BrowserWindow, Menu, protocol, shell, dialog, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SCHEME = 'vittrans';
const HOST = 'app';
const ORIGIN = SCHEME + '://' + HOST;
const HOME_URL = ORIGIN + '/index.html';
const APP_TITLE = 'VIT TRANS ERP';

app.setName('VIT-TRANS-ERP'); // thư mục lưu đăng nhập: %APPDATA%\VIT-TRANS-ERP

// Thư mục chứa file giao diện. Bản đóng gói: thư mục "web" cạnh file .exe.
// Lúc phát triển/chạy thử: biến môi trường VT_WEB_DIR, hoặc ../web.
function webDir(){
  if (process.env.VT_WEB_DIR) return path.resolve(process.env.VT_WEB_DIR);
  if (app.isPackaged) return path.join(path.dirname(process.execPath), 'web');
  return path.resolve(__dirname, '..', 'web');
}
const WEB_DIR = webDir();

const MIME = {
  '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.txt':'text/plain; charset=utf-8', '.md':'text/plain; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
  '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf':'application/pdf', '.wasm':'application/wasm'
};

// Phải khai báo TRƯỚC khi app sẵn sàng: "vittrans://" được coi như 1 trang web
// an toàn (https) để đăng nhập, lưu phiên, gọi Supabase chạy bình thường.
protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}]);

function notFound(){
  return new Response('Không tìm thấy file', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

function serveFile(request){
  let url;
  try { url = new URL(request.url); } catch (e) { return notFound(); }
  if (url.host !== HOST) return notFound();
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { return notFound(); }
  const file = path.normalize(path.join(WEB_DIR, rel));
  // Không cho đọc file nằm ngoài thư mục "web".
  if (file !== WEB_DIR && !file.startsWith(WEB_DIR + path.sep)) return notFound();
  let target = file;
  try {
    const st = fs.statSync(target);
    if (st.isDirectory()) {
      // "van-don" -> "van-don/" để các file đi kèm (script.js...) tìm đúng chỗ.
      if (!url.pathname.endsWith('/')) {
        return new Response(null, { status: 301, headers: { location: ORIGIN + url.pathname + '/' + url.search } });
      }
      target = path.join(target, 'index.html');
    }
  } catch (e) { return notFound(); }
  let body;
  try { body = fs.readFileSync(target); } catch (e) { return notFound(); }
  const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
  return new Response(body, { status: 200, headers: { 'content-type': type, 'cache-control': 'no-cache' } });
}

/* -----------------------------------------------------------------------------
   TỰ CẬP NHẬT GIAO DIỆN TỪ GITHUB (18/11/2026)
   Bản mới được đẩy lên repo công khai bằng Dang_ban_moi.bat: các file giao
   diện + "version.json" (số phiên bản + danh sách file kèm mã SHA-256). Trang
   ERP (update-check.js) gọi 2 địa chỉ nội bộ dưới đây — giống hệt server.py
   của bản web — để hiện dải "Có bản cập nhật mới… [Cập nhật ngay]":
     vittrans://app/api/update-check        → so version.json trên GitHub với máy
     vittrans://app/api/update-apply (POST) → tải đủ mọi file, kiểm SHA-256, chỉ
       khi TẤT CẢ đều khớp mới ghi đè vào thư mục "web" (lỗi giữa chừng thì giữ
       nguyên bản cũ, không để lẫn file cũ/mới).
   ----------------------------------------------------------------------------- */
const UPDATE_BASE = 'https://raw.githubusercontent.com/MiesSw/VIT-TRANS-LuongLaiXe/main/';
const VERSION_FILE = 'version.json';

function localVersion(){
  try { return JSON.parse(fs.readFileSync(path.join(WEB_DIR, VERSION_FILE), 'utf8')); } catch (e) { return null; }
}
function insideWeb(rel){
  const f = path.normalize(path.join(WEB_DIR, rel));
  return f.startsWith(WEB_DIR + path.sep) ? f : null;
}
// Thêm tham số ?t= / ?v= để không bị bộ nhớ đệm của GitHub trả bản cũ.
async function fetchRemoteManifest(){
  const res = await net.fetch(UPDATE_BASE + VERSION_FILE + '?t=' + Date.now());
  if (!res.ok) throw new Error('Không đọc được thông tin bản mới trên GitHub (HTTP ' + res.status + ').');
  const m = await res.json();
  if (!m || typeof m.version !== 'string' || !Array.isArray(m.files)) throw new Error('File version.json trên GitHub không hợp lệ.');
  return m;
}
async function updateCheck(){
  const remote = await fetchRemoteManifest();
  const local = localVersion();
  return {
    ok: true,
    updateAvailable: !local || local.version !== remote.version,
    local: local ? { version: local.version } : null,
    remote: { version: remote.version, message: remote.message || '' }
  };
}
let updating = false;
async function updateApply(){
  if (updating) throw new Error('Đang cập nhật, chờ chút.');
  updating = true;
  try {
    const m = await fetchRemoteManifest();
    const downloaded = [];
    for (const f of m.files) {
      const dest = f && typeof f.path === 'string' ? insideWeb(f.path) : null;
      if (!dest || path.basename(dest) === VERSION_FILE) throw new Error('Đường dẫn file không hợp lệ: ' + (f && f.path));
      const url = UPDATE_BASE + f.path.split('/').map(encodeURIComponent).join('/') + '?v=' + encodeURIComponent(m.version);
      const res = await net.fetch(url);
      if (!res.ok) throw new Error('Tải ' + f.path + ' lỗi (HTTP ' + res.status + ').');
      const buf = Buffer.from(await res.arrayBuffer());
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      if (hash !== f.sha256) throw new Error('File ' + f.path + ' tải về chưa khớp bản mới (GitHub có thể đang làm mới bộ nhớ đệm) — đợi vài phút rồi bấm lại.');
      downloaded.push([dest, buf]);
    }
    for (const [dest, buf] of downloaded) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest + '.tmp', buf);
      fs.renameSync(dest + '.tmp', dest);
    }
    fs.writeFileSync(path.join(WEB_DIR, VERSION_FILE), JSON.stringify(m, null, 2));
    return { ok: true, version: m.version };
  } finally {
    updating = false;
  }
}
async function jsonResponse(promise){
  let data;
  try { data = await promise; } catch (e) { data = { ok: false, error: (e && e.message) || String(e) }; }
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
function handleRequest(request){
  let url;
  try { url = new URL(request.url); } catch (e) { return notFound(); }
  if (url.host === HOST && url.pathname === '/api/update-check') return jsonResponse(updateCheck());
  if (url.host === HOST && url.pathname === '/api/update-apply' && request.method === 'POST') return jsonResponse(updateApply());
  return serveFile(request);
}

function isOwnUrl(u){ return typeof u === 'string' && u.startsWith(ORIGIN + '/'); }
function isWebUrl(u){ return /^(https?:|mailto:|tel:)/i.test(u || ''); }

let mainWindow = null;

function setupContents(contents){
  // Link ra ngoài (Google Sheet, trang web khác...) mở bằng trình duyệt của máy.
  // Cửa sổ con của chính ERP (xem trước bản in, file tạm blob:...) mở trong phần mềm.
  contents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true, icon: iconPath(),
        webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false }
      }
    };
  });
  contents.on('will-navigate', (e, url) => {
    if (isOwnUrl(url)) return;
    if (isWebUrl(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  // Trang đang có dữ liệu chưa lưu mà hỏi "rời trang?" -> hỏi lại bằng hộp thoại.
  contents.on('will-prevent-unload', (e) => {
    const win = BrowserWindow.fromWebContents(contents);
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Vẫn rời đi', 'Ở lại'], defaultId: 1, cancelId: 1,
      title: APP_TITLE, message: 'Có thể còn dữ liệu chưa lưu. Anh có chắc muốn rời trang này?'
    });
    if (choice === 0) e.preventDefault();
  });
  // Ctrl + lăn chuột: phóng to / thu nhỏ. Electron chỉ báo sự kiện chứ không
  // tự đổi cỡ nên phải tự làm — cùng bước 0.5 như Ctrl+= / Ctrl+- ở menu Xem.
  contents.on('zoom-changed', (e, dir) => {
    const lvl = contents.getZoomLevel() + (dir === 'in' ? 0.5 : -0.5);
    contents.setZoomLevel(Math.max(-3, Math.min(5, lvl)));
  });
  // Chuột phải: Cắt / Sao chép / Dán.
  contents.on('context-menu', (e, p) => {
    const f = p.editFlags || {};
    const items = [];
    if (p.isEditable) {
      items.push({ label: 'Hoàn tác', role: 'undo', enabled: f.canUndo });
      items.push({ type: 'separator' });
      items.push({ label: 'Cắt', role: 'cut', enabled: f.canCut });
    }
    if (p.isEditable || (p.selectionText || '').trim()) items.push({ label: 'Sao chép', role: 'copy', enabled: f.canCopy });
    if (p.isEditable) items.push({ label: 'Dán', role: 'paste', enabled: f.canPaste });
    if (p.isEditable || (p.selectionText || '').trim()) items.push({ label: 'Chọn tất cả', role: 'selectAll' });
    if (p.linkURL && isWebUrl(p.linkURL)) {
      if (items.length) items.push({ type: 'separator' });
      items.push({ label: 'Mở link bằng trình duyệt', click: () => shell.openExternal(p.linkURL) });
    }
    if (!items.length) return;
    Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents) });
  });
}

function iconPath(){
  const p = path.join(__dirname, 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}

function buildMenu(){
  const tpl = [
    { label: 'Ứng dụng', submenu: [
      { label: 'Về Trang chủ', accelerator: 'Alt+Home', click: () => mainWindow && mainWindow.loadURL(HOME_URL) },
      { type: 'separator' },
      { label: 'Tải lại', accelerator: 'F5', click: (m, w) => w && w.webContents.reload() },
      { label: 'Tải lại hoàn toàn (sau khi chép bản mới)', accelerator: 'Ctrl+F5', click: (m, w) => w && w.webContents.reloadIgnoringCache() },
      { label: 'Tải lại hoàn toàn', accelerator: 'Ctrl+Shift+R', visible: false, click: (m, w) => w && w.webContents.reloadIgnoringCache() },
      { type: 'separator' },
      { label: 'In trang này…', accelerator: 'Ctrl+P', click: (m, w) => w && w.webContents.print() },
      { label: 'Mở thư mục file giao diện', click: () => shell.openPath(WEB_DIR) },
      { type: 'separator' },
      { label: 'Thoát', role: 'quit', accelerator: 'Alt+F4' }
    ]},
    { label: 'Chỉnh sửa', submenu: [
      { label: 'Hoàn tác', role: 'undo' }, { label: 'Làm lại', role: 'redo' }, { type: 'separator' },
      { label: 'Cắt', role: 'cut' }, { label: 'Sao chép', role: 'copy' }, { label: 'Dán', role: 'paste' },
      { label: 'Chọn tất cả', role: 'selectAll' }
    ]},
    { label: 'Xem', submenu: [
      { label: 'Phóng to', role: 'zoomIn', accelerator: 'Ctrl+=' },
      { label: 'Phóng to', role: 'zoomIn', accelerator: 'Ctrl+Plus', visible: false },
      { label: 'Thu nhỏ', role: 'zoomOut', accelerator: 'Ctrl+-' },
      { label: 'Cỡ chữ gốc', role: 'resetZoom', accelerator: 'Ctrl+0' },
      { type: 'separator' },
      { label: 'Toàn màn hình', role: 'togglefullscreen', accelerator: 'F11' },
      { type: 'separator' },
      { label: 'Công cụ kỹ thuật (để báo lỗi)', role: 'toggleDevTools', accelerator: 'Ctrl+Shift+I' }
    ]},
    { label: 'Trợ giúp', submenu: [
      { label: 'Phiên bản phần mềm', click: () => {
          const v = localVersion();
          dialog.showMessageBox(mainWindow, {
            type: 'info', title: APP_TITLE,
            message: APP_TITLE + ' — bản desktop ' + app.getVersion() + '\nGiao diện: ' + (v ? v.version : 'chưa rõ (chưa cập nhật qua GitHub lần nào)'),
            detail: 'Thư mục file giao diện:\n' + WEB_DIR + '\n\nBản mới tự hiện thông báo "Có bản cập nhật mới… Cập nhật ngay" ở đầu trang (dò mỗi 10 phút).'
          });
        } }
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

function createWindow(){
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 360, minHeight: 500,
    show: false, title: APP_TITLE, icon: iconPath(), autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false }
  });
  mainWindow.once('ready-to-show', () => { mainWindow.maximize(); mainWindow.show(); });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(HOME_URL);
}

// Chỉ mở 1 cửa sổ: bấm đúp lần nữa thì đưa cửa sổ đang mở lên trước.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  });

  app.whenReady().then(() => {
    if (!fs.existsSync(path.join(WEB_DIR, 'index.html'))) {
      dialog.showErrorBox(APP_TITLE,
        'Không tìm thấy file giao diện (index.html) trong thư mục:\n' + WEB_DIR +
        '\n\nHãy để thư mục "web" nằm cạnh file VIT-TRANS-ERP.exe (giải nén đủ cả thư mục).');
      app.quit();
      return;
    }
    protocol.handle(SCHEME, handleRequest);
    // Phòng hờ: nếu Supabase trả về thiếu dòng cho phép gọi từ trang khác
    // thì tự bổ sung, để phần mềm luôn đọc/ghi được kho chung.
    session.defaultSession.webRequest.onHeadersReceived({ urls: ['https://*.supabase.co/*'] }, (d, cb) => {
      const h = d.responseHeaders || {};
      if (!Object.keys(h).some(k => k.toLowerCase() === 'access-control-allow-origin')) h['Access-Control-Allow-Origin'] = ['*'];
      cb({ responseHeaders: h });
    });
    app.on('web-contents-created', (e, contents) => setupContents(contents));
    buildMenu();
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
