/* salehiMaps - user interface: panels, dialogs, info boxes and menus */
(function (global) {
  'use strict';
  const SM = global.SM, U = SM.util, S = SM.storage, M = SM.maps, L = SM.landmarks;
  const ui = SM.ui = {};
  const $ = (s, r) => U.$(s, r), $$ = (s, r) => U.$$(s, r);
  let toastTimer = null, currentMenu = null, scanResult = null;

  ui.init = function () {
    $('#panelClose').onclick = () => ui.closePanel();
    $('#dialogClose').onclick = () => ui.closeDialog();
    $('#dialog').addEventListener('click', e => { if (e.target.id === 'dialog') ui.closeDialog(); });
    $$('#featureMenu button').forEach(b => b.onclick = () => ui.menu(b.dataset.menu));
    $('#centerIcon').onclick = e => { e.stopPropagation(); $('#centerPopup').classList.toggle('hidden'); };
    document.addEventListener('click', e => {
      if (!$('#centerPopup').classList.contains('hidden') && !e.target.closest('#centerPopup') && !e.target.closest('#centerIcon')) $('#centerPopup').classList.add('hidden');
    });
    $$('#centerPopup button').forEach(b => b.onclick = () => {
      $('#centerPopup').classList.add('hidden');
      if (SM.app && SM.app.centerAction) SM.app.centerAction(b.dataset.act);
    });
    $('#coordFormatBtn').onclick = () => {
      const fmts = ['decimal', 'dms', 'dm', 'utm', 'mgrs'];
      const i = fmts.indexOf(S.state.config.coordFormat);
      S.state.config.coordFormat = fmts[(i + 1) % fmts.length];
      S.save(); M.draw(); ui.toast('صيغة الإحداثيات: ' + S.state.config.coordFormat);
    };
  };

  ui.toast = function (msg, ms) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 3200);
  };

  ui.panel = function (title, html, setup) {
    currentMenu = null;
    $('#panelTitle').textContent = title;
    $('#panelBody').innerHTML = html;
    $('#panel').classList.remove('hidden');
    $$('#featureMenu button').forEach(b => b.classList.remove('active'));
    if (setup) setup($('#panelBody'));
  };
  ui.closePanel = function () {
    $('#panel').classList.add('hidden');
    $$('#featureMenu button').forEach(b => b.classList.remove('active'));
  };
  ui.dialog = function (title, html, actions, setup) {
    $('#dialogTitle').textContent = title;
    $('#dialogBody').innerHTML = html;
    const box = $('#dialogActions'); box.innerHTML = '';
    (actions || []).forEach(a => {
      const b = document.createElement('button');
      b.textContent = a.label; if (a.cls) b.className = a.cls;
      b.onclick = () => { if (!a.click || a.click($('#dialogBody')) !== false) ui.closeDialog(); };
      box.appendChild(b);
    });
    $('#dialog').classList.remove('hidden');
    if (setup) setup($('#dialogBody'));
  };
  ui.closeDialog = function () { $('#dialog').classList.add('hidden'); };

  ui.pickFiles = function (purpose, accept) {
    const inp = $('#fileInput');
    inp.dataset.purpose = purpose;
    inp.accept = accept || '';
    inp.value = '';
    inp.click();
  };
  ui.pickFolder = function () { $('#folderInput').dataset.purpose = 'folder'; $('#folderInput').click(); };

  /* ---------- information boxes ---------- */
  ui.updateInfo = function () {
    const v = M.view;
    $('#coordValue').textContent = U.formatCoord(v.lat, v.lon, S.state.config.coordFormat);
    const mpp = 156543.03392 * Math.cos(v.lat * Math.PI / 180) / Math.pow(2, v.zoom);
    const target = 90; // desired bar width in px
    const raw = mpp * target;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const nice = [1, 2, 5, 10].map(m => m * pow).reduce((a, b) => Math.abs(b - raw) < Math.abs(a - raw) ? b : a);
    $('#scaleBar').style.width = Math.max(40, Math.min(160, nice / mpp)) + 'px';
    $('#scaleLabel').textContent = U.formatDistance(nice, S.state.config.unit === 'imperial');
    const tg = $('#targetBox');
    if (S.state.target && Number.isFinite(S.state.target.lat)) {
      const t = S.state.target, dist = U.distance(v, t);
      $('#targetValue').textContent = `${U.formatDistance(dist, S.state.config.unit === 'imperial')}  ${U.formatBearing(U.bearing(v, t))}`;
      tg.classList.remove('hidden');
    } else tg.classList.add('hidden');
  };
  ui.setGpsInfo = function (text, show) {
    const b = $('#gpsBox'); if (!b) return;
    $('#gpsValue').textContent = text || '—';
    b.classList.toggle('hidden', !show);
  };
  ui.setElevation = function (text, show) {
    const b = $('#elevBox'); if (!b) return;
    $('#elevValue').textContent = text || '—';
    b.classList.toggle('hidden', !show);
  };

  /* ---------- menu dispatcher ---------- */
  ui.menu = function (kind) {
    if (currentMenu === kind && !$('#panel').classList.contains('hidden')) { ui.closePanel(); return; }
    currentMenu = kind;
    $$('#featureMenu button').forEach(b => b.classList.toggle('active', b.dataset.menu === kind));
    ({ app: ui.appMenu, maps: ui.mapsMenu, marks: ui.marksMenu, gps: ui.gpsMenu, orient: ui.orientMenu }[kind] || ui.appMenu)();
  };

  function configRow(label, key, type) {
    const c = S.state.config;
    if (type === 'check') return `<label class="list-item"><span class="title">${label}</span><input type="checkbox" data-cfg="${key}" ${c[key] ? 'checked' : ''}></label>`;
    if (type === 'range') return `<div class="row"><label>${label}</label><input type="range" data-cfg="${key}" min="0" max="100" value="${c[key]}"><span class="pill" data-val="${key}">${c[key]}</span></div>`;
    const opts = key === 'unit' ? [['metric', 'متري'], ['imperial', 'إمبراطوري']]
      : key === 'coordFormat' ? [['decimal', 'عشري'], ['dms', 'DMS'], ['dm', 'DM'], ['utm', 'UTM'], ['mgrs', 'MGRS/USNG']] : [];
    return `<div class="row"><label>${label}</label><select data-cfg="${key}">${opts.map(o => `<option value="${o[0]}" ${c[key] === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></div>`;
  }
  function bindConfig(root) {
    $$('[data-cfg]', root).forEach(e => {
      e.onchange = () => {
        const k = e.dataset.cfg;
        S.state.config[k] = e.type === 'checkbox' ? e.checked : (e.type === 'range' ? +e.value : e.value);
        const lab = root.querySelector(`[data-val="${k}"]`); if (lab) lab.textContent = e.value;
        S.save(); M.draw();
      };
    });
  }

  ui.appMenu = function () {
    const st = S.state, schema = S.schemaReport();
    const rootName = st.mode === 'fsapi' ? st.rootHandle.name : (st.files[0]?.path.split('/')[0] || 'الذاكرة');
    htmlPanel('التطبيق والإعدادات', `
      <div class="card"><h3>مجلد البيانات</h3>
        <div class="muted">المصدر: ${U.escapeHtml(rootName)} • النمط: ${st.mode} • ${st.files.length} ملف</div>
        <div class="row"><button class="primary" data-a="folder">اختيار مجلد البيانات</button><button data-a="refresh">إعادة المسح</button><button data-a="files">إضافة ملفات</button></div>
        <div class="sep"></div>
        <table><tr><th>المجلد</th><th>الملفات</th></tr>${schema.map(r => `<tr><td>${r.name}</td><td>${r.count}</td></tr>`).join('')}</table>
      </div>
      <div class="card"><h3>الإعدادات</h3>
        ${configRow('الوحدات', 'unit')}${configRow('صيغة الإحداثيات', 'coordFormat')}
        ${configRow('شبكة الإحداثيات', 'showGrids', 'check')}
        ${configRow('عرض شريط التكبير', 'showSlider', 'check')}
        ${configRow('تسميات المعالم', 'markerLabels', 'check')}
        ${configRow('العمل بدون اتصال فقط', 'localOnly', 'check')}
        ${configRow('سماكة الخط', 'lineWidth', 'range')}
      </div>
      <div class="card"><h3>مساحات العمل</h3>
        <div class="row"><select id="wsSelect">${Object.entries(st.workspaces).map(([id, w]) => `<option value="${id}" ${st.config.workspace === id ? 'selected' : ''}>${U.escapeHtml(w.name)}</option>`).join('')}</select></div>
        <div class="row"><button data-a="ws-new">جديدة</button><button data-a="ws-load">تحميل</button><button class="danger" data-a="ws-del">حذف</button></div>
      </div>
      <div class="card"><h3>النسخ الاحتياطي</h3>
        <div class="row"><button data-a="backup">تصدير نسخة احتياطية</button><button data-a="restore">استعادة</button></div>
        <div class="row"><button data-a="help">دليل الاستخدام</button><button data-a="about">عن التطبيق</button></div>
      </div>`, root => {
      bindConfig(root);
      $('#zoomControls').style.display = st.config.showSlider ? '' : 'none';
      $$('[data-a]', root).forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'folder') ui.pickFolder();
        else if (a === 'files') ui.pickFiles('generic', '');
        else if (a === 'refresh') SM.app.refreshData();
        else if (a === 'backup') S.exportBackup();
        else if (a === 'restore') ui.pickFiles('backup', '.json');
        else if (a === 'ws-new') ui.dialog('مساحة عمل جديدة', '<input type="text" id="wsName" placeholder="اسم مساحة العمل" value="مساحة عمل">', [
          { label: 'إنشاء', cls: 'primary', click: () => {
            const n = $('#wsName').value.trim();
            if (n) {
              st.workspaceData[st.config.workspace] = { layers: st.layers.slice(), landmarks: st.landmarks.slice() };
              S.newWorkspace(n); st.workspaceData[st.config.workspace] = { layers: [], landmarks: [] };
              ui.appMenu(); M.draw();
            }
          } }, { label: 'إلغاء' }
        ]);
        else if (a === 'ws-load') {
          st.workspaceData[st.config.workspace] = { layers: st.layers.slice(), landmarks: st.landmarks.slice() };
          st.config.workspace = $('#wsSelect').value; S.save(); SM.app.applyWorkspace();
          ui.toast('تم تحميل مساحة العمل'); M.draw();
        }
        else if (a === 'ws-del') { S.deleteWorkspace($('#wsSelect').value); ui.appMenu(); }
        else if (a === 'help') SM.app.showHelp();
        else if (a === 'about') ui.dialog('عن salehiMaps', `<div class="muted">
          <b>salehiMaps</b> — خرائط غير متصلة للهاتف والكمبيوتر.<br>
          يقرأ ملفات التطبيق الأصلي: <code>AQX</code>، <code>DAT/IDX</code>، <code>PREVIEW</code>، <code>AQB</code>، <code>AQE</code>،
          ويستخدم نفس مخطط المجلدات <code>datastore / icons / landmarks / logs / pictures / maps / workspaces / backups</code>.<br>
          يعمل مباشرة من <code>index.html</code> دون خادم أو اتصال.</div>`, [{ label: 'حسناً' }]);
      });
    });
  };

  function htmlPanel(title, html, setup) { ui.panel(title, html, setup); }

  ui.mapsMenu = function () {
    const layers = S.state.layers.slice().reverse();
    const sources = (SM.aqx && SM.aqx.sources) || [];
    const stored = scanResult ? scanResult.stored : [];
    let html = `<div class="card"><h3>إضافة خريطة</h3>
      <div class="row"><button class="primary" data-a="scan">مسح بيانات الخرائط الأصلية</button></div>
      <div class="row"><button data-a="files">ملفات من الجهاز</button><button data-a="xyz">مجلد XYZ</button></div>
      <div class="row"><button data-a="online">مصدر شبكي</button><button data-a="image">صورة معايرة</button></div>
      <div class="muted" id="scanStatus">${scanResult ? `تم العثور على ${stored.length} خريطة محلية و ${SM.aqx.sources.length} مصدر شبكي` : 'لم يتم مسح بيانات التطبيق الأصلي بعد'}</div>
    </div>`;
    if (stored.length) html += `<div class="card"><h3>خرائط مخزّنة (DAT/IDX)</h3>${stored.map((m, i) => `
      <div class="list-item"><span class="title">${U.escapeHtml(m.name)}</span><span class="pill">z${m.meta.minZoom}–${m.meta.maxZoom}</span>
      <button data-stored="${i}">إضافة</button></div>`).join('')}</div>`;
    if (sources.length) html += `<div class="card"><h3>مصادر AQX</h3>${sources.map((s, i) => `
      <div class="list-item"><span class="title">${U.escapeHtml(s.name)}</span><span class="pill">${s.minZoom}-${s.maxZoom}</span>
      <button data-source="${i}">${s.url ? 'إضافة' : 'بدون رابط'}</button></div>`).join('')}</div>`;
    html += `<div class="card"><h3>الطبقات (${layers.length})</h3>` + (layers.length ? layers.map(l => `
      <div class="card" data-layer="${l.id}">
        <div class="list-item"><input type="checkbox" data-vis="${l.id}" ${l.visible ? 'checked' : ''}>
          <span class="title">${U.escapeHtml(l.name)}</span>
          <button data-up="${l.id}" title="أعلى">▲</button><button data-down="${l.id}" title="أسفل">▼</button>
          <button class="danger" data-del="${l.id}" title="حذف">✕</button></div>
        <div class="row"><label>الشفافية</label><input type="range" data-op="${l.id}" min="0" max="1" step="0.05" value="${l.opacity}"><span class="pill">${Math.round(l.opacity * 100)}%</span></div>
        <div class="row"><label>التباين</label><input type="range" data-co="${l.id}" min="30" max="200" value="${l.contrast}"></div>
        <div class="row"><label>التشبع</label><input type="range" data-sa="${l.id}" min="0" max="200" value="${l.saturation}"></div>
        <div class="muted">${U.escapeHtml(l.type)} ${l.meta?.attribution ? '• ' + U.escapeHtml(l.meta.attribution) : ''}</div>
      </div>`).join('') : '<div class="muted">لا توجد طبقات. أضف خريطة أو استخدم الخريطة التجريبية.</div>') +
      `<div class="row"><button data-a="demo">خريطة تجريبية</button><button class="danger" data-a="clear">حذف كل الطبقات</button></div></div>`;
    ui.panel('الخرائط والطبقات', html, root => {
      $$('[data-vis]', root).forEach(e => e.onchange = () => { setLayer(e.dataset.vis, 'visible', e.checked); });
      $$('[data-op]', root).forEach(e => e.oninput = () => { setLayer(e.dataset.op, 'opacity', +e.value); const s = e.parentElement.querySelector('.pill'); if (s) s.textContent = Math.round(e.value * 100) + '%'; });
      $$('[data-co]', root).forEach(e => e.oninput = () => setLayer(e.dataset.co, 'contrast', +e.value));
      $$('[data-sa]', root).forEach(e => e.oninput = () => setLayer(e.dataset.sa, 'saturation', +e.value));
      $$('[data-up]', root).forEach(e => e.onclick = () => { M.moveLayer(e.dataset.up, 1); ui.mapsMenu(); });
      $$('[data-down]', root).forEach(e => e.onclick = () => { M.moveLayer(e.dataset.down, -1); ui.mapsMenu(); });
      $$('[data-del]', root).forEach(e => e.onclick = () => { M.removeLayer(e.dataset.del); ui.mapsMenu(); });
      $$('[data-stored]', root).forEach(b => b.onclick = async () => {
        const m = stored[+b.dataset.stored];
        b.textContent = '...';
        try { await SM.aqx.ensureIndex(m, msg => ui.toast(msg, 1000)); }
        catch (err) { b.textContent = 'إضافة'; return ui.toast(err.message, 5000); }
        const l = M.addTileLayer({ name: m.name, source: m.source, meta: m.meta, opacity: 1 });
        if (m.meta.preview && Number.isFinite(m.meta.preview.lat)) {
          M.view.lat = m.meta.preview.lat; M.view.lon = m.meta.preview.lon; M.view.zoom = m.meta.preview.zoom || m.meta.minZoom || 6; M.draw();
        }
        ui.toast('تمت إضافة: ' + m.name); S.save(); ui.mapsMenu();
      });
      $$('[data-source]', root).forEach(b => b.onclick = () => {
        const s = sources[+b.dataset.source];
        if (!s.url) return ui.toast('لا يوجد رابط UDP لهذا المصدر');
        M.addTileLayer({ name: s.name, source: { type: 'online', url: s.url }, meta: { minZoom: s.minZoom, maxZoom: s.maxZoom, attribution: s.source } });
        if (Number.isFinite(s.preview.lat)) { M.view.lat = s.preview.lat; M.view.lon = s.preview.lon; M.view.zoom = s.preview.zoom || 6; M.draw(); }
        ui.toast('تمت إضافة المصدر: ' + s.name); ui.mapsMenu();
      });
      $$('[data-a]', root).forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'scan') SM.app.scanOriginal();
        else if (a === 'files') ui.pickFiles('maps', '.zip,.map,.png,.jpg,.jpeg,.webp,.sqlitedb,.mbtile,.gpkg,.qct');
        else if (a === 'xyz') ui.dialog('طبقة XYZ محلية', `<div class="muted">أدخل المسار النسبي داخل مجلد البيانات، مثال: <code>maps/tiles</code> أو <code>datastore/maps/XYZ</code></div>
          <input type="text" id="xyzPath" placeholder="maps/tiles" value="maps/tiles">
          <div class="row"><label>الصيغة</label><select id="xyzFlavor"><option value="xyz">XYZ</option><option value="tms">TMS</option></select>
          <label>الامتداد</label><select id="xyzExt"><option>png</option><option>jpg</option><option>webp</option></select></div>
          <div class="row"><label>أدنى تكبير</label><input type="number" id="zmin" value="0" min="0" max="22"><label>أعلى تكبير</label><input type="number" id="zmax" value="19" min="0" max="22"></div>`, [
          { label: 'إضافة', cls: 'primary', click: () => {
            const path = $('#xyzPath').value.trim();
            if (!path) return false;
            M.addTileLayer({ name: path, source: { type: 'folder', path, flavor: $('#xyzFlavor').value, ext: $('#xyzExt').value }, meta: { minZoom: +$('#zmin').value, maxZoom: +$('#zmax').value } });
            ui.mapsMenu();
          } }, { label: 'إلغاء' }]);
        else if (a === 'online') ui.dialog('مصدر خرائط شبكي', `<div class="muted">قالب الرابط: استخدم <code>{z}</code> و <code>{x}</code> و <code>{y}</code></div>
          <input type="text" id="onUrl" placeholder="https://tile.openstreetmap.org/{z}/{x}/{y}.png" value="https://tile.openstreetmap.org/{z}/{x}/{y}.png">`, [
          { label: 'إضافة', cls: 'primary', click: () => {
            const u = $('#onUrl').value.trim(); if (!u) return false;
            M.addTileLayer({ name: 'خريطة شبكية', source: { type: 'online', url: u }, meta: { minZoom: 0, maxZoom: 19 } });
            ui.mapsMenu();
          } }, { label: 'إلغاء' }]);
        else if (a === 'image') { ui.toast('اختر صورة ثم ملف المعايرة .map إن وُجد'); ui.pickFiles('maps', '.png,.jpg,.jpeg,.webp,.map'); }
        else if (a === 'demo') { if (!S.state.layers.some(l => l.builtin)) M.addDemo(); ui.mapsMenu(); }
        else if (a === 'clear') { S.state.layers.slice().forEach(l => M.removeLayer(l.id)); ui.mapsMenu(); }
      });
    });
  };
  function setLayer(id, key, val) {
    const l = S.state.layers.find(x => x.id === id); if (!l) return;
    l[key] = val; S.save(); M.draw();
  }
  ui.setScanResult = function (r) { scanResult = r; };

  ui.marksMenu = function () {
    const marks = S.state.landmarks;
    ui.panel('المعالم والمسارات', `
      <div class="card"><h3>بحث</h3><input type="search" id="markSearch" placeholder="اسم أو إحداثيات (مثال: 24.71, 46.67)">
        <div id="searchResults"></div></div>
      <div class="card"><h3>القائمة (${marks.length})</h3>
        ${marks.length ? marks.map(m => `<div class="list-item">
          <input type="checkbox" data-mvis="${m.id}" ${m.visible !== false ? 'checked' : ''}>
          <span class="title" data-mname="${m.id}">${U.escapeHtml(m.name)} <span class="pill">${m.type}</span></span>
          <button data-mTarget="${m.id}">🎯</button><button data-mGo="${m.id}">ذهاب</button>
          <button class="danger" data-mDel="${m.id}">✕</button></div>`).join('') : '<div class="muted">لا توجد معالم بعد</div>'}
      </div>
      <div class="card"><h3>أدوات</h3>
        <div class="row"><button data-a="import">استيراد GPX/KML/GeoJSON/CSV</button><button data-a="measure">قياس المسافة</button></div>
        <div class="row"><button data-a="gpx">تصدير GPX</button><button data-a="kml">KML</button><button data-a="csv">CSV</button><button data-a="geojson">GeoJSON</button></div>
      </div>`, root => {
      const sr = $('#searchResults', root);
      $('#markSearch', root).oninput = U.debounce(e => {
        const q = e.target.value;
        const res = L.search(q);
        sr.innerHTML = res.length ? res.map(r => `<div class="list-item"><span class="title">${r.kind === 'coord' ? U.formatCoord(r.item.lat, r.item.lon, 'decimal') : U.escapeHtml(r.item.name)}</span><button data-res="${r.kind}:${r.item.id || 'c'}"> goto</button></div>`).join('') : '<div class="muted">لا نتائج</div>';
        $$('[data-res]', sr).forEach(b => b.onclick = () => {
          const r = res.find(x => (x.item.id || 'c') === b.dataset.res.split(':')[1]);
          if (!r) return;
          const p = r.kind === 'coord' ? r.item : r.item.points[0];
          M.view.lat = p.lat; M.view.lon = p.lon; M.view.zoom = Math.max(M.view.zoom, 14); M.draw(); ui.toast('تم الانتقال');
        });
      }, 200);
      $$('[data-mvis]', root).forEach(e => e.onchange = () => { const m = marks.find(x => x.id === e.dataset.mvis); m.visible = e.checked; S.save(); M.draw(); });
      $$('[data-mDel]', root).forEach(e => e.onclick = () => { L.remove(e.dataset.mDel); ui.marksMenu(); });
      $$('[data-mTarget]', root).forEach(e => e.onclick = () => { L.setTarget(e.dataset.mTarget); ui.marksMenu(); });
      $$('[data-mGo]', root).forEach(e => e.onclick = () => {
        const m = marks.find(x => x.id === e.dataset.mGo), p = m.points[0];
        M.view.lat = p.lat; M.view.lon = p.lon; M.view.zoom = 16; M.draw();
      });
      $$('[data-mname]', root).forEach(e => e.ondblclick = () => {
        const m = marks.find(x => x.id === e.dataset.mname);
        ui.dialog('تعديل الاسم', `<input type="text" id="mName" value="${U.escapeHtml(m.name)}">`, [
          { label: 'حفظ', cls: 'primary', click: () => { if ($('#mName').value.trim()) { m.name = $('#mName').value.trim(); S.save(); M.draw(); ui.marksMenu(); } } }, { label: 'إلغاء' }]);
      });
      $$('[data-a]', root).forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'import') ui.pickFiles('marks', '.gpx,.kml,.kmz,.json,.geojson,.csv,.tsv');
        else if (a === 'measure') { SM.measure.active ? SM.measure.stop() : SM.measure.start(); ui.marksMenu(); }
        else L.export(a);
      });
    });
  };

  ui.gpsMenu = function () {
    const g = SM.gps || {};
    ui.panel('الموقع و GPS', `
      <div class="card"><h3>الموقع الحالي</h3>
        <div class="muted" id="gpsStatus">${g.status || 'الموقع غير مفعّل'}</div>
        <div class="row"><button class="primary" data-a="start">تشغيل GPS</button><button data-a="stop">إيقاف</button><button data-a="locate">الذهاب إلى الموقع</button></div>
        <div class="row"><label class="list-item"><span class="title">تدوير الخريطة مع الاتجاه</span><input type="checkbox" id="followHeading" ${g.followHeading ? 'checked' : ''}></label></div>
      </div>
      <div class="card"><h3>الانتقال إلى إحداثيات</h3>
        <input type="text" id="gotoCoord" placeholder="24.7136, 46.6753 أو DMS أو UTM">
        <div class="row"><button data-a="goto">ذهاب</button><button data-a="center">مركز الشاشة</button></div>
      </div>
      <div class="card"><h3>ملفات الارتفاع (AQE)</h3><div id="aqeList" class="muted">...</div></div>`, root => {
      $$('[data-a]', root).forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'start') SM.gps.start();
        else if (a === 'stop') SM.gps.stop();
        else if (a === 'locate') SM.gps.locate();
        else if (a === 'goto') {
          const p = U.parseCoord($('#gotoCoord').value);
          if (!p) return ui.toast('تعذر قراءة الإحداثيات');
          M.view.lat = p.lat; M.view.lon = p.lon; M.view.zoom = Math.max(M.view.zoom, 14); M.draw(); ui.toast('تم الانتقال');
        } else if (a === 'center') {
          const p = M.screenToGeo(M.w / 2, M.h / 2);
          $('#gotoCoord').value = U.formatCoord(p.lat, p.lon, 'decimal');
        }
      });
      $('#followHeading').onchange = e => { if (SM.gps) SM.gps.followHeading = e.target.checked; };
      const list = $('#aqeList', root);
      const files = S.list('datastore/dem');
      list.textContent = files.length ? files.map(f => f.file.name).join(' • ') : 'لا توجد ملفات ارتفاع';
    });
  };

  ui.orientMenu = function () {
    ui.panel('الاتجاه والشبكة', `
      <div class="card"><h3>تدوير الخريطة</h3>
        <div class="row"><input type="range" id="rotRange" min="-180" max="180" value="${Math.round(M.view.rotation)}"><span class="pill" id="rotVal">${Math.round(M.view.rotation)}°</span></div>
        <div class="row"><button data-a="north">الاتجاه للشمال</button><button data-a="rot90">تدوير 90°</button></div>
      </div>
      <div class="card"><h3>شبكة الإحداثيات</h3>
        ${configRow('إظهار الشبكة', 'showGrids', 'check')}
        ${configRow('صيغة الإحداثيات', 'coordFormat')}
        ${configRow('الوحدات', 'unit')}
      </div>
      <div class="card"><h3>مقياس الرسم</h3>
        <div class="row"><input type="range" id="fineZoom" min="0" max="22" step="0.02" value="${M.view.zoom}"></div>
        <div class="muted">المستوى الأساسي: ${Math.round(M.view.zoom)} • المقياس داخل المستوى: ${(M.view.zoom % 1).toFixed(2)}</div>
      </div>`, root => {
      bindConfig(root);
      $('#rotRange').oninput = e => { M.view.rotation = +e.value; $('#rotVal').textContent = e.value + '°'; M.draw(); };
      $('#fineZoom').oninput = e => { M.view.zoom = +e.value; M.draw(); };
      $$('[data-a]', root).forEach(b => b.onclick = () => {
        if (b.dataset.a === 'north') { M.view.rotation = 0; M.draw(); ui.orientMenu(); }
        else { M.view.rotation = (M.view.rotation + 90) % 360; M.draw(); ui.orientMenu(); }
      });
    });
  };

  ui.updateGpsMenuStatus = function () { const e = $('#gpsStatus'); if (e && SM.gps) e.textContent = SM.gps.status || 'الموقع غير مفعّل'; };
})(window);
