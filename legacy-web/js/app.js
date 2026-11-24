/* salehiMaps - application bootstrap, input handling, GPS */
(function (global) {
  'use strict';
  const SM = global.SM, U = SM.util, S = SM.storage, M = SM.maps, L = SM.landmarks, ui = SM.ui;
  const app = SM.app = {};
  const pointers = new Map();
  let drag = null, pinch = null, longTimer = null, moved = false;

  app.init = function () {
    S.load();
    M.init(U.$('#map'));
    Object.assign(M.view, S.state.view || {});
    ui.init();
    initGPS();
    initInput();
    initKeys();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    if (!S.state.layers.length) M.addDemo();
    M.draw();
    if (S.state.mode === 'fsapi' || S.state.files.length) app.refreshData(true);
  };

  /* ---------- map pointer / touch interaction ---------- */
  function initInput() {
    const c = U.$('#map');
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('wheel', e => {
      e.preventDefault();
      M.view.zoom = U.clamp(M.view.zoom - e.deltaY * 0.0022, 0, 22);
      S.state.view = M.view; S.save(); M.draw();
    }, { passive: false });

    c.addEventListener('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      if (pointers.size === 1) {
        c.classList.add('dragging');
        drag = { x: e.clientX, y: e.clientY };
        clearTimeout(longTimer);
        longTimer = setTimeout(() => {
          if (moved) return;
          const p = M.screenToGeo(e.clientX, e.clientY);
          showPointMenu(p);
        }, 600);
      } else if (pointers.size === 2) {
        clearTimeout(longTimer);
        const pts = Array.from(pointers.values());
        pinch = { dist: distance(pts[0], pts[1]), angle: angle(pts[0], pts[1]), zoom: M.view.zoom, rot: M.view.rotation };
        drag = null;
      }
    });

    c.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      if (Math.abs(prev.x - e.clientX) + Math.abs(prev.y - e.clientY) > 3) moved = true;
      const pts = Array.from(pointers.values());
      if (pointers.size >= 2 && pinch) {
        const now = { dist: distance(pts[0], pts[1]), angle: angle(pts[0], pts[1]) };
        M.view.zoom = U.clamp(pinch.zoom + Math.log2(Math.max(1, now.dist) / Math.max(1, pinch.dist)), 0, 22);
        let da = now.angle - pinch.angle;
        if (da > 180) da -= 360; if (da < -180) da += 360;
        M.view.rotation = (pinch.rot + da + 360) % 360;
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        panBy(prev.mid || mid, mid);
        prev.mid = mid;
      } else if (drag) {
        panBy({ x: prev.x, y: prev.y }, { x: e.clientX, y: e.clientY });
      }
      pointers.set(e.pointerId, prev);
      S.state.view = M.view;
      M.draw();
    });

    function end(e) {
      clearTimeout(longTimer);
      if (pointers.size === 1 && !moved && !pinch) {
        const p = M.screenToGeo(e.clientX, e.clientY);
        if (SM.measure.active) SM.measure.add(p);
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) { drag = null; c.classList.remove('dragging'); }
      S.save();
    }
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', e => { e.preventDefault(); M.view.zoom = U.clamp(M.view.zoom + 1, 0, 22); M.draw(); });

    U.$('#zoomIn').onclick = () => { M.view.zoom = U.clamp(Math.round(M.view.zoom) + 1, 0, 22); M.draw(); };
    U.$('#zoomOut').onclick = () => { M.view.zoom = U.clamp(Math.round(M.view.zoom) - 1, 0, 22); M.draw(); };
    const slider = U.$('#zoomSlider');
    slider.oninput = () => { M.view.zoom = +slider.value; M.draw(); };
    setInterval(() => { if (document.activeElement !== slider) slider.value = M.view.zoom; }, 400);
  }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function angle(a, b) { return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; }
  function panBy(from, to) {
    const a = M.screenToGeo(from.x, from.y), b = M.screenToGeo(to.x, to.y);
    M.view.lon += a.lon - b.lon;
    M.view.lat = U.clamp(M.view.lat + a.lat - b.lat, -85, 85);
  }
  function showPointMenu(p) {
    ui.dialog('إحداثيات النقطة', `<div class="muted">${U.formatCoord(p.lat, p.lon, 'decimal')}<br>${U.formatCoord(p.lat, p.lon, S.state.config.coordFormat)}</div>`, [
      { label: 'معلم هنا', cls: 'primary', click: () => { L.createWaypoint(p.lat, p.lon); ui.toast('تم إنشاء معلم'); } },
      { label: 'تعيين كهدف', click: () => { const w = L.createWaypoint(p.lat, p.lon); L.setTarget(w.id); } },
      { label: 'نسخ', click: () => navigator.clipboard?.writeText(`${p.lat}, ${p.lon}`) },
      { label: 'إلغاء' }
    ]);
  }
  app.centerAction = function (act) {
    const p = M.screenToGeo(M.w / 2, M.h / 2);
    if (act === 'target') {
      const w = L.createWaypoint(p.lat, p.lon, 'هدف'); L.setTarget(w.id); ui.toast('تم تعيين الهدف');
    } else if (act === 'placemark') {
      ui.dialog('معلم جديد', `<input type="text" id="pmName" value="معلم جديد">`, [
        { label: 'حفظ', cls: 'primary', click: () => L.createWaypoint(p.lat, p.lon, U.$('#pmName').value.trim()) }, { label: 'إلغاء' }]);
    } else if (act === 'copy' || act === 'share') {
      const text = U.formatCoord(p.lat, p.lon, S.state.config.coordFormat);
      if (act === 'share' && navigator.share) navigator.share({ title: 'salehiMaps', text }).catch(() => {});
      else navigator.clipboard?.writeText(text);
      ui.toast('تم نسخ الإحداثيات');
    } else if (act === 'search') { ui.menu('marks'); setTimeout(() => U.$('#markSearch')?.focus(), 50); }
  };

  function initKeys() {
    document.addEventListener('keydown', e => {
      if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
      const step = 40;
      if (e.key === '+' || e.key === '=') M.view.zoom = U.clamp(Math.round(M.view.zoom) + 1, 0, 22);
      else if (e.key === '-') M.view.zoom = U.clamp(Math.round(M.view.zoom) - 1, 0, 22);
      else if (e.key === 'ArrowUp') M.view.lat = U.clamp(M.view.lat + step / Math.pow(2, M.view.zoom) * 0.15, -85, 85);
      else if (e.key === 'ArrowDown') M.view.lat = U.clamp(M.view.lat - step / Math.pow(2, M.view.zoom) * 0.15, -85, 85);
      else if (e.key === 'ArrowLeft') M.view.lon -= step / Math.pow(2, M.view.zoom) * 0.15;
      else if (e.key === 'ArrowRight') M.view.lon += step / Math.pow(2, M.view.zoom) * 0.15;
      else if (e.key.toLowerCase() === 'r') M.view.rotation = 0;
      else if (e.key.toLowerCase() === 'g') S.state.config.showGrids = !S.state.config.showGrids;
      else return;
      e.preventDefault(); S.state.view = M.view; S.save(); M.draw();
    });
  }

  /* ---------- file inputs ---------- */
  function initInput() {
    U.$('#fileInput').addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      const purpose = e.target.dataset.purpose || 'generic';
      try {
        if (purpose === 'folder') {
          await S.importFileList(files);
          ui.toast('تم تحميل ' + S.state.files.length + ' ملف');
          app.refreshData();
        } else if (purpose === 'backup') {
          await S.importBackup(files[0]); app.refreshData();
        } else if (purpose === 'marks') {
          let n = 0; for (const f of files) n += await L.importFile(f);
          ui.toast('تم استيراد ' + n + ' معلم'); ui.marksMenu();
        } else {
          const report = await M.addFiles(files);
          ui.toast(report.join(' • ').slice(0, 220)); ui.mapsMenu();
        }
      } catch (err) { ui.toast('خطأ: ' + err.message, 5000); console.error(err); }
      e.target.value = '';
    });
    U.$('#folderInput').addEventListener('change', async e => {
      if (!e.target.files.length) return;
      await S.importFileList(e.target.files);
      S.state.mode = 'files';
      ui.toast('تم تحميل ' + S.state.files.length + ' ملف من المجلد');
      app.refreshData(); e.target.value = '';
    });
  }

  /* ---------- original map data ---------- */
  app.scanOriginal = async function () {
    if (!S.state.files.length) { ui.toast('اختر مجلد البيانات أولاً من قائمة التطبيق'); return; }
    try {
      const result = await SM.aqx.scan((msg) => ui.toast(msg, 1200));
      ui.setScanResult(result);
      // reattach tile indexes to layers restored from localStorage
      for (const l of S.state.layers) {
        if (l.type === 'aqxdat' && l.source && l.source.dat && !l.source.idx) {
          const m = result.stored.find(s => s.source.dat === l.source.dat);
          if (m && m.source.idx) l.source.idx = m.source.idx;
        }
      }
      ui.toast(`تم العثور على ${result.stored.length} خريطة محلية و ${result.sources.length} مصدر شبكي`);
      for (const l of S.state.layers) {
        if (l.type === 'aqxdat' && l.source?.dat && !l.source.idx) {
          const m = result.stored.find(s => s.source.dat === l.source.dat);
          if (m) { await SM.aqx.ensureIndex(m, msg => ui.toast(msg, 1200)); l.source.idx = m.source.idx; l.meta = m.meta; }
        }
      }
      if (!S.state.layers.some(l => l.type === 'aqxdat') && result.stored.length) {
        const m = result.stored.slice().sort((a, b) => (a.size || 0) - (b.size || 0))[0];
        await SM.aqx.ensureIndex(m, msg => ui.toast(msg, 1200));
        M.addTileLayer({ name: m.name, source: m.source, meta: m.meta });
        if (m.meta.preview && Number.isFinite(m.meta.preview.lat)) {
          M.view.lat = m.meta.preview.lat; M.view.lon = m.meta.preview.lon;
          M.view.zoom = m.meta.preview.zoom || m.meta.minZoom || 8;
        }
        M.addDemo().visible = false;
        M.draw();
      }
      ui.mapsMenu(); S.save();
    } catch (err) { ui.toast('فشل المسح: ' + err.message, 6000); console.error(err); }
  };
  app.refreshData = async function (silent) {
    try { if (S.state.mode === 'fsapi') await S.scanFsApi(); } catch (e) { console.warn(e); }
    if (!silent) ui.toast('تم تحديث البيانات: ' + S.state.files.length + ' ملف');
    if (S.state.files.length) await app.scanOriginal();
  };
  app.applyWorkspace = function () {
    const id = S.state.config.workspace;
    const d = S.state.workspaceData[id];
    S.state.layers = d && d.layers ? d.layers : [];
    S.state.landmarks = d && d.landmarks ? d.landmarks : [];
    S.save(); M.draw();
  };
  app.showHelp = function () {
    ui.dialog('دليل الاستخدام المختصر', `<div class="muted" style="line-height:1.9">
      <b>التنقل:</b> اسحب بالإصبع أو بالفأرة، عجلة الفأرة أو أزرار +/− للتكبير، وإصبعان للتدوير والتقريب.<br>
      <b>الخرائط الأصلية:</b> اختر مجلد البيانات من «التطبيق ← اختيار مجلد البيانات»، ثم «الخرائط ← مسح بيانات الخرائط الأصلية». سيتم التعرف على ملفات
      <code>AQX / DAT / IDX / PREVIEW / AQB / AQE</code> تلقائياً.<br>
      <b>المعالم:</b> اضغط مطولاً على الخريطة لإنشاء معلم، أو من مركز الشاشة، أو استورد GPX/KML/GeoJSON/CSV.<br>
      <b>الحفظ:</b> تُحفظ الطبقات والإعدادات محلياً، ويمكن تصدير نسخة احتياطية من قائمة التطبيق.<br>
      <b>سطح المكتب:</b> افتح <code>index.html</code> مباشرة في المتصفح، أو شغّل <code>start-server.sh</code>.<br>
      <b>الهاتف:</b> افتح مجلد «خرائط/salehiMaps» واختر <code>index.html</code>، أو ثبّت التطبيق كـ PWA من متصفح يدعم ذلك.</div>`, [{ label: 'حسناً', cls: 'primary' }]);
  };

  /* ---------- GPS ---------- */
  const gps = SM.gps = { pos: null, heading: null, followHeading: false, status: '', watch: null };
  function initGPS() {
    window.addEventListener('deviceorientation', e => {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
      else if (typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
      if (h == null || !Number.isFinite(h)) return;
      gps.heading = h;
      if (gps.followHeading) { M.view.rotation = h; M.draw(); }
    }, true);
  }
  gps.start = function () {
    if (!navigator.geolocation) { gps.status = 'الموقع غير مدعوم في هذا المتصفح'; ui.setGpsInfo(gps.status, true); ui.updateGpsMenuStatus(); return; }
    gps.status = 'جارٍ تحديد الموقع…'; ui.setGpsInfo(gps.status, true); ui.updateGpsMenuStatus();
    gps.watch = navigator.geolocation.watchPosition(pos => {
      gps.pos = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, alt: pos.coords.altitude, speed: pos.coords.speed, time: pos.timestamp };
      gps.status = `خط العرض ${U.round(gps.pos.lat, 6)} • خط الطول ${U.round(gps.pos.lon, 6)} • دقة ${Math.round(gps.pos.acc || 0)} م`;
      if (gps.heading != null) gps.status += ` • اتجاه ${Math.round(gps.heading)}°`;
      ui.setGpsInfo(gps.status, true); ui.updateGpsMenuStatus();
      if (gps.pos.alt != null) ui.setElevation(Math.round(gps.pos.alt) + ' م', true);
      M.draw();
    }, err => {
      gps.status = 'تعذر تحديد الموقع: ' + err.message; ui.setGpsInfo(gps.status, true); ui.updateGpsMenuStatus();
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
  };
  gps.stop = function () {
    if (gps.watch != null) navigator.geolocation.clearWatch(gps.watch);
    gps.watch = null; gps.status = 'الموقع متوقف'; ui.setGpsInfo(gps.status, true); ui.updateGpsMenuStatus(); M.draw();
  };
  gps.locate = function () {
    if (!gps.pos) return ui.toast('لا يوجد موقع حالي');
    M.view.lat = gps.pos.lat; M.view.lon = gps.pos.lon; M.view.zoom = Math.max(M.view.zoom, 16); M.draw(); ui.toast('تم الانتقال إلى الموقع');
  };
  gps.draw = function (ctx) {
    if (!gps.pos) return;
    const p = M.geoToScreen(gps.pos.lat, gps.pos.lon);
    if (p.x < -60 || p.y < -60 || p.x > M.w + 60 || p.y > M.h + 60) return;
    ctx.save();
    const r = U.clamp((gps.pos.acc || 20) / (156543 * Math.cos(gps.pos.lat * Math.PI / 180) / Math.pow(2, M.view.zoom)), 5, 160);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fillStyle = 'rgba(79,195,247,.16)'; ctx.fill();
    if (gps.heading != null) {
      const a = (gps.heading - M.view.rotation) * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.sin(a) * 22, p.y - Math.cos(a) * 22);
      ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fillStyle = '#2196f3'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  };

  document.addEventListener('DOMContentLoaded', app.init);
})(window);
