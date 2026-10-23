# server.py — chạy app "Lương lái xe VIT TRANS" trên máy này qua localhost,
# để có thể tự kiểm tra và tải bản mới nhất từ GitHub ngay trong giao diện.
#
# CHẠY FILE NÀY QUA "Mo_ung_dung.bat" (bấm đúp), không chạy trực tiếp.
#
# Chỉ dùng thư viện có sẵn của Python (không cần cài thêm gì).
import http.server, socketserver, subprocess, json, os, threading, webbrowser

PORT = 5678
ROOT = os.path.dirname(os.path.abspath(__file__))


def run(cmd):
    try:
        out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=30)
        return out.returncode, out.stdout.strip(), out.stderr.strip()
    except Exception as e:
        return 1, '', str(e)


def git_info(ref):
    rc, sha, _ = run(['git', 'rev-parse', ref])
    if rc != 0 or not sha:
        return None
    rc2, log, _ = run(['git', 'log', '-1', '--format=%ci|%s', ref])
    date, msg = (log.split('|', 1) + [''])[:2] if rc2 == 0 and log else ('', '')
    return {'sha': sha[:10], 'date': date[:10], 'message': msg}


def current_branch():
    rc, out, _ = run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
    return out if rc == 0 and out and out != 'HEAD' else 'main'


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/api/update-check':
            branch = current_branch()
            run(['git', 'fetch', 'origin', branch])
            local = git_info('HEAD')
            remote = git_info('origin/' + branch)
            if local is None or remote is None:
                self._json(200, {
                    'ok': False,
                    'error': 'Không đọc được Git ở thư mục này. Kiểm tra máy đã cài Git, thư mục đã kết nối '
                             'tới 1 repo GitHub (git remote), và repo đó đã có ít nhất 1 lần push.',
                })
                return
            self._json(200, {
                'ok': True,
                'updateAvailable': local['sha'] != remote['sha'],
                'local': local,
                'remote': remote,
                'branch': branch,
            })
            return
        super().do_GET()

    def do_POST(self):
        if self.path == '/api/update-apply':
            branch = current_branch()
            rc, _, err = run(['git', 'fetch', 'origin', branch])
            if rc != 0:
                self._json(200, {'ok': False, 'error': err or 'Không tải được bản mới từ GitHub. Kiểm tra mạng.'})
                return
            # Lấy đúng bản mới nhất trên GitHub, bỏ qua mọi sửa tay chưa commit
            # trong các file của app (dữ liệu lương nằm ở trình duyệt/Supabase,
            # không nằm trong các file này, nên không mất dữ liệu).
            rc, _, err = run(['git', 'reset', '--hard', 'origin/' + branch])
            if rc != 0:
                self._json(200, {'ok': False, 'error': err or 'Không áp dụng được bản mới.'})
                return
            self._json(200, {'ok': True})
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, fmt, *args):
        pass  # bớt in log mỗi lần tải trang cho đỡ rối cửa sổ


if __name__ == '__main__':
    with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
        url = 'http://127.0.0.1:%d/index.html' % PORT
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        print('VIT TRANS — Lương lái xe đang chạy tại', url)
        print('Cứ để cửa sổ này mở trong lúc dùng app. Đóng cửa sổ này = tắt app.')
        httpd.serve_forever()
