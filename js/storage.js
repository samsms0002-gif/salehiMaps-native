/* salehiMaps - data storage: mirrors the original application folder schema
   /datastore /icons /landmarks /logs /pictures /maps /workspaces /backups        */
(function (global) {
  'use strict';
  const SM = global.SM, U = SM.util;
  const S = SM.storage = {};
  const SCHEMA = S.schema = ['datastore', 'icons', 'landmarks', 'logs', 'pictures', 'maps', 'workspaces', 'backups', 'exports', 'audios'];
  const KEY = 'salehiMaps.v1';

  S.state = {
    rootHandle: null,          // File System Access API (desktop Chrome/Edge)
    files: [],                 // fallback: flat list {path, file} from <input webkitdirectory>
    mode: 'memory',            // 'fsapi' | 'files' | 'demo'
    config: {
      appName: 'salehiMaps',
      unit: 'metric',
      coordFormat: 'decimal',
      showSlider: true,
      showGrids: false,
      localOnly: false,
      markerLabels: true,
      lineWidth: 3,
      showStatusBar: true,
      layerOpacity: 1,
      maxCache: 600,
      workspace: 'default'
    },
    layers: [],
    landmarks: [],
    workspaces: { default: { name: 'افتراضي' } },
    target: null,
    view: { lat: 24.7136, lon: 46.6753, zoom: 6, rotation: 0 },
    workspaceData: {}
  };
  /* normalise paths no matter which folder the user selected */
  const LEAD = /^(files|data|salehiMaps|خرائط|OfflineMaps)\//i;
  function normalize(p) {
    p = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
    let guard = 0;
    while (LEAD.test(p) && guard++ < 6) p = p.replace(LEAD, '');
    return p;
  }
  S.normalize = normalize;

  /* ---------- localStorage state ---------- */
  S.save = function () {
    try {
      const o = {
        config: S.state.config,
        layers: S.state.layers.map(l => {
          let source = l.source;
          if (source && source.idx) source = Object.assign({}, source, { idx: null });
          return {
            id: l.id, name: l.name, type: l.type, visible: l.visible, opacity: l.opacity,
            contrast: l.contrast, saturation: l.saturation, source, bounds: l.bounds,
            meta: l.meta, builtin: l.builtin, calibration: l.calibration
          };
        }),
        landmarks: S.state.landmarks,
        workspaces: S.state.workspaces,
        target: S.state.target,
        view: S.state.view,
        workspaceData: S.state.workspaceData
      };
      localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) { console.warn('save', e); }
  };
  S.load = function () {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!o) return;
      Object.assign(S.state.config, o.config || {});
      S.state.layers = o.layers || [];
      S.state.landmarks = o.landmarks || [];
      S.state.workspaces = o.workspaces || S.state.workspaces;
      S.state.target = o.target || null;
      if (o.view) Object.assign(S.state.view, o.view);
      if (o.workspaceData) S.state.workspaceData = o.workspaceData;
    } catch (e) { console.warn('load', e); }
  };

  /* ---------- IndexedDB handle persistence ---------- */
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('salehiMaps-fs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('handles');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  S.saveHandle = async function (h) {
    const d = await db();
    await new Promise((res, rej) => { const t = d.transaction('handles', 'readwrite'); t.objectStore('handles').put(h, 'root'); t.oncomplete = res; t.onerror = rej; });
  };
  S.getHandle = async function () {
    try {
      const d = await db();
      return await new Promise(res => { const t = d.transaction('handles'); const r = t.objectStore('handles').get('root'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
    } catch (e) { return null; }
  };

  /* ---------- root folder selection ---------- */
  S.pickFolder = async function () {
    if (window.showDirectoryPicker) {
      const h = await window.showDirectoryPicker({ mode: 'readwrite' });
      S.state.rootHandle = h; S.state.mode = 'fsapi';
      await S.saveHandle(h);
      await S.scanFsApi();
      return h.name;
    }
    U.$('#folderInput').click();
    return null;
  };
  S.scanFsApi = async function () {
    const files = [];
    async function walk(dir, prefix) {
      for await (const [name, handle] of dir.entries()) {
        const path = prefix ? prefix + '/' + name : name;
        if (handle.kind === 'file') files.push({ path: normalize(path), file: await handle.getFile(), handle });
        else await walk(handle, path);
      }
    }
    if (S.state.rootHandle) await walk(S.state.rootHandle, '');
    S.state.files = files;
    return files;
  };
  S.importFileList = async function (fileList) {
    S.state.files = [];
    for (const f of Array.from(fileList)) {
      const path = normalize(f.webkitRelativePath || f.name);
      S.state.files.push({ path, file: f });
    }
    if (!S.state.files.length) return;
    if (S.state.mode === 'fsapi') S.state.mode = 'fsapi'; else S.state.mode = 'files';
    // derive root name (folder selection gives "rootName/sub/...")
    return S.state.files[0].path.split('/')[0];
  };
  S.restoreHandle = async function () {
    const h = await S.getHandle();
    if (!h) return false;
    try {
      const perm = await h.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const req = await h.requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') return false;
      }
      S.state.rootHandle = h; S.state.mode = 'fsapi'; await S.scanFsApi(); return true;
    } catch (e) { return false; }
  };

  /* ---------- file access ---------- */
  S.list = function (prefix) {
    if (!prefix) return S.state.files;
    const p = normalize(prefix).replace(/\/$/, '');
    return S.state.files.filter(f => f.path.startsWith(p + '/') || f.path.endsWith('/' + p + '/'));
  };
  S.find = function (path) {
    if (!path) return null;
    const clean = normalize(path);
    const name = clean.split('/').pop();
    return S.state.files.find(f => f.path === clean)
      || S.state.files.find(f => f.path.endsWith('/' + clean))
      || (name ? S.state.files.find(f => f.path.split('/').pop() === name) : null);
  };
  S.fileURL = function (path) {
    const e = S.find(path);
    return e ? URL.createObjectURL(e.file) : null;
  };
  S.text = async function (path) {
    const e = S.find(path); return e ? await U.readText(e.file) : null;
  };
  S.hasSchema = function () {
    if (S.state.mode === 'fsapi' || S.state.mode === 'files') {
      return S.list().some(f => SCHEMA.some(d => f.path.includes('/' + d + '/') || f.path.startsWith(d + '/')));
    }
    return true;
  };
  S.schemaReport = function () {
    return SCHEMA.map(d => ({ name: d, count: S.list(d).length }));
  };

  /* write through File System Access API (desktop only) */
  S.writeFile = async function (relPath, data) {
    if (!S.state.rootHandle) return false;
    const parts = relPath.split('/'); const name = parts.pop();
    let dir = S.state.rootHandle;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(data); await w.close();
    await S.scanFsApi();
    return true;
  };

  /* ---------- backup / restore ---------- */
  S.exportBackup = function () {
    const payload = {
      app: 'salehiMaps', version: 1, created: new Date().toISOString(),
      config: S.state.config, workspaces: S.state.workspaces, workspaceData: S.state.workspaceData,
      layers: S.state.layers, landmarks: S.state.landmarks, target: S.state.target, view: S.state.view
    };
    U.download('salehiMaps-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload, null, 2), 'application/json');
    SM.ui.toast('تم إنشاء النسخة الاحتياطية');
  };
  S.importBackup = async function (file) {
    const o = JSON.parse(await U.readText(file));
    if (o.app !== 'salehiMaps') throw new Error('ملف نسخة احتياطية غير صالح');
    Object.assign(S.state.config, o.config || {});
    S.state.workspaces = o.workspaces || S.state.workspaces;
    S.state.layers = o.layers || [];
    S.state.landmarks = o.landmarks || [];
    S.state.target = o.target || null;
    S.save(); SM.ui.toast('تمت الاستعادة بنجاح');
    return true;
  };

  /* ---------- workspaces ---------- */
  S.newWorkspace = function (name) {
    const id = U.uid();
    S.state.workspaces[id] = { name };
    S.state.config.workspace = id;
    S.state.layers = []; S.state.landmarks = [];
    S.save(); return id;
  };
  S.deleteWorkspace = function (id) {
    if (id === 'default') return;
    delete S.state.workspaces[id];
    if (S.state.config.workspace === id) S.state.config.workspace = 'default';
    S.save();
  };
})(window);
