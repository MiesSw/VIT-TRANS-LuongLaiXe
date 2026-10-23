/* =============================================================================
   app-moi.js — LỚP GIAO DIỆN MỚI cho index-moi.html
   -----------------------------------------------------------------------------
   KHÔNG chứa logic tính lương / dữ liệu — mọi thứ đó vẫn ở app.js (dùng chung
   với giao diện cũ index.html). File này chỉ:
     1. Vẽ lại menu (danh sách phẳng, icon nét mảnh).
     2. Sau MỖI lần app.js vẽ trang (render), dựng lại phần nội dung theo mẫu:
        - nút ở đầu trang có icon,
        - bộ lọc + bảng gom vào 1 "card danh sách" (tiêu đề + bộ lọc ở đầu card),
        - phân trang ở cuối card (chọn số dòng mỗi trang),
        - cột Sửa/Xoá gom vào nút "⋯".
     3. Thanh trên cùng: tìm kiếm, kỳ lương, nút thao tác của trang, chuông, người dùng.
     4. Thẻ trạng thái kỳ lương ở đáy sidebar.
   Mọi nút gốc của app.js được DI CHUYỂN (không tạo mới) nên sự kiện của
   chúng vẫn chạy y như cũ.
   ============================================================================= */
(function(){
  'use strict';

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
    // Bỏ nút của trang cũ khỏi thanh trên TRƯỚC khi app.js vẽ lại: app.js gắn
    // sự kiện bằng document.querySelector('[data-act="add"]')… — nếu nút cũ
    // còn nằm trên thanh (đứng trước #main) thì nó sẽ bắt nhầm nút cũ.
    const slot = document.getElementById('tb-actions');
    if(slot) slot.replaceChildren();
    originalRender();
    try{ enhanceMain(); }catch(e){ console.error('[giao diện mới] dựng trang lỗi', e); }
    try{ moveActionsToTopbar(); }catch(e){ console.error('[giao diện mới] chuyển nút lên thanh trên lỗi', e); }
    try{ refreshChrome(); }catch(e){ console.error('[giao diện mới] thanh trên lỗi', e); }
  };

  // Nút thao tác ở đầu trang (Tải mẫu Excel / Nhập từ Excel / + Thêm…) →
  // thanh trên cùng, ngay cạnh "Kỳ lương". Chuyển nguyên phần tử nên sự kiện
  // app.js đã gắn vẫn giữ nguyên.
  function moveActionsToTopbar(){
    const slot = document.getElementById('tb-actions');
    const actions = document.querySelector('#main > .pagehead > .actions');
    if(!slot) return;
    if(actions){
      while(actions.firstChild) slot.appendChild(actions.firstChild);
      actions.remove();
    }
    slot.hidden = !slot.querySelector('.btn');
    fitTopbar();
  }

  // Thanh trên tràn (nhiều nút, màn hình hẹp, hiện thêm nút "Xoá đã chọn")
  // → thu gọn dần: ẩn tên người dùng, rồi nút phụ chỉ còn icon.
  function fitTopbar(){
    const bar = document.getElementById('topbar');
    if(!bar) return;
    bar.classList.remove('tb-fit-1','tb-fit-2');
    if(window.matchMedia('(max-width:880px)').matches) return; // điện thoại: nút đã xuống hàng riêng
    const over = ()=>bar.scrollWidth > bar.clientWidth + 1;
    if(over()) bar.classList.add('tb-fit-1');
    if(over()) bar.classList.add('tb-fit-2');
  }
  window.addEventListener('resize', ()=>fitTopbar());
  // Nút "Xoá đã chọn" hiện/ẩn khi tick chuyến mà không vẽ lại trang
  new MutationObserver(()=>fitTopbar()).observe(document.getElementById('tb-actions'), {subtree:true, childList:true, attributes:true, attributeFilter:['hidden'], characterData:true});

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
  render();
})();
