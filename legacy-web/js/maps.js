/* salehiMaps - map engine: tiles, calibrated images, layers, grids */
(function (global) {
  'use strict';
  const SM = global.SM, U = SM.util, S = SM.storage;
  const M = SM.maps = {};
  const TS = 256;
  const cache = new Map();
  M.cache = cache;

  M.view = { lat: 24.7136, lon: 46.6753, zoom: 6, rotation: 0 };
  M.canvas = null; M.ctx = null; M.w = 0; M.h = 0; M.dpr = 1;
  M.imageObjects = {};   // layerId -> {img, w, h}
  M.gridSpacing = null;

  M.init = function (canvas) {
    M.canvas = canvas; M.ctx = canvas.getContext('2d');
    M.resize();
    window.addEventListener('resize', () => M.resize());
  };
  M.resize = function () {
    if (!M.canvas) return;
    M.dpr = Math.min(window.devicePixelRatio || 1, 2);
    M.w = M.canvas.clientWidth; M.h = M.canvas.clientHeight;
    M.canvas.width = Math.round(M.w * M.dpr); M.canvas.height = Math.round(M.h * M.dpr);
    M.ctx.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
    M.draw();
  };
  M.invalidate = function (key) {
    if (key) {
      for (const [k, v] of cache) if (k.startsWith(key)) { if (v.img && v.img.src && v.img.src.startsWith('blob:')) URL.revokeObjectURL(v.img.src); cache.delete(k); }
    } else cache.clear();
    M.draw();
  };

  /* ---------- coordinate transforms ---------- */
  function zoomBasis() {
    const z = U.clamp(Math.round(M.view.zoom), 0, 22);
    return { z, k: Math.pow(2, M.view.zoom - z), tilePx: TS * Math.pow(2, M.view.zoom - z) };
  }
  M.geoToScreen = function (lat, lon) {
    const b = zoomBasis();
    let x = M.w / 2 + (U.lon2tile(lon, b.z) - U.lon2tile(M.view.lon, b.z)) * b.tilePx;
    let y = M.h / 2 + (U.lat2tile(lat, b.z) - U.lat2tile(M.view.lat, b.z)) * b.tilePx;
    return M.rotatePoint(x, y);
  };
  M.screenToGeo = function (sx, sy) {
    const p = M.unrotatePoint(sx, sy), b = zoomBasis();
    const tx = U.lon2tile(M.view.lon, b.z) + (p.x - M.w / 2) / b.tilePx;
    const ty = U.lat2tile(M.view.lat, b.z) + (p.y - M.h / 2) / b.tilePx;
    return { lat: U.tile2lat(ty, b.z), lon: U.tile2lon(tx, b.z) };
  };
  M.rotatePoint = function (x, y) {
    const r = M.view.rotation * Math.PI / 180;
    if (!r) return { x, y };
    const cx = M.w / 2, cy = M.h / 2, c = Math.cos(r), s = Math.sin(r);
    const dx = x - cx, dy = y - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  };
  M.unrotatePoint = function (x, y) {
    const r = -M.view.rotation * Math.PI / 180;
    if (!r) return { x, y };
    const cx = M.w / 2, cy = M.h / 2, c = Math.cos(r), s = Math.sin(r);
    const dx = x - cx, dy = y - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  };
  M.applyRotation = function (ctx) {
    if (!M.view.rotation) return;
    ctx.translate(M.w / 2, M.h / 2); ctx.rotate(M.view.rotation * Math.PI / 180); ctx.translate(-M.w / 2, -M.h / 2);
  };

  /* ---------- layer factories ---------- */
  function baseLayer(o) {
    return Object.assign({
      id: U.uid(), name: 'خريطة', type: 'tiles', visible: true, opacity: 1,
      contrast: 100, saturation: 100, builtin: false,
      meta: { minZoom: 0, maxZoom: 22 }
    }, o);
  }
  M.addTileLayer = function (o) {
    const l = baseLayer(o); l.type = 'tiles';
    S.state.layers.push(l); S.save(); M.draw(); return l;
  };
  M.demoLayer = function () {
    return baseLayer({
      name: 'خريطة تجريبية (مولّدة محلياً)', type: 'demo', builtin: true,
      meta: { minZoom: 0, maxZoom: 22, attribution: 'salehiMaps' }
    });
  };
  M.addDemo = function () {
    const l = M.demoLayer(); S.state.layers.push(l); S.save(); M.draw(); return l;
  };
  M.addImageLayer = function (file, calibration, name) {
    const l = baseLayer({
      name: name || file.name, type: 'image', builtin: false,
      source: { path: file.webkitRelativePath || file.name, name: file.name },
      calibration: calibration || null,
      meta: { minZoom: 0, maxZoom: 22 }
    });
    S.state.layers.push(l);
    M.imageObjects[l.id] = { img: null, url: URL.createObjectURL(file), w: 0, h: 0 };
    const img = new Image();
    img.onload = () => { const o = M.imageObjects[l.id]; if (o) { o.img = img; o.w = img.naturalWidth; o.h = img.naturalHeight; } M.draw(); };
    img.src = M.imageObjects[l.id].url;
    S.save(); M.draw(); return l;
  };
  M.removeLayer = function (id) {
    const i = S.state.layers.findIndex(l => l.id === id);
    if (i >= 0) { const o = M.imageObjects[id]; if (o && o.url) URL.revokeObjectURL(o.url); delete M.imageObjects[id]; S.state.layers.splice(i, 1); S.save(); M.draw(); }
  };
  M.moveLayer = function (id, dir) {
    const i = S.state.layers.findIndex(l => l.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= S.state.layers.length) return;
    const a = S.state.layers; [a[i], a[j]] = [a[j], a[i]]; S.save(); M.draw();
  };

  /* ---------- OZI calibration parser ---------- */
  M.parseOzi = function (text) {
    const pts = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!/^Point\d+/i.test(line)) continue;
      const f = line.split(',').map(s => s.trim());
      if (f.length < 12) continue;
      const px = parseFloat(f[2]), py = parseFloat(f[3]);
      const deg = f[6], min = f[7], hem = (f[8] || '').toUpperCase();
      const deg2 = f[9], min2 = f[10], hem2 = (f[11] || '').toUpperCase();
      const toDec = (d, m, h) => ((+d || 0) + (+m || 0) / 60) * (h === 'S' || h === 'W' ? -1 : 1);
      if ([px, py].every(Number.isFinite) && f[5].toLowerCase() === 'deg') {
        pts.push({ px, py, lat: toDec(deg, min, hem), lon: toDec(deg2, min2, hem2) });
      }
    }
    return pts.length >= 2 ? { corners: pts, projection: 'OziExplorer' } : null;
  };
  /* fit lat/lon as affine functions of image pixel coordinates */
  function fitAffine(pts) {
    let n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    const solve = key => {
      let sv = 0, sxv = 0, syv = 0;
      for (const p of pts) { const v = p[key]; sv += v; sxv += p.px * v; syv += p.py * v; }
      const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], B = [sxv, syv, sv];
      for (let i = 0; i < 3; i++) {
        let piv = i;
        for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
        [A[i], A[piv]] = [A[piv], A[i]]; [B[i], B[piv]] = [B[piv], B[i]];
        if (Math.abs(A[i][i]) < 1e-12) A[i][i] = 1e-12;
        for (let r = 0; r < 3; r++) if (r !== i) {
          const f = A[r][i] / A[i][i];
          for (let c = i; c < 3; c++) A[r][c] -= f * A[i][c];
          B[r] -= f * B[i];
        }
      }
      return [B[0] / A[0][0], B[1] / A[1][1], B[2] / A[2][2]];
    };
    for (const p of pts) { sx += p.px; sy += p.py; sxx += p.px * p.px; sxy += p.px * p.py; syy += p.py * p.py; }
    return { lat: solve('lat'), lon: solve('lon') };
  }
  M.imageGeo = function (layer) {
    const o = M.imageObjects[layer.id];
    if (!o || !o.w) return null;
    const cal = layer.calibration;
    if (cal && cal.corners && cal.corners.length >= 3) {
      const f = fitAffine(cal.corners);
      const conv = (x, y) => ({ lon: f.lon[0] * x + f.lon[1] * y + f.lon[2], lat: f.lat[0] * x + f.lat[1] * y + f.lat[2] });
      return { tl: conv(0, 0), tr: conv(o.w, 0), br: conv(o.w, o.h), bl: conv(0, o.h) };
    }
    if (cal && cal.bounds) return {
      tl: { lat: cal.bounds.north, lon: cal.bounds.west }, tr: { lat: cal.bounds.north, lon: cal.bounds.east },
      br: { lat: cal.bounds.south, lon: cal.bounds.east }, bl: { lat: cal.bounds.south, lon: cal.bounds.west }
    };
    return null;
  };
  function drawTriangle(ctx, img, sp, dp) {
    ctx.save(); ctx.beginPath();
    ctx.moveTo(dp[0].x, dp[0].y); ctx.lineTo(dp[1].x, dp[1].y); ctx.lineTo(dp[2].x, dp[2].y); ctx.closePath(); ctx.clip();
    const [x0, y0] = sp[0], [x1, y1] = sp[1], [x2, y2] = sp[2];
    const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
    if (!den) { ctx.restore(); return; }
    const a = (dp[0].x * (y1 - y2) + dp[1].x * (y2 - y0) + dp[2].x * (y0 - y1)) / den;
    const b = (dp[0].y * (y1 - y2) + dp[1].y * (y2 - y0) + dp[2].y * (y0 - y1)) / den;
    const c = (dp[0].x * (x2 - x1) + dp[1].x * (x0 - x2) + dp[2].x * (x1 - x0)) / den;
    const d = (dp[0].y * (x2 - x1) + dp[1].y * (x0 - x2) + dp[2].y * (x1 - x0)) / den;
    const e = (dp[0].x * (x1 * y2 - x2 * y1) + dp[1].x * (x2 * y0 - x0 * y2) + dp[2].x * (x0 * y1 - x1 * y0)) / den;
    const f = (dp[0].y * (x1 * y2 - x2 * y1) + dp[1].y * (x2 * y0 - x0 * y2) + dp[2].y * (x0 * y1 - x1 * y0)) / den;
    ctx.transform(a, b, c, d, e, f); ctx.drawImage(img, 0, 0); ctx.restore();
  }
  function drawQuad(ctx, img, dst) {
    const sp = [[0, 0], [img.naturalWidth || img.width, 0], [img.naturalWidth || img.width, img.naturalHeight || img.height], [0, img.naturalHeight || img.height]];
    drawTriangle(ctx, img, [sp[0], sp[1], sp[2]], [dst[0], dst[1], dst[2]]);
    drawTriangle(ctx, img, [sp[0], sp[2], sp[3]], [dst[0], dst[2], dst[3]]);
  }

  /* ---------- tile loading ---------- */
  function tileKey(layer, z, x, y) { return `${layer.id}/${z}/${x}/${y}`; }
  function tileSource(layer, z, x, y) {
    const src = layer.source || {};
    if (src.type === 'aqxdat' && SM.aqx && src.idx) return SM.aqx.getDatTileURL(src.idx, z, x, y);
    if (src.type === 'online') return (src.url || '').replace('{z}', z).replace('{x}', x).replace('{y}', y);
    if (src.type === 'zip') {
      const tms = (src.flavor === 'tms');
      const yy = tms ? (1 << z) - 1 - y : y;
      const key = Object.keys(src.files || {}).find(k => new RegExp('(^|/)' + z + '/' + x + '/' + yy + '\\.(png|jpg|jpeg|webp)$').test(k));
      return key ? src.files[key] : null;
    }
    const tms = src.flavor === 'tms';
    const yy = tms ? (1 << z) - 1 - y : y;
    const ext = src.ext || 'png';
    const base = (src.path || '').replace(/\/$/, '');
    return `${base}/${z}/${x}/${yy}.${ext}`;
  }
  function getTile(layer, z, x, y) {
    const key = tileKey(layer, z, x, y);
    let e = cache.get(key);
    if (!e) {
      e = { img: new Image(), loaded: false, failed: false, pending: false, url: null };
      e.img.onload = () => { e.loaded = true; M.draw(); };
      e.img.onerror = () => { e.failed = true; };
      cache.set(key, e);
    }
    if (!e.loaded && !e.failed && !e.pending && !e.url) {
      const src = tileSource(layer, z, x, y);
      if (!src) { e.failed = true; return e; }
      if (src && typeof src.then === 'function') {
        e.pending = true;
        src.then(u => {
          e.pending = false;
          if (!u) { e.failed = true; return; }
          e.url = u; e.img.src = u;
        }).catch(() => { e.pending = false; e.failed = true; });
        return e;
      }
      if (/^https?:/.test(src) && S.state.config.localOnly) { e.failed = true; return e; }
      const local = !/^https?:/.test(src) ? S.find(src) : null;
      if (!/^https?:/.test(src) && !local) { e.failed = true; return e; }
      e.url = /^https?:/.test(src) ? src : URL.createObjectURL(local.file);
      e.img.src = e.url;
    }
    return e;
  }
  function drawTiles(ctx, layer, b) {
    const z = U.clamp(Math.round(M.view.zoom), layer.meta.minZoom || 0, layer.meta.maxZoom || 22);
    const k = Math.pow(2, M.view.zoom - z);
    const tp = TS * k;
    const ctxZoom = U.clamp(Math.round(M.view.zoom), 0, 22);
    const cx = U.lon2tile(M.view.lon, ctxZoom), cy = U.lat2tile(M.view.lat, ctxZoom);
    const spanX = M.w / tp / 2 + 1.5, spanY = M.h / tp / 2 + 1.5;
    const scale = Math.pow(2, z - ctxZoom);
    for (let x = Math.floor(cx * scale - spanX); x <= Math.ceil(cx * scale + spanX); x++) {
      for (let y = Math.floor(cy * scale - spanY); y <= Math.ceil(cy * scale + spanY); y++) {
        const n = 1 << z;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const e = getTile(layer, z, x, y);
        const sx = M.w / 2 + (x - cx * scale) * tp, sy = M.h / 2 + (y - cy * scale) * tp;
        if (e.loaded) ctx.drawImage(e.img, sx, sy, tp + 0.6, tp + 0.6);
        else { ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(sx, sy, tp, tp); }
      }
    }
  }
  function drawDemo(ctx) {
    const b = zoomBasis(), step = TS * b.k;
    const z = b.z;
    const cx = U.lon2tile(M.view.lon, z), cy = U.lat2tile(M.view.lat, z);
    const sp = step / 4;
    for (let x = Math.floor(cx - M.w / step) * 4; x <= Math.ceil(cx + M.w / step) * 4; x++) {
      for (let y = Math.floor(cy - M.h / step) * 4; y <= Math.ceil(cy + M.h / step) * 4; y++) {
        const sx = M.w / 2 + (x / 4 - cx) * step, sy = M.h / 2 + (y / 4 - cy) * step;
        ctx.fillStyle = ((x + y) % 2) ? '#d8e6cd' : '#cfdfc2';
        ctx.fillRect(sx, sy, sp + 1, sp + 1);
      }
    }
    ctx.strokeStyle = 'rgba(90,130,80,.35)'; ctx.lineWidth = 1;
    for (let x = Math.floor(cx - M.w / step) * 4; x <= Math.ceil(cx + M.w / step) * 4; x++) {
      const sx = M.w / 2 + (x / 4 - cx) * step;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, M.h); ctx.stroke();
    }
    for (let y = Math.floor(cy - M.h / step) * 4; y <= Math.ceil(cy + M.h / step) * 4; y++) {
      const sy = M.h / 2 + (y / 4 - cy) * step;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(M.w, sy); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,70,40,.75)'; ctx.font = '12px sans-serif';
    for (let x = Math.floor(cx - 1); x <= Math.ceil(cx + 1); x++) {
      for (let y = Math.floor(cy - 1); y <= Math.ceil(cy + 1); y++) {
        const p = M.geoToScreen(U.tile2lat(y, z), U.tile2lon(x, z));
        if (p.x > -40 && p.x < M.w + 40 && p.y > -40 && p.y < M.h + 40) ctx.fillText(`${x} , ${y}`, p.x + 4, p.y - 4);
      }
    }
  }

  /* ---------- grids ---------- */
  function niceStep(zoom) { return [45, 30, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001][U.clamp(Math.floor(zoom / 1.5), 0, 15)]; }
  function drawGraticule(ctx) {
    if (!S.state.config.showGrids) return;
    const st = niceStep(M.view.zoom);
    ctx.save(); ctx.strokeStyle = 'rgba(79,195,247,.32)'; ctx.lineWidth = 1;
    ctx.fillStyle = '#bfe9ff'; ctx.font = '11px monospace';
    for (let lon = Math.floor(M.view.lon / st) * st - 2 * st; lon <= M.view.lon + 2 * st; lon += st) {
      const p1 = M.geoToScreen(85, lon), p2 = M.geoToScreen(-85, lon);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      const pl = M.geoToScreen(M.view.lat, lon); ctx.fillText(`${U.round(lon, 4)}°`, pl.x + 3, 14);
    }
    for (let lat = Math.floor(M.view.lat / st) * st - 2 * st; lat <= M.view.lat + 2 * st; lat += st) {
      if (lat < -85 || lat > 85) continue;
      const p1 = M.geoToScreen(lat, M.view.lon - 180), p2 = M.geoToScreen(lat, M.view.lon + 180);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      const pl = M.geoToScreen(lat, M.view.lon); ctx.fillText(`${U.round(lat, 4)}°`, 4, pl.y - 3);
    }
    ctx.restore();
  }

  /* ---------- main draw ---------- */
  M.draw = function () {
    if (!M.ctx) return;
    const ctx = M.ctx;
    ctx.setTransform(M.dpr, 0, 0, M.dpr, 0, 0);
    ctx.clearRect(0, 0, M.w, M.h);
    ctx.fillStyle = '#12222d'; ctx.fillRect(0, 0, M.w, M.h);
    ctx.save(); M.applyRotation(ctx);
    for (const layer of S.state.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      const z = U.clamp(Math.round(M.view.zoom), layer.meta?.minZoom || 0, layer.meta?.maxZoom || 22);
      if (M.view.zoom < (layer.meta?.minZoom || 0) - 0.5 || M.view.zoom > (layer.meta?.maxZoom || 22) + 0.5) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      if (layer.contrast !== 100 || layer.saturation !== 100) ctx.filter = `contrast(${layer.contrast}%) saturate(${layer.saturation}%)`;
      if (layer.type === 'tiles' || layer.type === 'zip') drawTiles(ctx, layer, z);
      else if (layer.type === 'demo') drawDemo(ctx);
      else if (layer.type === 'image') {
        let o = M.imageObjects[layer.id];
        if (!o && layer.source && layer.source.path) {
          const f = S.find(layer.source.path);
          if (f) {
            o = M.imageObjects[layer.id] = { img: null, url: URL.createObjectURL(f.file), w: 0, h: 0 };
            const img = new Image(); img.onload = () => { const t = M.imageObjects[layer.id]; if (t) { t.img = img; t.w = img.naturalWidth; t.h = img.naturalHeight; } M.draw(); }; img.src = o.url;
          }
        }
        const geo = M.imageGeo(layer);
        if (o && o.img && geo) drawQuad(ctx, o.img, [M.geoToScreen(geo.tl.lat, geo.tl.lon), M.geoToScreen(geo.tr.lat, geo.tr.lon), M.geoToScreen(geo.br.lat, geo.br.lon), M.geoToScreen(geo.bl.lat, geo.bl.lon)]);
      }
      ctx.restore();
    }
    drawGraticule(ctx);
    if (SM.landmarks) SM.landmarks.draw(ctx);
    if (SM.gps) SM.gps.draw(ctx);
    if (SM.measure) SM.measure.draw(ctx);
    ctx.restore();
    if (SM.ui) SM.ui.updateInfo();
  };

  /* ---------- helpers for adding files ---------- */
  M.addFiles = async function (files) {
    const report = [];
    for (const f of files) {
      const name = f.name, ext = name.split('.').pop().toLowerCase();
      try {
        if (ext === 'zip') {
          const filesZip = await U.unzip(await U.readFile(f));
          const keys = Object.keys(filesZip);
          const flavor = /^TMS\//i.test(keys[0] || '') ? 'tms' : 'xyz';
          const zs = keys.map(k => +(k.match(/(?:^|\/)(\d+)\//) || [])[1]).filter(Number.isFinite);
          M.addTileLayer({
            name: name, source: { type: 'zip', files: filesZip, flavor, ext: 'png' },
            meta: { minZoom: Math.min(...zs, 0), maxZoom: Math.max(...zs, 22), format: flavor.toUpperCase() + ' ZIP' }
          });
          report.push(`${name}: ${keys.length} ملفات ${flavor.toUpperCase()}`);
        } else if (ext === 'map') {
          const cal = M.parseOzi(await U.readText(f));
          const imgName = (await U.readText(f)).split(/\r?\n/)[1]?.trim();
          const imgEntry = imgName && S.find(imgName) || S.state.files.find(x => x.path.startsWith(f.webkitRelativePath.replace(/\/[^/]+$/, '') + '/') && /\.(jpe?g|png|bmp|gif|webp)$/i.test(x.path));
          if (cal && imgEntry) {
            const existing = S.state.layers.find(l => l.name === (imgName || f.name) && l.calibration && l.calibration.projection === 'OziExplorer');
            if (!existing) M.addImageLayer(imgEntry.file, cal, imgName || f.name);
            report.push(`${name}: معايرة OZI`);
          } else report.push(`${name}: لم يتم العثور على الصورة المرتبطة`);
        } else if (/^(jpe?g|png|bmp|gif|webp)$/.test(ext)) {
          const sidecar = S.find(name + '.cal.json') || S.find(name + '.json');
          const cal = sidecar ? JSON.parse(await U.readText(sidecar.file)) : null;
          M.addImageLayer(f, cal, name);
          report.push(`${name}: صورة ${cal ? 'معايرة' : 'بدون معايرة - استخدم أداة المعايرة'}`);
        } else if (/^(aqx|dat|idx|aqb|aqe)$/.test(ext)) {
          report.push(`${name}: بيانات التطبيق الأصلي - استخدم «مسح بيانات الخرائط الأصلية» من قائمة الخرائط`);
        } else if (/^(sqlitedb|mbtile|gpkg|qct)$/.test(ext)) {
          report.push(`${name}: استخدم tools/import_maps.py لتحويله إلى XYZ`);
        } else report.push(`${name}: صيغة غير مدعومة`);
      } catch (e) { report.push(`${name}: ${e.message}`); }
    }
    S.save(); M.draw(); return report;
  };
})(window);
