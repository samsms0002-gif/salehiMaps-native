/* salehiMaps - placemarks (waypoints / routes / tracks / areas), import-export, measure */
(function (global) {
  'use strict';
  const SM = global.SM, U = SM.util, S = SM.storage, M = SM.maps;
  const L = SM.landmarks = {};
  const COLORS = ['#e040fb', '#ff5252', '#ffb300', '#4caf50', '#29b6f6', '#8d6e63'];
  const byId = id => S.state.landmarks.find(x => x.id === id);

  L.createWaypoint = function (lat, lon, name) {
    const w = { id: U.uid(), type: 'waypoint', name: name || 'نقطة جديدة', points: [{ lat, lon }], color: COLORS[S.state.landmarks.length % COLORS.length], visible: true, created: new Date().toISOString() };
    S.state.landmarks.push(w); S.save(); M.draw(); return w;
  };
  L.createRoute = function (points, name) {
    if (points.length < 2) return null;
    const r = { id: U.uid(), type: 'route', name: name || 'مسار', points: points.slice(), color: '#ffb300', visible: true };
    S.state.landmarks.push(r); S.save(); M.draw(); return r;
  };
  L.remove = function (id) {
    const i = S.state.landmarks.findIndex(x => x.id === id);
    if (i >= 0) { S.state.landmarks.splice(i, 1); if (S.state.target && S.state.target.id === id) S.state.target = null; S.save(); M.draw(); }
  };
  L.setTarget = function (id) { S.state.target = S.state.target && S.state.target.id === id ? null : { id, lat: 0, lon: 0 }; const w = byId(id); if (S.state.target && w) Object.assign(S.state.target, w.points[0]); S.save(); M.draw(); };

  L.draw = function (ctx) {
    const marks = S.state.landmarks.filter(x => x.visible !== false);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const m of marks) {
      const pts = m.points || [];
      if (pts.length > 1 && (m.type === 'route' || m.type === 'track' || m.type === 'area')) {
        ctx.beginPath();
        pts.forEach((p, i) => { const s = M.geoToScreen(p.lat, p.lon); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
        if (m.type === 'area') { ctx.closePath(); ctx.fillStyle = (m.color || '#4fc3f7') + '33'; ctx.fill(); }
        ctx.strokeStyle = m.color || '#ffb300'; ctx.lineWidth = S.state.config.lineWidth || 3; ctx.stroke();
      }
      if (m.type !== 'waypoint' && pts.length < 1) continue;
      const showPts = m.type === 'waypoint' ? pts : (m.type === 'track' ? [pts[0], pts[pts.length - 1]] : pts);
      for (const p of showPts) {
        const s = M.geoToScreen(p.lat, p.lon);
        if (s.x < -20 || s.y < -20 || s.x > M.w + 20 || s.y > M.h + 20) continue;
        ctx.beginPath(); ctx.arc(s.x, s.y, m.type === 'waypoint' ? 6 : 4, 0, 7);
        ctx.fillStyle = m.color || '#e040fb'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        if (S.state.config.markerLabels && m.name) {
          ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3;
          ctx.strokeText(m.name, s.x + 9, s.y + 4); ctx.fillText(m.name, s.x + 9, s.y + 4);
        }
      }
    }
    if (S.state.target && Number.isFinite(S.state.target.lat)) {
      const s = M.geoToScreen(S.state.target.lat, S.state.target.lon);
      ctx.strokeStyle = '#ffeb3b'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(s.x, s.y, 12, 0, 7); ctx.moveTo(s.x - 18, s.y); ctx.lineTo(s.x + 18, s.y);
      ctx.moveTo(s.x, s.y - 18); ctx.lineTo(s.x, s.y + 18); ctx.stroke();
    }
    ctx.restore();
  };

  /* ---------- import ---------- */
  const dec = txt => { const v = parseFloat(txt); return Number.isFinite(v) ? v : 0; };
  L.importFile = async function (file) {
    const ext = file.name.split('.').pop().toLowerCase();
    let txt = await U.readText(file);
    const added = [];
    if (ext === 'gpx') {
      const doc = new DOMParser().parseFromString(txt, 'text/xml');
      Array.from(doc.getElementsByTagName('wpt')).forEach(el => added.push({
        type: 'waypoint', name: el.getElementsByTagName('name')[0]?.textContent || 'نقطة',
        points: [{ lat: dec(el.getAttribute('lat')), lon: dec(el.getAttribute('lon')), ele: dec(el.getElementsByTagName('ele')[0]?.textContent || 0), name: el.getElementsByTagName('name')[0]?.textContent }]
      }));
      Array.from(doc.getElementsByTagName('rte')).forEach(el => added.push({
        type: 'route', name: el.getElementsByTagName('name')[0]?.textContent || 'مسار',
        points: Array.from(el.getElementsByTagName('rtept')).map(p => ({ lat: dec(p.getAttribute('lat')), lon: dec(p.getAttribute('lon')) }))
      }));
      Array.from(doc.getElementsByTagName('trk')).forEach(el => added.push({
        type: 'track', name: el.getElementsByTagName('name')[0]?.textContent || 'أثر',
        points: Array.from(el.getElementsByTagName('trkpt')).map(p => ({ lat: dec(p.getAttribute('lat')), lon: dec(p.getAttribute('lon')), time: p.getElementsByTagName('time')[0]?.textContent }))
      }));
    } else if (ext === 'kml' || ext === 'kmz') {
      if (ext === 'kmz') {
        const zip = await U.unzip(await U.readFile(file));
        const key = Object.keys(zip).find(k => /\.kml$/i.test(k));
        if (!key) throw new Error('لا يوجد ملف KML داخل KMZ');
        txt = new TextDecoder().decode(new Uint8Array(zip[key]));
      }
      const doc = new DOMParser().parseFromString(txt, 'text/xml');
      const parseCoords = el => Array.from(el.getElementsByTagName('coordinates')[0]?.textContent.trim().split(/\s+/) || [])
        .map(c => c.split(',')).filter(a => a.length >= 2).map(a => ({ lon: dec(a[0]), lat: dec(a[1]), ele: dec(a[2] || 0) }));
      Array.from(doc.getElementsByTagName('Placemark')).forEach(pm => {
        const name = pm.getElementsByTagName('name')[0]?.textContent || 'معلم';
        const pt = pm.getElementsByTagName('Point')[0], ln = pm.getElementsByTagName('LineString')[0], pg = pm.getElementsByTagName('Polygon')[0];
        if (pt) { const c = parseCoords(pt)[0]; if (c) added.push({ type: 'waypoint', name, points: [c] }); }
        else if (ln) added.push({ type: 'route', name, points: parseCoords(ln) });
        else if (pg) added.push({ type: 'area', name, points: parseCoords(pg) });
        const go = pm.getElementsByTagName('GroundOverlay')[0];
        if (go) {
          const href = go.getElementsByTagName('href')[0]?.textContent;
          const box = go.getElementsByTagName('LatLonBox')[0];
          if (href && box) {
            const val = tag => dec(box.getElementsByTagName(tag)[0]?.textContent);
            M.addTileLayer({ name: name + ' (تراكب صورة)', type: 'overlay', visible: true, source: { type: 'online', url: href }, meta: { minZoom: 0, maxZoom: 22 } });
          }
        }
      });
    } else if (ext === 'json' || ext === 'geojson') {
      const j = JSON.parse(txt);
      const feats = j.type === 'FeatureCollection' ? j.features : (j.type === 'Feature' ? [j] : [j]);
      feats.forEach(f => {
        const g = f.geometry || f, name = f.properties?.name || 'معلم';
        if (g.type === 'Point') added.push({ type: 'waypoint', name, points: [{ lat: g.coordinates[1], lon: g.coordinates[0] }] });
        if (g.type === 'LineString') added.push({ type: 'route', name, points: g.coordinates.map(c => ({ lat: c[1], lon: c[0] })) });
        if (g.type === 'Polygon') added.push({ type: 'area', name, points: g.coordinates[0].map(c => ({ lat: c[1], lon: c[0] })) });
      });
    } else if (ext === 'csv' || ext === 'tsv') {
      const sep = ext === 'tsv' ? '\t' : ',';
      txt.split(/\r?\n/).filter(Boolean).slice(1).forEach(line => {
        const f = line.split(sep).map(s => s.trim().replace(/^"|"$/g, ''));
        if (f.length >= 2 && Number.isFinite(+f[0]) && Number.isFinite(+f[1])) added.push({ type: 'waypoint', name: f[2] || 'نقطة', points: [{ lat: +f[0], lon: +f[1], ele: +f[3] || 0 }] });
        else if (f.length >= 2 && Number.isFinite(+f[1]) && Number.isFinite(+f[2])) added.push({ type: 'waypoint', name: f[0], points: [{ lat: +f[1], lon: +f[2] }] });
      });
    } else throw new Error('صيغة غير مدعومة: ' + ext);
    let n = 0;
    for (const a of added) {
      if (!a.points || !a.points.length || !a.points.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))) continue;
      S.state.landmarks.push(Object.assign({ id: U.uid(), color: COLORS[n % COLORS.length], visible: true }, a)); n++;
    }
    S.save(); M.draw(); return n;
  };

  /* ---------- export ---------- */
  L.export = function (format, items) {
    items = items || S.state.landmarks;
    const safe = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'gpx') {
      let x = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="salehiMaps" xmlns="http://www.topografix.com/GPX/1/1">\n';
      for (const m of items) {
        if (m.type === 'waypoint') x += `<wpt lat="${m.points[0].lat}" lon="${m.points[0].lon}"><name>${safe(m.name)}</name></wpt>\n`;
        else if (m.type === 'route') x += `<rte><name>${safe(m.name)}</name>${m.points.map(p => `<rtept lat="${p.lat}" lon="${p.lon}"/>`).join('')}</rte>\n`;
        else x += `<trk><name>${safe(m.name)}</name><trkseg>${m.points.map(p => `<trkpt lat="${p.lat}" lon="${p.lon}"/>`).join('')}</trkseg></trk>\n`;
      }
      U.download('salehiMaps-' + stamp + '.gpx', x + '</gpx>', 'application/gpx+xml');
    } else if (format === 'kml') {
      let x = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n';
      for (const m of items) {
        const c = m.points.map(p => `${p.lon},${p.lat},0`).join(' ');
        const geo = m.type === 'waypoint' ? `<Point><coordinates>${c}</coordinates></Point>` :
          (m.type === 'area' ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${c}</coordinates></LinearRing></outerBoundaryIs></Polygon>` : `<LineString><coordinates>${c}</coordinates></LineString>`);
        x += `<Placemark><name>${safe(m.name)}</name>${geo}</Placemark>\n`;
      }
      U.download('salehiMaps-' + stamp + '.kml', x + '</Document></kml>', 'application/vnd.google-earth.kml+xml');
    } else if (format === 'csv') {
      let x = 'name,latitude,longitude,type\n' + items.flatMap(m => m.points.map(p => `"${m.name}",${p.lat},${p.lon},${m.type}`)).join('\n');
      U.download('salehiMaps-' + stamp + '.csv', x, 'text/csv');
    } else if (format === 'geojson') {
      const feats = items.map(m => ({
        type: 'Feature', properties: { name: m.name, type: m.type }, geometry: m.type === 'waypoint'
          ? { type: 'Point', coordinates: [m.points[0].lon, m.points[0].lat] }
          : m.type === 'area' ? { type: 'Polygon', coordinates: [m.points.map(p => [p.lon, p.lat])] }
            : { type: 'LineString', coordinates: m.points.map(p => [p.lon, p.lat]) }
      }));
      U.download('salehiMaps-' + stamp + '.geojson', JSON.stringify({ type: 'FeatureCollection', features: feats }, null, 2), 'application/geo+json');
    }
  };
  L.search = function (q) {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const byName = S.state.landmarks.filter(m => (m.name || '').toLowerCase().includes(needle)).map(m => ({ kind: 'mark', item: m }));
    const c = U.parseCoord(q);
    return c ? byName.concat([{ kind: 'coord', item: c }]) : byName;
  };

  /* ---------- measure tool ---------- */
  const measure = SM.measure = { active: false, points: [], result: null };
  measure.start = function () { measure.active = true; measure.points = []; M.draw(); SM.ui.toast('انقر على الخريطة لقياس المسافة - انقر نقراً مزدوجاً للإنهاء'); };
  measure.stop = function () { measure.active = false; if (measure.points.length > 1) { const a = measure.points[0], b = measure.points[measure.points.length - 1]; measure.result = { dist: U.distance(a, b), brg: U.bearing(a, b) }; } M.draw(); return measure.result; };
  measure.add = function (p) { measure.points.push(p); M.draw(); if (measure.points.length === 1) SM.ui.toast('انقر نقطة أخرى…'); };
  measure.draw = function (ctx) {
    if (!measure.active || !measure.points.length) return;
    ctx.save(); ctx.strokeStyle = '#ffeb3b'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.beginPath();
    measure.points.forEach((p, i) => { const s = M.geoToScreen(p.lat, p.lon); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    ctx.stroke(); ctx.setLineDash([]);
    let total = 0;
    measure.points.forEach((p, i) => {
      const s = M.geoToScreen(p.lat, p.lon);
      if (i) total += U.distance(measure.points[i - 1], p);
      ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fillStyle = '#ffeb3b'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif';
      ctx.fillText(U.formatDistance(total, S.state.config.unit === 'imperial'), s.x + 7, s.y - 7);
    });
    if (measure.points.length > 1) {
      const a = measure.points[0], b = measure.points[measure.points.length - 1];
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`${U.formatDistance(U.distance(a, b), S.state.config.unit === 'imperial')}  ${U.formatBearing(U.bearing(a, b))}`, 12, M.h - 92);
    }
    ctx.restore();
  };
})(window);
