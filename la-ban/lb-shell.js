// Thanh chọn báo cáo + đổi tên đầu mục cho bản HTTP của La bàn.
// Đổi tên chỉ thay CHỮ hiển thị (nút văn bản), không đụng số liệu hay mã tính: biểu đồ vẽ lại, drill-down, chọn kỳ vẫn chạy như cũ,
// tên mới được áp lại mỗi khi trang vẽ lại. Tên đã đổi lưu trên trình duyệt (localStorage), dùng chung cho mọi trang của bộ;
// có thể gửi cho người khác qua link (?ten=...) hoặc file .json.
(function () {
  'use strict';
  const KEY = 'lb-ten:v1';
  const $ = id => document.getElementById(id);
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const OURS = new Set(['lbbar', 'lbpanel', 'lbpop', 'lbhl', 'lbpick-tip', 'lbtoast']);
  const LS = {
    get() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && Array.isArray(v.r) ? v.r : []; } catch (e) { return MEM; } },
    set(r) { MEM = r; try { localStorage.setItem(KEY, JSON.stringify({ v: 1, r })); return true; } catch (e) { return false; } },
  };
  let MEM = [];

  // ---------- quy tắc đổi tên: {f: chữ gốc, t: chữ mới, s: true = đổi cả khi nằm trong câu} ----------
  let RULES = LS.get(), EXACT = new Map(), SUBS = [];
  function compile() {
    EXACT = new Map(); SUBS = [];
    RULES.forEach(r => { if (!r || !norm(r.f)) return; if (r.s) SUBS.push(r); else EXACT.set(norm(r.f), r.t); });
    SUBS.sort((a, b) => b.f.length - a.f.length);
    const n = $('lbcount'); if (n) n.textContent = RULES.length ? String(RULES.length) : '';
  }
  function transform(orig) {
    const n = norm(orig); if (!n) return orig;
    let out = orig;
    if (EXACT.has(n)) { const m = /^(\s*)[\s\S]*?(\s*)$/.exec(orig); out = m[1] + EXACT.get(n) + m[2]; }
    for (const r of SUBS) if (out.indexOf(r.f) >= 0) out = out.split(r.f).join(r.t);
    return out;
  }

  // ---------- áp tên lên trang ----------
  const ORIG = new WeakMap(), WROTE = new WeakMap();
  let touched = false; // đã từng thay chữ nào chưa (để khi xoá hết tên vẫn trả về chữ gốc)
  function ours(node) {
    for (let e = node.nodeType === 1 ? node : node.parentNode; e && e.nodeType === 1; e = e.parentNode) {
      const t = e.nodeName; if (t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA' || t === 'NOSCRIPT') return true;
      if (e.id && OURS.has(e.id)) return true;
    }
    return false;
  }
  function original(node) { return ORIG.has(node) && WROTE.get(node) === node.data ? ORIG.get(node) : node.data; }
  function proc(node) {
    if (!node.parentNode || ours(node)) return;
    const orig = original(node), nv = transform(orig);
    ORIG.set(node, orig);
    if (nv !== node.data) {
      const p = node.parentNode;
      // <option> không có value: giá trị = chữ hiển thị → giữ giá trị gốc để mã của trang vẫn đọc đúng
      if (p.nodeName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', norm(orig));
      node.data = nv; touched = true;
    }
    WROTE.set(node, node.data);
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { proc(root); return; }
    if (root.nodeType !== 1 || ours(root)) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = tw.nextNode())) proc(n);
  }
  let TITLE0 = null;
  function applyAll() {
    compile();
    if (!RULES.length && !touched) return;
    walk(document.body);
    if (TITLE0 == null) TITLE0 = document.title;
    document.title = transform(TITLE0);
  }
  // trang vẽ lại (đổi kỳ, drill-down, tooltip) → áp lại tên cho phần mới
  let queue = new Set(), raf = 0;
  const mo = new MutationObserver(ms => {
    if (!RULES.length && !touched) return;
    for (const m of ms) {
      if (m.type === 'characterData') queue.add(m.target);
      else m.addedNodes.forEach(n => queue.add(n));
    }
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const q = queue; queue = new Set(); q.forEach(walk); });
  });

  function save(r) { RULES = r; LS.set(r); applyAll(); renderPanel(); }
  function upsert(f, t, s) {
    f = s ? String(f).trim() : norm(f); t = String(t).trim();
    const r = RULES.filter(x => !(x.f === f && !!x.s === !!s));
    if (norm(t) && t !== f) r.push({ f, t, s: !!s });
    save(r);
  }

  // ---------- chế độ bấm vào chữ để đổi ----------
  let picking = false, hlEl = null;
  function setPick(on) {
    picking = on; document.body.classList.toggle('lb-picking', on);
    const b = $('lbedit'); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const c = $('lbpickchk'); if (c) c.checked = on;
    if (!on) hl(null);
  }
  function hl(rect) {
    const h = $('lbhl'); if (!h) return;
    if (!rect) { h.style.display = 'none'; return; }
    Object.assign(h.style, { display: 'block', left: rect.left - 3 + 'px', top: rect.top - 2 + 'px', width: rect.width + 6 + 'px', height: rect.height + 4 + 'px' });
  }
  function textRects(t) { const r = document.createRange(); r.selectNodeContents(t); return [...r.getClientRects()]; }
  function inRects(rs, x, y) { return rs.some(b => x >= b.left - 3 && x <= b.right + 3 && y >= b.top - 3 && y <= b.bottom + 3); }
  function textAt(e) {
    const x = e.clientX, y = e.clientY;
    let n = null;
    try {
      if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); n = p && p.offsetNode; }
      else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); n = r && r.startContainer; }
    } catch (err) { n = null; }
    if (n && n.nodeType === 3 && norm(n.data) && !ours(n) && inRects(textRects(n), x, y)) return n;
    // chữ trong biểu đồ SVG và ô có nhiều đoạn chữ: tìm đoạn nằm dưới con trỏ
    const el = e.target && e.target.nodeType === 1 ? e.target : null; if (!el || ours(el)) return null;
    let first = null;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let t;
    while ((t = tw.nextNode())) { if (!norm(t.data) || ours(t)) continue; if (inRects(textRects(t), x, y)) return t; first = first || t; }
    return first;
  }
  const isNum = s => !/[A-Za-zÀ-ỹĐđ]{2,}/.test(s); // chỉ số, dấu, đơn vị ngắn → không cho đổi
  function rectOf(t) { const rs = textRects(t); if (!rs.length) return null; const l = Math.min(...rs.map(r => r.left)), tp = Math.min(...rs.map(r => r.top)); return { left: l, top: tp, width: Math.max(...rs.map(r => r.right)) - l, height: Math.max(...rs.map(r => r.bottom)) - tp }; }
  function onMove(e) {
    if (!picking || ours(e.target)) { if (picking) hl(null); return; }
    const t = textAt(e); hlEl = t && !isNum(norm(original(t))) ? t : null; hl(hlEl ? rectOf(hlEl) : null);
  }
  const BLOCK = ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'dblclick', 'touchstart', 'touchend', 'contextmenu', 'auxclick'];
  function blocker(e) {
    if (!picking || ours(e.target)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  }
  function onClick(e) {
    const a = e.target && e.target.closest && e.target.closest('a[target=_blank]');
    // liên kết giữa các trang trong bộ: mở ngay trong tab này (giữ thanh chọn báo cáo)
    if (!picking && a && a.host === location.host && /\.html?(\?|#|$)/.test(a.pathname + a.search + a.hash)) { a.removeAttribute('target'); return; }
    if (!picking || ours(e.target)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const t = textAt(e); if (!t) return;
    const orig = norm(original(t)); if (!orig || isNum(orig)) { toast('Chữ này là số liệu, không đổi tên được'); return; }
    openPop(orig, e.clientX, e.clientY);
  }

  // ---------- ô sửa ----------
  function findRule(f) { return RULES.find(r => !r.s && r.f === f) || RULES.find(r => r.s && r.f === f); }
  function openPop(orig, x, y) {
    const p = $('lbpop'), r = findRule(orig);
    $('lbpop-o').textContent = orig;
    $('lbpop-f').value = r ? r.f : orig;
    $('lbpop-t').value = r ? r.t : orig;
    $('lbpop-s').checked = !!(r && r.s);
    $('lbpop-reset').disabled = !r;
    p.hidden = false;
    const w = p.offsetWidth, h = p.offsetHeight, vw = innerWidth, vh = innerHeight;
    p.style.left = Math.max(12, Math.min(vw - w - 12, (x == null ? vw / 2 - w / 2 : x - w / 2))) + 'px';
    p.style.top = Math.max(12, Math.min(vh - h - 12, (y == null ? vh / 3 : y + 16))) + 'px';
    const i = $('lbpop-t'); i.focus(); i.select();
  }
  function closePop() { $('lbpop').hidden = true; }
  function popSave() {
    const f = $('lbpop-f').value, t = $('lbpop-t').value, s = $('lbpop-s').checked || norm(f) !== norm($('lbpop-o').textContent);
    if (!norm(f)) return;
    // đổi chữ gốc ban đầu thành cụm khác (vd chỉ "Doanh thu") → luôn đổi trong câu
    const old = findRule(norm($('lbpop-o').textContent));
    let r = RULES.slice(); if (old) r = r.filter(x => x !== old);
    RULES = r; upsert(f, t, s);
    closePop(); toast(norm(t) && t !== f ? 'Đã đổi tên — áp dụng cho mọi trang của bộ báo cáo' : 'Đã trả về tên gốc');
  }

  // ---------- bảng tên đã đổi ----------
  function pageTerms() {
    const seen = new Map(), tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) {
      if (ours(n)) continue; const o = norm(original(n));
      if (!o || o.length > 60 || isNum(o) || /\d/.test(o) || seen.has(o)) continue; // bỏ câu có số (đổi theo kỳ)
      const el = n.parentNode; if (!el || !el.getClientRects || !el.getClientRects().length) continue; // phần đang ẩn
      seen.set(o, 1);
    }
    return [...seen.keys()];
  }
  function renderPanel() {
    const p = $('lbpanel'); if (!p || p.hidden) return;
    const L = $('lblist');
    L.innerHTML = RULES.length ? RULES.map((r, i) => `<div class="lb-it"><div class="lb-from">${r.s ? 'Trong câu: ' : ''}<s>${esc(r.f)}</s></div><div class="lb-to"><input type="text" data-i="${i}" value="${esc(r.t)}" aria-label="Tên mới cho ${esc(r.f)}"><button type="button" class="lb-del" data-del="${i}" aria-label="Bỏ tên mới, về ${esc(r.f)}" title="Về tên gốc">×</button></div></div>`).join('')
      : '<p class="lb-empty">Chưa đổi tên nào. Bật “Bấm vào chữ trên trang”, rồi bấm vào tiêu đề, cột, nhãn biểu đồ… muốn gọi theo cách của bạn.</p>';
    renderTerms();
  }
  function renderTerms() {
    const q = norm($('lbq').value).toLowerCase(), done = new Set(RULES.map(r => r.f));
    const all = pageTerms().filter(t => !q || t.toLowerCase().includes(q));
    $('lbterms').innerHTML = all.slice(0, 60).map(t => `<button type="button" class="lb-term${done.has(t) ? ' lb-done' : ''}" data-t="${esc(t)}" title="${esc(t)}">${esc(t)}</button>`).join('') +
      (all.length > 60 ? `<p class="lb-hint">… còn ${all.length - 60} đầu mục, gõ để lọc.</p>` : '') + (!all.length ? '<p class="lb-hint">Không có đầu mục khớp.</p>' : '');
  }
  function openPanel() { $('lbpanel').hidden = false; renderPanel(); setPick(true); }
  function closePanel() { $('lbpanel').hidden = true; setPick(false); closePop(); }

  // ---------- chia sẻ tên ----------
  const enc = o => { const b = new TextEncoder().encode(JSON.stringify(o)); let s = ''; b.forEach(c => s += String.fromCharCode(c)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const dec = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s); return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))); };
  const clean = a => (Array.isArray(a) ? a : []).filter(r => r && typeof r.f === 'string' && typeof r.t === 'string' && norm(r.f)).map(r => ({ f: r.s ? r.f : norm(r.f), t: r.t, s: !!r.s })).slice(0, 500);
  function shareLink() {
    const u = new URL(location.href); u.hash = ''; u.searchParams.set('ten', enc(RULES.map(r => [r.f, r.t, r.s ? 1 : 0])));
    return u.toString();
  }
  async function copy(txt) {
    try { await navigator.clipboard.writeText(txt); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { } ta.remove(); return ok;
    }
  }
  function download() {
    const blob = new Blob([JSON.stringify({ v: 1, r: RULES }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ten-dau-muc.json'; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importFile(file) {
    const fr = new FileReader();
    fr.onload = () => { try { const o = JSON.parse(fr.result); const r = clean(o.r || o); save(r); toast(`Đã nhập ${r.length} tên`); } catch (e) { toast('File không đúng định dạng tên đầu mục'); } };
    fr.readAsText(file);
  }
  let tt = 0;
  function toast(msg) { const t = $('lbtoast'); if (!t) return; t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }

  // ---------- dựng giao diện ----------
  function ui() {
    const bar = $('lbbar'); if (!bar) return;
    // thanh tràn hết bề ngang dù body có lề hai bên
    const fit = () => { const cs = getComputedStyle(document.body); bar.style.marginLeft = '-' + cs.paddingLeft; bar.style.marginRight = '-' + cs.paddingRight; bar.style.marginTop = '-' + cs.paddingTop; };
    fit(); addEventListener('resize', fit);
    const sel = $('lbsel'); if (sel) sel.addEventListener('change', () => { if (sel.value) location.href = sel.value; });
    $('lbedit').addEventListener('click', () => { $('lbpanel').hidden ? openPanel() : closePanel(); });
    document.body.insertAdjacentHTML('beforeend',
      `<div id="lbhl"></div><div id="lbpick-tip" role="status">Bấm vào chữ muốn đổi tên · Esc để thoát</div><div id="lbtoast" role="status" aria-live="polite" hidden></div>
<div id="lbpop" role="dialog" aria-label="Đổi tên đầu mục" hidden><h4>Đổi tên đầu mục</h4>
<div style="font-size:12px;color:#5a6779">Tên gốc: <b id="lbpop-o" style="color:#0d1b2e;overflow-wrap:anywhere"></b></div>
<label>Chữ cần đổi <input type="text" id="lbpop-f" autocomplete="off"></label>
<label>Gọi là <input type="text" id="lbpop-t" autocomplete="off"></label>
<label class="lb-chk"><input type="checkbox" id="lbpop-s"> Đổi cả khi chữ này nằm trong câu khác (vd mọi chỗ có “LN gộp”)</label>
<div class="lb-row"><button type="button" class="lb-b lb-dan" id="lbpop-reset">Về tên gốc</button><button type="button" class="lb-b" id="lbpop-no">Huỷ</button><button type="button" class="lb-b lb-pri" id="lbpop-ok">Lưu</button></div></div>
<aside id="lbpanel" aria-label="Đổi tên đầu mục" hidden><div class="lb-ph"><b>Đổi tên đầu mục</b><button type="button" class="lb-x" id="lbclose" aria-label="Đóng">×</button></div>
<div class="lb-pb">
<p class="lb-hint">Gọi tiêu đề, cột, nhãn biểu đồ theo cách người đọc quen dùng. Chỉ đổi chữ hiển thị, số liệu và thao tác bấm xem chi tiết giữ nguyên. Tên mới áp dụng cho mọi trang của bộ báo cáo trên trình duyệt này.</p>
<label class="lb-mode"><span><b>Bấm vào chữ trên trang để đổi</b><br><small style="color:#64748b">Khi bật, bấm vào trang không mở chi tiết</small></span><input type="checkbox" id="lbpickchk" style="width:20px;height:20px;accent-color:#d62828"></label>
<div class="lb-sec"><h4>Tên đã đổi</h4><div class="lb-list" id="lblist"></div></div>
<div class="lb-sec"><h4>Đầu mục trên trang này</h4><input type="search" id="lbq" placeholder="Tìm đầu mục, vd: Doanh thu" aria-label="Tìm đầu mục"><div class="lb-terms" id="lbterms"></div></div>
</div>
<div class="lb-pf"><div class="lb-row"><button type="button" class="lb-b lb-pri" id="lbshare">Sao chép link kèm tên</button><button type="button" class="lb-b" id="lbdl">Tải file tên</button><button type="button" class="lb-b" id="lbup">Nhập file</button><button type="button" class="lb-b lb-dan" id="lbclear">Xoá hết</button></div>
<input type="file" id="lbfile" accept=".json,application/json" hidden><p class="lb-hint">Gửi “link kèm tên” để người nhận mở ra đã thấy đúng tên bạn đặt.</p></div></aside>`);
    $('lbpop-ok').addEventListener('click', popSave);
    $('lbpop-no').addEventListener('click', closePop);
    $('lbpop-reset').addEventListener('click', () => { const r = findRule(norm($('lbpop-o').textContent)); if (r) save(RULES.filter(x => x !== r)); closePop(); toast('Đã trả về tên gốc'); });
    $('lbpop').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.type === 'text') { e.preventDefault(); popSave(); } if (e.key === 'Escape') { e.stopPropagation(); closePop(); } });
    $('lbclose').addEventListener('click', closePanel);
    $('lbpickchk').addEventListener('change', e => setPick(e.target.checked));
    $('lbq').addEventListener('input', renderTerms);
    $('lbterms').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { const r = b.getBoundingClientRect(); openPop(b.dataset.t, Math.min(r.left, innerWidth - 380), r.bottom); } });
    $('lblist').addEventListener('change', e => { const i = e.target.dataset.i; if (i == null) return; const r = RULES.slice(); const v = e.target.value; if (!norm(v)) r.splice(+i, 1); else r[+i] = Object.assign({}, r[+i], { t: v }); save(r); });
    $('lblist').addEventListener('click', e => { const i = e.target.dataset.del; if (i == null) return; const r = RULES.slice(); r.splice(+i, 1); save(r); });
    $('lbshare').addEventListener('click', async () => { if (!RULES.length) { toast('Chưa có tên nào để gửi'); return; } toast(await copy(shareLink()) ? 'Đã sao chép link — dán vào email hoặc Zalo để gửi' : 'Không sao chép được, hãy dùng “Tải file tên”'); });
    $('lbdl').addEventListener('click', download);
    $('lbup').addEventListener('click', () => $('lbfile').click());
    $('lbfile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
    $('lbclear').addEventListener('click', () => { if (RULES.length && confirm('Xoá hết tên đã đổi, về tên gốc?')) { save([]); toast('Đã về tên gốc'); } });
    addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('lbpop').hidden) closePop(); else if (picking) { setPick(false); } } });
    addEventListener('mousemove', onMove, true);
    addEventListener('scroll', () => { if (picking) hl(null); }, true);
    BLOCK.forEach(t => addEventListener(t, blocker, { capture: true, passive: false }));
    addEventListener('click', onClick, true);
  }

  // link kèm tên: ?ten=... → lưu, rồi bỏ khỏi địa chỉ để lần sau mở không ghi đè tên người nhận tự đặt
  function fromUrl() {
    try {
      const u = new URL(location.href), s = u.searchParams.get('ten'); if (!s) return;
      const a = dec(s), r = clean((Array.isArray(a) ? a : []).map(x => Array.isArray(x) ? { f: x[0], t: x[1], s: !!x[2] } : x));
      RULES = r; LS.set(r); u.searchParams.delete('ten'); history.replaceState(null, '', u.toString());
      setTimeout(() => toast(`Đã áp dụng ${r.length} tên đầu mục từ đường link`), 300);
    } catch (e) { setTimeout(() => toast('Link tên đầu mục bị lỗi, giữ tên gốc'), 300); }
  }

  function start() {
    fromUrl(); ui(); applyAll();
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    // trang có thể vẽ xong sau sự kiện load (phông chữ, dữ liệu nhúng lớn)
    setTimeout(applyAll, 400);
  }
  window.LBRename = { rules: () => RULES.slice(), set: r => save(clean(r)), apply: applyAll, link: shareLink };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
