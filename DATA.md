# بيانات الخرائط

هذا المستودع يحتوي على شيفرة تطبيق salehiMaps ووثائقه فقط، دون ملفات الخرائط الأصلية الكبيرة.

لإعادة ربط البيانات الأصلية بعد الاستنساخ:

1. انسخ محتويات مجلد `files` (أو `data`) من نسخة الهاتف إلى جذر هذا المستودع.
2. يجب أن يظهر الهيكل التالي:

```text
files/datastore/maps/GOOGLE.AQX
files/datastore/maps/GOOGLE.AQX.GROADS.DAT
files/datastore/maps/GOOGLE.AQX.GROADS.IDX
files/datastore/maps/GOOGLE.AQX.GROADS.PREVIEW
files/datastore/dem/N10E040.AQE
files/landmarks/
files/icons/
files/logs/
```

3. افتح `index.html`، ثم من **التطبيق ← اختيار مجلد البيانات** اختر مجلد `files`.
4. من **الخرائط ← مسح بيانات الخرائط الأصلية** تظهر الخرائط المStored، ثم اضغط **إضافة** لفهرسة ملف `DAT` وعرضه.

الملفات المستبعدة من Git: `*.DAT`, `*.IDX`, `*.AQB`, `*.AQE`, `*.PREVIEW`.
