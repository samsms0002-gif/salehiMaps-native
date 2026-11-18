# maps/
ضع هنا خرائط XYZ/TMS (مجلدات `z/x/y.png`) أو ملفات `.zip` التي تحتوي مجلدات `XYZ` أو `TMS`،
أو صوراً معايرة مع ملف `.map` الخاص بـ OZI.

لتحويل ملفات `.DAT` الأصلية إلى هذا المخطط:

```bash
python3 ../tools/import_maps.py --dat ../files/datastore/maps/OSM.AQX.OSMOMSROADS.DAT --out OSM
```

ثم أضف المسار `maps/OSM` من قائمة «الخرائط ← مجلد XYZ» داخل التطبيق.
