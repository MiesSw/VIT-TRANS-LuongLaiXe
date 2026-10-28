"""
VIT TRANS — Lương lái xe: server cục bộ để mở app + tự kiểm tra/áp dụng bản mới
từ GitHub (dùng mục "Releases" của repo, KHÔNG cần máy có cài Git).

Chạy trực tiếp bằng Python (python server.py) khi đang phát triển, hoặc được
đóng gói thành 1 file .exe (PyInstaller) để người dùng cuối chạy mà không cần
cài gì thêm.
"""
import http.server
import socketserver
import threading
import webbrowser
import os
import sys
import json
import shutil
import tempfile
import zipfile
import urllib.request

PORT = 5678
APP_ID = 'vit-trans-luonglaixe'

# Tên kho trên GitHub.
REPO = 'MiesSw/VIT-TRANS-LuongLaiXe'
API_LATEST_RELEASE = 'https://api.github.com/repos/%s/releases/latest' % REPO
UPDATE_ASSET_NAME = 'app-content.zip'

# Khi chạy từ file .exe đã đóng gói (PyInstaller --onefile), thư mục chứa các
# file của app là nơi đặt file .exe — KHÔNG phải thư mục tạm PyInstaller giải
# nén ra lúc chạy (sys._MEIPASS), vì mình cần ghi đè file được lâu dài ở đó.
if getattr(sys, 'frozen', False):
    ROOT = os.path.dirname(os.path.abspath(sys.executable))
else:
    ROOT = os.path.dirname(os.path.abspath(__file__))

VERSION_FILE = os.path.join(ROOT, 'version.txt')


def local_version():
    try:
        with open(VERSION_FILE, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception:
        return ''


def http_get_json(url):
    req = urllib.request.Request(
        url,
        headers={
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'VIT-TRANS-LuongLaiXe-updater',
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode('utf-8'))


def get_latest_release():
    data = http_get_json(API_LATEST_RELEASE)
    tag = data.get('tag_name') or ''
    note_src = data.get('body') or data.get('name') or ''
    note = note_src.strip().splitlines()[0] if note_src.strip() else ''
    date = (data.get('published_at') or '')[:10]
    asset_url = None
    for a in data.get('assets', []) or []:
        if a.get('name') == UPDATE_ASSET_NAME:
            asset_url = a.get('browser_download_url')
            break
    return {'tag': tag, 'note': note, 'date': date, 'asset_url': asset_url}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _json(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/whoami':
            # Để bản app khác mở sau biết cổng này đang chạy ĐÚNG app này
            # và ở thư mục nào (xem open_server).
            self._json(200, {'app': APP_ID, 'root': ROOT, 'version': local_version()})
            return
        if self.path == '/api/update-check':
            local = local_version()
            try:
                rel = get_latest_release()
            except Exception as e:
                self._json(200, {
                    'ok': False,
                    'error': 'Không kiểm tra được bản mới trên GitHub (kiểm tra mạng). Chi tiết: %s' % e,
                })
                return
            self._json(200, {
                'ok': True,
                'updateAvailable': bool(rel['tag']) and rel['tag'] != local,
                'local': {'sha': local or '(chưa rõ)', 'date': '', 'message': ''},
                'remote': {'sha': rel['tag'], 'date': rel['date'], 'message': rel['note']},
            })
            return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/update-apply':
            tmp_path = None
            try:
                rel = get_latest_release()
                if not rel['asset_url']:
                    self._json(200, {
                        'ok': False,
                        'error': 'Không tìm thấy gói cập nhật (%s) trong bản phát hành mới nhất.' % UPDATE_ASSET_NAME,
                    })
                    return
                fd, tmp_path = tempfile.mkstemp(suffix='.zip')
                os.close(fd)
                req = urllib.request.Request(
                    rel['asset_url'],
                    headers={'User-Agent': 'VIT-TRANS-LuongLaiXe-updater'},
                )
                with urllib.request.urlopen(req, timeout=60) as r, open(tmp_path, 'wb') as out:
                    shutil.copyfileobj(r, out)
                with zipfile.ZipFile(tmp_path) as z:
                    z.extractall(ROOT)
                self._json(200, {'ok': True})
            except Exception as e:
                self._json(200, {'ok': False, 'error': 'Cập nhật lỗi: %s' % e})
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    try:
                        os.remove(tmp_path)
                    except Exception:
                        pass
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, fmt, *args):
        pass


def notify(msg):
    """In ra cửa sổ đen; bản .exe (không có cửa sổ đen) thì hiện hộp thoại."""
    print(msg)
    if getattr(sys, 'frozen', False) and os.name == 'nt':
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, msg, 'VIT TRANS — Lương lái xe', 0x40)
        except Exception:
            pass


def same_folder(a, b):
    return os.path.normcase(os.path.abspath(a or '')) == os.path.normcase(os.path.abspath(b or ''))


def probe(port):
    """Hỏi chương trình đang chiếm cổng: có phải app này không, ở thư mục nào.
    Trả về dict thông tin / 'old' (app này nhưng bản cũ, chưa có /api/whoami)
    / None (chương trình khác)."""
    base = 'http://127.0.0.1:%d' % port
    try:
        with urllib.request.urlopen(base + '/api/whoami', timeout=2) as r:
            info = json.loads(r.read().decode('utf-8'))
            if info.get('app') == APP_ID:
                return info
    except Exception:
        pass
    try:
        # Bản cũ chưa có /api/whoami: nhận ra qua tiêu đề trang của app.
        with urllib.request.urlopen(base + '/index.html', timeout=2) as r:
            if 'Lương Lái Xe VIT TRANS' in r.read(4096).decode('utf-8', 'ignore'):
                return 'old'
    except Exception:
        pass
    return None


def open_server():
    """Mở server ở cổng PORT. Cổng đang bị chiếm thì:
      - đúng app này, cùng thư mục  -> mở trình duyệt vào cửa sổ đang chạy, không mở thêm;
      - app này nhưng thư mục khác   -> dừng, báo đóng cửa sổ kia (KHÔNG tự đổi cổng: trình
        duyệt lưu đăng nhập/dữ liệu offline riêng theo từng cổng, đổi cổng là thấy trống);
      - chương trình khác            -> mới chuyển sang cổng kế tiếp, kèm cảnh báo.
    Trả về (httpd, port), hoặc (None, mã thoát) khi không mở server mới."""
    try:
        return socketserver.TCPServer(('127.0.0.1', PORT), Handler), PORT
    except OSError:
        pass
    url = 'http://127.0.0.1:%d/index.html' % PORT
    info = probe(PORT)
    if isinstance(info, dict) and same_folder(info.get('root'), ROOT):
        print('App đang mở sẵn ở cửa sổ khác — mở lại trình duyệt vào đó:', url)
        webbrowser.open(url)
        return None, 0
    if info:
        where = info.get('root') if isinstance(info, dict) else '(bản cũ, không rõ thư mục)'
        notify('Đang có 1 cửa sổ app Lương lái xe khác mở sẵn ở thư mục:\n  %s\n\n'
               'Hãy đóng cửa sổ đó (cửa sổ đen "VIT TRANS - Luong lai xe" hoặc file .exe), '
               'rồi mở lại app ở thư mục này:\n  %s' % (where, ROOT))
        return None, 1
    last_error = None
    for port in range(PORT + 1, PORT + 20):
        try:
            httpd = socketserver.TCPServer(('127.0.0.1', port), Handler)
            print('LƯU Ý: cổng %d đang bị 1 chương trình khác dùng — app chạy tạm ở cổng %d.' % (PORT, port))
            print('Ở cổng này trình duyệt sẽ bắt đăng nhập lại; bản offline (không dùng Supabase) sẽ KHÔNG')
            print('thấy dữ liệu đã nhập ở cổng %d. Muốn dùng lại như cũ: tắt chương trình đang chiếm cổng %d.' % (PORT, PORT))
            return httpd, port
        except OSError as e:
            last_error = e
    raise last_error


if __name__ == '__main__':
    httpd, port = open_server()
    if httpd is None:
        sys.exit(port)
    with httpd:
        url = 'http://127.0.0.1:%d/index.html' % port
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        print('VIT TRANS — Lương lái xe đang chạy tại', url)
        print('Thư mục app:', ROOT)
        print('Cứ để cửa sổ này mở trong lúc dùng app. Đóng cửa sổ này = tắt app.')
        httpd.serve_forever()
