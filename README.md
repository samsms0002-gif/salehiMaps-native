# salehiMaps

تطبيق خرائط أصلي بنسختين:

- **Android** — مبني على .NET 8 + Avalonia.
- **Windows** — مبني على .NET 8 + Avalonia.

الهدف: قراءة بيانات الخرائط غير المتصلة بصيغ `AQX` و`DAT` و`AQB` و`AQE` و`tiles ZIP`، مع تجربة مستخدم مطابقة قدر الإمكان لتطبيق المرجع الذي تمت دراسته، وباسم وهوية `salehiMaps`.

## مبدأ العمل

تمت دراسة التطبيق المرجعي (المجلد `reference/Alpine`) باستخدام أدوات فك APK لتحديد:

- صيغ الملفات وسلوكها.
- أسماء الإعدادات وقوائم الواجهة.
- ترتيب الطبقات ومعالجة الإحداثيات.

ثم كُتبت النواة والواجهات من الصفر بلغة C#. لا يتم نسخ كود التطبيق المرجعي أو موارده المحمية. يُستخدم المرجع للتحليل فقط.

## هيكل المشروع

```text
salehiMaps/
├─ docs/reverse-engineering/   # مواصفات الصيغ والسلوك المستخرجة بالتحليل
├─ reference/Alpine/           # مرجع فك للقراءة فقط، مستبعد من Git
├─ data/                       # بيانات الخرائط المحلية، مستبعدة من Git
└─ src/
   ├─ salehiMaps.Core/        # قارئ الصيغ + الإحداثيات + إدارة الخرائط
   ├─ salehiMaps.Tests/       # اختبارات الوحدة
   ├─ salehiMaps.Android/     # تطبيق أندرويد
   └─ salehiMaps.Desktop/     # تطبيق Windows
```

## البناء

تم التحقق محلياً من تثبيت `.NET SDK 8.0.428` وتشغيل اختبارات `salehiMaps.Core` بنجاح (11/11) بعد إصلاحات التنسيق/الإحداثيات.

```bash
export DOTNET_ROOT=/opt/dotnet
export PATH="/opt/dotnet:$PATH"
export TMPDIR=/tmp/opencode
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1

dotnet test src/salehiMaps.Tests/salehiMaps.Tests.csproj -c Release
dotnet publish src/salehiMaps.Desktop/salehiMaps.Desktop.csproj -c Release -r win-x64 --self-contained true -o publish/desktop-win-x64
dotnet workload install android
dotnet publish src/salehiMaps.Android/salehiMaps.Android.csproj -c Release -f net8.0-android
```

ملاحظات بيئة حالية:
- استعادة حزم NuGet كانت غير مستقرة عبر المرآة؛ قد يلزم إعادة المحاولة أو توفر كاش محلي.
- `dotnet workload list` يفشل في هذه البيئة بخطأ إنشاء مجلد مؤقت، رغم أن `/tmp` قابل للكتابة؛ يجب التحقق قبل تثبيت workload Android.
- بناء Android يتطلب workload `android` و Android SDK/Platform متوافق مع `net8.0-android`.

## البيانات

لا تُضمّن ملفات الخرائط المرخّصة في Git. ضعها في مسار بيانات التطبيق على الجهاز أو في المجلد المحلي `data/` (مستبعد من Git).


## ملاحظة عن النموذج القديم

تم نقل النموذج الويبي السابق إلى `legacy-web/` للأرشفة فقط. التطبيقان الرسميان هما `salehiMaps.Android` و`salehiMaps.Desktop`، وكلاهما أصلي مبني على Avalonia وليس صفحة ويب.

## حالة البناء

تم تجهيز جميع مشاريع .NET (Core / UI / Tests / Desktop / Android)، وملف الحل `salehiMaps.sln`، وسكربت `scripts/build.sh`.
لم يتم تشغيل البناء بعد لأن تنزيل .NET SDK فشل بسبب انقطاع الشبكة؛ بمجرد توفر SDK 8 سيتم تنفيذ:

```bash
bash scripts/build.sh
```

يتطلب بناء أندرويد أيضاً `dotnet workload install android` و Android SDK.


## بيانات الخرائط

يبحث التطبيق عن الخرائط بالترتيب التالي:

1. المتغير البيئي `SALEHIMAPS_DATA`
2. `data/` بجانب ملف التنفيذ
3. `files/datastore/maps/` داخل مجلد العمل
4. `data/` داخل مجلد العمل
5. المسار النسبي لمجلد المشروع أثناء التطوير

يمكنك تشغيل التطبيق مع تحديد المسار صراحةً:

```bash
SALEHIMAPS_DATA=/path/to/maps salehiMaps.Desktop
```
