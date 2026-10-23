/* =============================================================================
   update-check.js — banner báo "có bản cập nhật mới trên GitHub" + nút bấm
   cập nhật ngay. CHỈ hoạt động khi app đang chạy qua server.py (mở bằng
   Mo_ung_dung.bat, địa chỉ http://127.0.0.1:...). Mở trực tiếp index.html
   (địa chỉ file://) thì file này tự bỏ qua, không hiện gì cả.
   ============================================================================= */
(function(){
  'use strict';
  if(!/^https?:$/.test(location.protocol)) return;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  let applying = false;

  function render(data){
    let el = document.getElementById('update-banner');
    if(!data || !data.ok || !data.updateAvailable){ if(el) el.remove(); return; }
    if(el) return; // đã hiện sẵn rồi, không vẽ lại (khỏi mất focus nút Đóng/Cập nhật)
    el = document.createElement('div');
    el.id = 'update-banner';
    el.className = 'update-banner';
    const note = data.remote && data.remote.message ? ' — ' + esc(data.remote.message) : '';
    el.innerHTML =
      '<span>Có bản cập nhật mới trên GitHub' + note + '.</span>' +
      '<button type="button" id="update-apply-btn">Cập nhật ngay</button>' +
      '<button type="button" id="update-dismiss-btn" title="Đóng" aria-label="Đóng">✕</button>';
    document.body.prepend(el);
    document.getElementById('update-apply-btn').onclick = apply;
    document.getElementById('update-dismiss-btn').onclick = function(){ el.remove(); };
  }

  function check(){
    fetch('/api/update-check').then(r=>r.json()).then(render).catch(function(){});
  }

  function apply(){
    if(applying) return;
    applying = true;
    const btn = document.getElementById('update-apply-btn');
    if(btn){ btn.disabled = true; btn.textContent = 'Đang cập nhật…'; }
    fetch('/api/update-apply', {method:'POST'}).then(r=>r.json()).then(function(res){
      if(res && res.ok){ location.reload(); return; }
      applying = false;
      if(btn){ btn.disabled = false; btn.textContent = 'Cập nhật ngay'; }
      alert('Cập nhật lỗi: ' + (res && res.error || 'không rõ nguyên nhân'));
    }).catch(function(){
      applying = false;
      if(btn){ btn.disabled = false; btn.textContent = 'Cập nhật ngay'; }
      alert('Không gọi được server cục bộ (server.py) để cập nhật.');
    });
  }

  check();
  setInterval(check, 10*60*1000); // tự dò lại mỗi 10 phút
})();
