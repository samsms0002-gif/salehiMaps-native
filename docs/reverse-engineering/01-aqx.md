# صيغة AQX

AQX هو ملف XML يصف مصادر الخرائط (الأونلاين والمحلية) وطبقاتها. يتم كشفه بالبادئة `<aqx`.

## البنية العامة

```xml
<?xml version="1.0" encoding="utf-8"?>
<aqx version="12" revision="5">
  <name>Google Maps</name>
  <description>...</description>
  <param name="google-m">800000000</param>

  <source id="GMAPS" logo="google" type="roads" region="world"
          allow-export="false" allow-bulk-download="false">
    <name>Google Map</name>
    <data-source><![CDATA[http://maps.google.com/]]></data-source>
    <preview-location>5.90,44.80,12</preview-location>
    <zoom-levels z="1-19" china-offset="true">
      <update-delay>1M</update-delay>
      <referer><![CDATA[http://maps.google.com/]]></referer>
      <server><![CDATA[http://mt0.google.com/vt/lyrs=m@{$param:google-m}&x={$x}&y={$y}&z={$z}&s={$s}]]></server>
    </zoom-levels>
  </source>

  <composite-source id="GHYBRID" type="hybrid" region="world">
    <name>Google Hybrid</name>
    <layer id="GEARTH"/>
    <layer id="GROADS"/>
  </composite-source>
</aqx>
```

## عناصر الجذر

| العنصر/السمة | المعنى |
|---|---|
| `version` | إصدار تنسيق AQX. القارئ المرجعي يرفض ما فوق `13`. |
| `revision` | مراجعة اختيارية، افتراضية `0`. |
| `name` | اسم مجموعة الخرائط. |
| `description`, `region`, `copyright` | بيانات وصفية. |
| `param name="..."` | متغير قابل للاستخدام في قوالب الروابط. |
| `import-crs-txt-def`, `import-ogc-wkt-def` | تعريف إحداثيات مستورد. |

## `<source>`

السمات المدعومة:

`id`, `layer` / `islayer`, `hd`, `visible`, `deprecated`, `allow-export`, `allow-bulk-download`, `fill-with-previous-levels`, `opacity`, `blending`, `logo`, `type`, `region`, `underscales`, `overscales`, `cache-expiration`.

العناصر الفرعية:

- `name`, `description`, `data-source`, `copyright`
- `outline` — حدود المنطقة.
- `default-location` — الموقع الافتراضي.
- `preview-location` — بالصيغة `lon,lat,zoom`. مثال: `5.90,44.80,12`.
- `preview-url`
- `variable set="..."` — تعريف متغير.
- `level` / `zoom-level` / `zoom-levels` / `zoom-values` — نطاقات الزوم والخواص المرتبطة بها.
  - السمة `z` تقبل قائمة أو مدى مثل `1-19` و `1,5,10-12`.
  - `ots` يحدد ترتيب خادم/بروتوكول خاص.
  - `china-offset="true"` يفعّل تصحيح إزاحة الصين.
- `server` — قالب URL، ويمكن تكراره لأكثر من خادم.
- `referer`, `update-delay`.

## `<composite-source>`

يجمع عدة مصادر فرعية عبر `<layer id="..."/>`. عند التحميل يتم حل المعرّفات إلى مصادر فعلية، ويُهمل المركّب إذا لم يتبقَّ طبقات صالحة.

## متغيرات قوالب الروابط

| المتغير | المعنى |
|---|---|
| `{$x}`, `{$y}`, `{$z}` | إحداثيات البلاطة Web Mercator. |
| `{$s}` | رقم الخادم/المفرقح العشوائي. |
| `{$ms}` | لاحقة خاصة ببروتوكول Google (مشتقة من `x`,`y`). |
| `{$param:NAME}` | قيمة `<param name="NAME">`. |
| `{$ptc}`, `{$app-c}` | معاملات خدمة الخرائط الخاصة بالمرجع. |
| `{$srv}` | مسار الخادم المحلي للملفات المرافقة مثل `.PREVIEW`. |

## قواعد مهمة للمطابقة

1. لا يُحوّل `http` إلى `https` تلقائياً؛ الرابط يُستخدم كما هو.
2. `preview-location` يُقرأ `lon,lat,zoom` وليس `lat,lon`.
3. يجب أن يبقى ترتيب `<server>` كما في الملف لأنه يحدد ترتيب المحاولة.
4. القيم المنطقية تقبل `true` و `1` و `false` و `0`.
