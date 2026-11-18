# salehiMaps

> نسخة المستودع على GitHub: انسخ بيانات الخرائط الأصلية يدوياً كما هو موضح في [DATA.md](DATA.md).


تطبيق خرائط بدون اتصال للهاتف والكمبيوتر، مبني ليعمل مع **نفس مخطط ملفات** تطبيق
All-In-One OfflineMaps / AlpineQuest الذي زوّدتنا بمجلد `files` الخاص به.

## التشغيل

- **سطح المكتب:** افتح `index.html` مباشرة في المتصفح (لا يحتاج خادماً)، أو شغّل
  `sh start-server.sh` وافتح `http://localhost:8765/`.
- **الهاتف:** انسخ مجلد `salehiMaps` كاملاً إلى الهاتف، ثم افتح `index.html` من مدير الملفات،
  أو افتح الرابط المحلي عبر `start-server.sh` وثبّت التطبيق كـ PWA.
- بعد الفتح: من قائمة **التطبيق ← اختيار مجلد البيانات** اختر مجلد `files` (أو المجلد الذي يحتويه)،
  ثم من **الخرائط ← مسح بيانات الخرائط الأصلية** سيتم التعرف على الخرائط تلقائياً.

## ما الذي يقرأه من مجلد `files` (أو `data` حسب مكان نسخ البيانات)

| الملف | المعالجة |
|---|---|
| `datastore/maps/*.AQX` | يُقرأ كتعريف مصادر الخرائط (أسماء، روابط البلاطات، مستويات التكبير) |
| `datastore/maps/*.DAT` + `*.IDX` | فهرسة مباشرة لبلاطات الخريطة؛ كل سجل يحتوي على `z/x/y` ثم صورة PNG |
| `*.PREVIEW` | صور معاينة الخرائط |
| `*.AQB`, `*.AQE` | يُعرض وصفها؛ تحويلها يحتاج أدوات التطبيق الأصلي |
| `landmarks/`, `pictures/`, `icons/`, `logs/`, `backups/`, `exports/`, `audios/` | نفس مخطط المجلدات الأصلي |
| GPX / KML / KMZ / GeoJSON / CSV / TSV | استيراد وتصدير المعالم |
| ZIP (XYZ/TMS), صور `.map` معايرة OZI, MBTiles/GPKG/QCT (عبر `tools/import_maps.py`) | طبقات خرائط إضافية |

### صيغة `.DAT` المكتشفة

السجل يبدأ قبل صورة PNG بـ 61 بايت:

```
offset +0  : 01                     (علامة السجل)
offset +2  : x  (24-bit big endian)
offset +6  : y  (24-bit big endian)
offset +12 : z  (بايت واحد)
offset +24 : a1 c2 ...              (توقيع السجل)
offset +61 : PNG data               (256x256)، ثم حشو أصفار حتى السجل التالي
```

تم التحقق من ذلك على `GOOGLE.AQX.GROADS.DAT` (65,463 بلاطة، z=1..20) و
`OSM.AQX.OSMOMSROADS.DAT` (118 بلاطة).

## الأدوات

```bash
python3 tools/import_maps.py --inspect files/datastore/maps
python3 tools/import_maps.py --dat files/datastore/maps/GOOGLE.AQX.GROADS.DAT --out maps/GOOGLE
python3 tools/import_maps.py --sql mymap.mbtiles --out maps/MYMAP --tms
python3 tools/make_icons.py
```

## الملفات

- `index.html`, `css/style.css` — الواجهة العربية المتجاوبة
- `js/util.js` — الرياضيات الجغرافية وصيغ الإحداثيات وقراءة ZIP
- `js/storage.js` — مخطط المجلدات، مساحات العمل، النسخ الاحتياطي
- `js/maps.js` — محرك البلاطات والصور المعايرة والشبكات
- `js/aqx.js` — قارئ ملفات التطبيق الأصلي (AQX/DAT/IDX/PREVIEW/AQE)
- `js/landmarks.js` — المعالم والقياس
- `js/ui.js`, `js/app.js` — القوائم والتفاعل و GPS

> ملاحظة: التطبيق مبني كـ PWA لأن بيئة البناء المتاحة لا تحتوي على Android SDK؛
> لذلك لا يوجد ملف APK، لكنه يعمل على أي متصفح حديث في الهاتف والكمبيوتر وبدون اتصال.
