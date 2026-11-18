/* salehiMaps - common geodesy and helper functions */
(function (global) {
  'use strict';
  const SM = global.SM = global.SM || {};
  const U = SM.util = {};
  const R = Math.PI / 180, D = 180 / Math.PI;

  U.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  U.round = (v, n) => { const p = Math.pow(10, n); return Math.round(v * p) / p; };
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  U.lon2tile = (lon, z) => (lon + 180) / 360 * Math.pow(2, z);
  U.lat2tile = (lat, z) => (1 - Math.log(Math.tan(lat * R) + 1 / Math.cos(lat * R)) / Math.PI) / 2 * Math.pow(2, z);
  U.tile2lon = (x, z) => x / Math.pow(2, z) * 360 - 180;
  U.tile2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return D * Math.atan(Math.sinh(n)); };

  U.distance = (a, b) => {
    const dLat = (b.lat - a.lat) * R, dLon = (b.lon - a.lon) * R;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLon / 2) ** 2;
    return 6371008.8 * 2 * Math.asin(Math.sqrt(s));
  };
  U.bearing = (a, b) => {
    const p1 = a.lat * R, p2 = b.lat * R, dl = (b.lon - a.lon) * R;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * D + 360) % 360;
  };
  U.destination = (p, dist, brg) => {
    const d = dist / 6371008.8, b = brg * R, p1 = p.lat * R, l1 = p.lon * R;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 * D, lon: ((l2 * D + 540) % 360) - 180 };
  };
  U.formatDistance = (m, imperial) => imperial
    ? (m < 1609 ? `${Math.round(m * 3.28084)} ft` : `${U.round(m / 1609.344, 2)} mi`)
    : (m < 1000 ? `${Math.round(m)} m` : `${U.round(m / 1000, 2)} km`);
  U.formatBearing = deg => `${Math.round(deg)}° ${U.compass(deg)}`;
  U.compass = d => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(d / 22.5) % 16];

  U.toDMS = (v, isLat) => {
    const h = v < 0 ? (isLat ? 'S' : 'W') : (isLat ? 'N' : 'E');
    v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), s = ((v - d) * 60 - m) * 60;
    return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(2).padStart(5, '0')}″${h}`;
  };
  U.toDM = (v, isLat) => {
    const h = v < 0 ? (isLat ? 'S' : 'W') : (isLat ? 'N' : 'E');
    v = Math.abs(v); const d = Math.floor(v), m = ((v - d) * 60);
    return `${d}°${m.toFixed(4)}′${h}`;
  };

  /* WGS84 UTM / MGRS / USNG conversion (used by the coordinates information box) */
  U.latLonToUTM = (lat, lon) => {
    lat = U.clamp(lat, -80, 84); lon = ((lon + 180) % 360 + 360) % 360 - 180;
    const zone = Math.floor((lon + 180) / 6) + 1;
    const lon0 = (zone - 1) * 6 - 180 + 3;
    const e = 0.006819238, a = 6378137, k0 = 0.9996;
    const N = a / Math.sqrt(1 - e * Math.sin(lat * R) ** 2);
    const T = Math.tan(lat * R) ** 2, C = e / (1 - e) * Math.cos(lat * R) ** 2;
    const A = Math.cos(lat * R) * (lon - lon0) * R;
    const M = a * ((1 - e / 4 - 3 * e * e / 64 - 5 * e ** 3 / 256) * lat * R
      - (3 * e / 8 + 3 * e * e / 32 + 45 * e ** 3 / 1024) * Math.sin(2 * lat * R)
      + (15 * e * e / 256 + 45 * e ** 3 / 1024) * Math.sin(4 * lat * R)
      - (35 * e ** 3 / 3072) * Math.sin(6 * lat * R));
    const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * e) * A ** 5 / 120) + 500000;
    let y = k0 * (M + N * Math.tan(lat * R) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * e) * A ** 6 / 720));
    if (lat < 0) y += 10000000;
    const letters = 'CDEFGHJKLMNPQRSTUVWX';
    const band = letters[U.clamp(Math.floor((lat + 80) / 8), 0, letters.length - 1)];
    return { zone, band, east: x, north: y };
  };
  U.utmToLatLon = (zone, north, east, south) => {
    const a = 6378137, e = 0.006819238, e2 = e / (1 - e), k0 = 0.9996;
    const x = east - 500000, y = south ? north - 10000000 : north;
    const m = y / k0, mu = m / (a * (1 - e / 4 - 3 * e * e / 64 - 5 * e ** 3 / 256));
    const e1 = (1 - Math.sqrt(1 - e)) / (1 + Math.sqrt(1 - e));
    let phi = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
    const N = a / Math.sqrt(1 - e * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2;
    const C = e2 * Math.cos(phi) ** 2, Rr = a * (1 - e) / Math.pow(1 - e * Math.sin(phi) ** 2, 1.5);
    const lon0 = (zone - 1) * 6 - 180 + 3;
    let lon = (x - (1 - T + C) * x ** 3 / (6 * N * N) - (5 - 18 * T + T * T + 72 * C - 58 * e2) * x ** 5 / (120 * N ** 4))
      / (N * Math.cos(phi)) / R + lon0;
    let lat = phi - (N * Math.tan(phi) / Rr) * (x * x / 2 - (5 + 3 * T + 10 * C - 4 * C * C - 9 * e2) * x ** 4 / (24 * N * N)
      + (61 + 90 * T + 298 * C + 45 * T * T - 252 * e2 - 3 * C * C) * x ** 6 / (720 * N ** 4));
    return { lat: lat * D, lon: ((lon * D + 540) % 360) - 180 };
  };
  U.MGRS_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V'];
  U.utmToMGRS = (utm, precision) => {
    precision = precision == null ? 5 : precision;
    const set = (utm.zone - 1) % 3;
    const col = ((Math.floor(utm.east / 100000) - 1) % 8 + 8) % 8;
    const rowL = 'ABCDEFGHJKLMNPQRSTUV';
    const row = Math.floor(utm.north / 100000) % 20;
    const e = Math.floor(utm.east % 100000), n = Math.floor(utm.north % 100000);
    const step = Math.pow(10, 5 - precision);
    return `${utm.zone}${utm.band}${U.MGRS_LABELS[set * 8 + col]}${rowL[row]} ${String(Math.floor(e / step)).padStart(precision, '0')}${String(Math.floor(n / step)).padStart(precision, '0')}`;
  };

  U.formatCoord = (lat, lon, fmt) => {
    switch (fmt) {
      case 'dms': return `${U.toDMS(lat, true)}  ${U.toDMS(lon, false)}`;
      case 'dm': return `${U.toDM(lat, true)}  ${U.toDM(lon, false)}`;
      case 'utm': { const u = U.latLonToUTM(lat, lon); return `UTM ${u.zone}${u.band} E${Math.round(u.east)} N${Math.round(u.north)}`; }
      case 'mgrs': case 'usng': return U.utmToMGRS(U.latLonToUTM(lat, lon), 5);
      default: return `${U.round(lat, 6)}°, ${U.round(lon, 6)}°`;
    }
  };

  /* Parse a coordinate string: decimal, DMS, UTM/MGRS/USNG */
  U.parseCoord = str => {
    if (!str) return null;
    let s = String(str).trim().replace(/[°′″'"NSEW]\s*/gi, m => m.toUpperCase().replace(/\s/g, '') + ' ').replace(/\s+/g, ' ').trim();
    let m = s.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat: +m[1], lon: +m[2] };
    m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (m && Math.abs(+m[1]) <= 90 && Math.abs(+m[2]) <= 180) return { lat: +m[1], lon: +m[2] };
    const dms = txt => {
      const mm = txt.match(/(\d+)\D+(\d+(?:\.\d+)?)?\D*(\d+(?:\.\d+)?)?\s*([NSEW])?/i);
      if (!mm) return null;
      let v = +mm[1] + (+(mm[2] || 0)) / 60 + (+(mm[3] || 0)) / 3600;
      if ((mm[4] || '').toUpperCase() === 'S' || (mm[4] || '').toUpperCase() === 'W') v = -v;
      return v;
    };
    if (/[NSEW]/i.test(s)) {
      const parts = s.match(/([^NSEW]+[NSEW])\s*([^NSEW]+[NSEW])?/i);
      if (parts) {
        const a = dms(parts[1]), b = parts[2] ? dms(parts[2]) : null;
        if (a != null && b != null) return /[NS]/i.test(parts[1]) ? { lat: a, lon: b } : { lat: b, lon: a };
      }
    }
    m = s.match(/^(\d{1,2})([C-HJ-NP-X])?\s*([A-Z])\s*([A-Z])\s*(\d+)\s*(\d+)$/i);
    if (m) {
      const zone = +m[1], band = (m[2] || 'N').toUpperCase();
      const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const set = (zone - 1) % 3;
      const colIdx = letters.indexOf(m[3].toUpperCase()) - set * 8;
      const rowIdx = letters.indexOf(m[4].toUpperCase());
      const east = (colIdx + 1) * 100000 + +m[5];
      const north = rowIdx * 100000 + +m[6];
      const base = U.utmToLatLon(zone, north, east, 'CDEFGHJKLMNPQRSTUVWX'.indexOf(band) < 10);
      return base;
    }
    m = s.match(/^UTM\s*(\d{1,2})([A-Z])?\s*E?\s*(\d+(?:\.\d+)?)\s*N?\s*(\d+(?:\.\d+)?)$/i);
    if (m) return U.utmToLatLon(+m[1], +m[4], +m[3], /[C-HJ-M]/.test((m[2] || 'N').toUpperCase()));
    return null;
  };

  U.uid = () => 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  U.download = (name, text, mime) => {
    const blob = text instanceof Blob ? text : new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  U.readFile = file => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file);
  });
  U.readText = file => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file);
  });
  U.debounce = (fn, ms) => { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(this, a), ms); }; };

  /* minimal unzip (stored + deflate via DecompressionStream) */
  U.unzip = async function (buffer) {
    const dv = new DataView(buffer), bytes = new Uint8Array(buffer);
    let off = 0;
    while (off + 4 <= bytes.length && dv.getUint32(off, true) !== 0x04034b50) {
      if (dv.getUint32(off, true) === 0x02014b50) break;
      off++;
    }
    const out = {};
    while (off + 30 <= bytes.length && dv.getUint32(off, true) === 0x04034b50) {
      const method = dv.getUint16(off + 8, true);
      let csize = dv.getUint32(off + 18, true), usize = dv.getUint32(off + 22, true);
      const nlen = dv.getUint16(off + 26, true), elen = dv.getUint16(off + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(off + 30, off + 30 + nlen));
      let data = bytes.subarray(off + 30 + nlen + elen, off + 30 + nlen + elen + csize);
      if (dv.getUint16(off + 6, true) & 8) {
        const full = new Uint8Array(off + 30 + nlen + elen + csize);
        full.set(data); data = full.subarray(off + 30 + nlen + elen);
      }
      try {
        if (method === 8 && typeof DecompressionStream !== 'undefined') {
          const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
          data = new Uint8Array(await new Response(stream).arrayBuffer());
        } else if (method === 8) throw new Error('deflate غير مدعوم في هذا المتصفح');
        if (usize && data.length !== usize) data = data.subarray(0, usize);
        out[name] = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      } catch (e) { console.warn('unzip', name, e); }
      if (dv.getUint32(off + 30 + nlen + elen + csize, true) === 0x08074b50) csize += 12;
      off += 30 + nlen + elen + csize;
    }
    return out;
  };
})(window);
