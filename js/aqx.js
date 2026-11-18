/* salehiMaps - reader for the original application data files:
   *.AQX (map source definitions), *.DAT/*.IDX (offline tile store),
   *.PREVIEW (map thumbnails), *.AQB (compiled maps), *.AQE (elevation)   */
(function (global) {
  'use strict';
  const SM = global.SM, U = SM.util, S = SM.storage, M = SM.maps;
  const A = SM.aqx = {};
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  A.indexes = {};     // DAT path -> {entries:Map<key,{off,next}>, zmin,zmax,bounds}
  A.sources = [];     // parsed AQX sources

  function key(z, x, y) { return z + '/' + x + '/' + y; }
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('salehiMaps-aqx', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('indexes');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  A.loadIndex = async function (name) {
    try {
      const d = await idb();
      const o = await new Promise(res => { const r = d.transaction('indexes').objectStore('indexes').get(name); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      if (!o) return null;
      return { file: null, entries: new Map(o.entries), zmin: o.zmin, zmax: o.zmax, count: o.count, cached: true };
    } catch (e) { return null; }
  };
  A.saveIndex = async function (name, idx) {
    try {
      const d = await idb();
      const o = { entries: Array.from(idx.entries.entries()), zmin: idx.zmin, zmax: idx.zmax, count: idx.count };
      await new Promise(res => { const t = d.transaction('indexes', 'readwrite'); t.objectStore('indexes').put(o, name); t.oncomplete = res; t.onerror = res; });
    } catch (e) { /* storage optional */ }
  };
  function matchSig(buf, at) {
    for (let i = 0; i < 8; i++) if (buf[at + i] !== PNG[i]) return false;
    return true;
  }

  /* scan a .DAT file in chunks; builds an index without loading the whole file */
  A.scanDat = async function (file, onProgress) {
    if (A.indexes[file.name]) return A.indexes[file.name];
    const cached = await A.loadIndex(file.name);
    if (cached) {
      cached.file = file;
      A.indexes[file.name] = cached;
      if (onProgress) onProgress(100);
      return cached;
    }
    const size = file.size;
    const CHUNK = 8 * 1024 * 1024, OVER = 128;
    const raw = [];
    let carry = new Uint8Array(0), base = 0, scannedUntil = 0;
    for (let start = 0; start < size; start += CHUNK) {
      const end = Math.min(size, start + CHUNK);
      const buf = new Uint8Array(await file.slice(start, end).arrayBuffer());
      const all = new Uint8Array(carry.length + buf.length);
      all.set(carry); all.set(buf, carry.length);
      const allBase = base - carry.length;
      let i = all.indexOf(0x89);
      while (i >= 0 && i + 8 <= all.length) {
        if (matchSig(all, i)) {
          const p = allBase + i;
          const h = p - 61 - allBase;
          if (p >= 64 && p >= scannedUntil && h >= 0 && h + 28 <= all.length && all[h] === 1 && all[h + 24] === 0xa1) {
            const x = (all[h + 2] << 16) | (all[h + 3] << 8) | all[h + 4];
            const y = (all[h + 6] << 16) | (all[h + 7] << 8) | all[h + 8];
            const z = all[h + 12];
            if (z && z <= 22) raw.push({ p, z, x, y });
          }
        }
        i = all.indexOf(0x89, i + 1);
      }
      carry = all.subarray(Math.max(0, all.length - OVER));
      base = end;
      scannedUntil = Math.max(scannedUntil, end - 7);
      if (onProgress) onProgress(Math.round(end / size * 100));
    }
    raw.sort((a, b) => a.p - b.p);
    const entries = new Map();
    let zmin = 99, zmax = 0;
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i];
      entries.set(key(r.z, r.x, r.y), { off: r.p, next: raw[i + 1] ? raw[i + 1].p : size });
      zmin = Math.min(zmin, r.z); zmax = Math.max(zmax, r.z);
    }
    const idx = { file, entries, zmin: zmin === 99 ? 0 : zmin, zmax, count: entries.size };
    A.indexes[file.name] = idx;
    A.saveIndex(file.name, idx);
    return idx;
  };

  A.getDatTileURL = async function (idx, z, x, y) {
    const e = idx.entries.get(key(z, x, y));
    if (!e) return null;
    const blob = idx.file.slice(e.off, Math.min(e.next, e.off + 1024 * 1024));
    return URL.createObjectURL(blob);
  };

  /* parse AQX XML: map source list with tile URL templates */
  A.parseAQX = function (text, filename) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const root = doc.documentElement;
    if (!root || root.tagName.toLowerCase() !== 'aqx') return [];
    const params = {};
    Array.from(root.children).forEach(ch => {
      if (ch.tagName.toLowerCase() === 'param') params[ch.getAttribute('name')] = ch.textContent.trim();
    });
    const tag = (el, name) => el.getElementsByTagName(name)[0]?.textContent?.trim() || '';
    const out = [];
    Array.from(root.getElementsByTagName('source')).forEach(src => {
      const id = src.getAttribute('id') || 'MAP';
      const servers = Array.from(src.getElementsByTagName('server')).map(s => s.textContent.trim());
      const zl = src.getElementsByTagName('zoom-levels')[0];
      const zr = zl?.getAttribute('z') || '0-22';
      const zm = zr.match(/(\d+)\s*-\s*(\d+)/);
      const preview = tag(src, 'preview-location').split(',').map(Number);
      const url = (servers[0] || '').replace(/\{\$param:([^}]+)\}/g, (m, p) => params[p] || '')
        .replace(/\{\$ms\}/g, '').replace(/\{\$s\}/g, '0')
        .replace(/\{x\}/g, '{x}').replace(/\{y\}/g, '{y}').replace(/\{z\}/g, '{z}')
        .replace(/^https?:/, 'https:');
      out.push({
        id, name: tag(src, 'name') || id, type: src.getAttribute('type') || '',
        url, servers, minZoom: zm ? +zm[1] : 0, maxZoom: zm ? +zm[2] : 22,
        preview: { lat: preview[0], lon: preview[1], zoom: preview[2] },
        file: filename, source: src.getAttribute('data-source') || ''
      });
    });
    return out;
  };

  /* index a DAT only when the user actually enables that map */
  A.ensureIndex = async function (m, onProgress) {
    if (m.source && m.source.idx) return m.source.idx;
    const entry = S.find('datastore/maps/' + m.source.dat) || S.state.files.find(f => f.file.name === m.source.dat);
    if (!entry) throw new Error('ملف الخريطة غير موجود: ' + m.source.dat);
    const idx = await A.scanDat(entry.file, p => { if (onProgress) onProgress('جاري فهرسة ' + m.source.dat + ' ' + p + '%'); });
    m.source.idx = idx;
    m.meta.minZoom = idx.zmin; m.meta.maxZoom = idx.zmax; m.meta.tiles = idx.count;
    return idx;
  };

  A.scan = async function (onProgress) {
    const files = S.list('datastore/maps');
    const previews = files.filter(f => /\.preview$/i.test(f.file.name));
    const dats = files.filter(f => /\.dat$/i.test(f.file.name));
    const aqxs = files.filter(f => /\.aqx$/i.test(f.file.name) && f.file.size > 0);
    const aqbs = files.filter(f => /\.aqb$/i.test(f.file.name));
    A.sources = [];
    for (const e of aqxs) {
      try { A.sources.push(...A.parseAQX(await U.readText(e.file), e.file.name)); } catch (e2) { console.warn(e2); }
    }
    const stored = [];
    for (const e of dats) {
      const name = e.file.name.replace(/\.DAT$/i, '');
      const src = A.sources.find(s => name.startsWith(s.id + '.AQX.')) || A.sources.find(s => name.startsWith(s.id + '.AQX'));
      const cached = A.indexes[e.file.name];
      stored.push({
        id: name, name: name.replace(/\.AQX\./g, ' – ').replace(/_/g, ' '),
        type: 'aqxdat', source: { type: 'aqxdat', dat: e.file.name, idx: cached || null },
        size: e.file.size,
        meta: {
          minZoom: cached ? cached.zmin : 0, maxZoom: cached ? cached.zmax : 22,
          tiles: cached ? cached.count : null,
          preview: src?.preview, attribution: src?.source || 'All-In-One OfflineMaps',
          previewFile: previews.find(p => p.file.name === e.file.name + '.PREVIEW')?.path || null
        },
        visible: false, opacity: 1, contrast: 100, saturation: 100
      });
    }
    return {
      sources: A.sources, stored,
      aqb: aqbs.map(f => ({ name: f.file.name, size: f.file.size, path: f.path })),
      previewCount: previews.length
    };
  };

  /* elevation (.AQE) - reads the DEM grid header at a coordinate */
  A.readAQE = async function (file) {
    const buf = new Uint8Array(await file.slice(0, 256).arrayBuffer());
    const dv = new DataView(buf.buffer);
    if (new TextDecoder().decode(buf.subarray(0, 4)) !== 'AQE:') return null;
    return { magic: 'AQE', version: dv.getUint32(4, true), size: file.size, name: file.name };
  };
})(window);
