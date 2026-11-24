# نظرة عامة على المرجع المستخرج

## هوية التطبيق المرجعي

| العنصر | القيمة |
|---|---|
| الاسم | AlpineQuest Off-Road Explorer |
| الإصدار | `2.4.0d` (`versionCode=2040000`) |
| الحزمة | `psyberia.alpinequest.bsbcjd` |
| النشاط الرئيسي | `psyberia.alpinequest.full.AlpineQuestActivity` |
| compileSdk | 34 (Android 14) |
| اللغة الافتراضية في الموارد | العربية (`ar`) |

## أدوات الفك المستخدمة

- `apktool 3.0.3` — فك `AndroidManifest.xml` و`resources.arsc` و XML.
- `jadx 1.5.7` — فك `classes.dex` إلى Java للقراءة التحليلية.
- فحص ثنائي مباشر لملفات الخرائط الحقيقية لتأكيد بنية الرؤوس.

## الأصول المرجعية المهمة

| المسار | الوصف |
|---|---|
| `assets/default_map/<zoom>/<x>_<y>.jpg` | شبكة بلاطات احتياطية لـ zoom 1..N |
| `assets/e28y6gqq` | ملف مشفر/معمّى (~1.7MB)؛ الكود يشير إلى AES عبر `aqp2/aes` |
| `classes.dex` | يحتوي على أصناف صيغ الخرائط مثل `aqp2/aqx` و`aqp2/avt` |
| `res/values/strings.xml` | أسماء القوائم والأزرار بالعربية |

## خريطة الأصناف المفيدة للتحليل

| الصنف | الدور |
|---|---|
| `aqp2/avy` | قارئ AQX (أحداث XML، source، zoom-levels، param، preview-location) |
| `aqp2/gqe` | كشف نوع الملف حسب البادئة `<aqx` |
| `aqp2/avt` | قارئ AQB (magic number، مصادر، طبقات، مستويات زوم) |
| `aqp2/gqc` | أسماء أنواع الملفات ("AlpineQuest AQX" / "AlpineQuest AQB") |
| `aqp2/aqb`, `aqp2/aqe` | واجهات داخلية عامة، ليست صيغة ملف بحد ذاتها |
| `aqp2/bmv` | نسخة ExifInterface لتحليل صور JPEG/TIFF |

## ما ينقله `salehiMaps`

نقل **السلوك والمواصفات فقط**:

- نفس ترتيب القوائم: خرائط/طبقات، معالم، إعدادات، نسخ احتياطي.
- نفس مفاتيح الخيارات الداخلية عند الإمكان.
- نفس طريقة قراءة بيانات المستخدم الحقيقية.

لا يُنقل كود التطبيق المرجعي ولا موارده المحمية.
