using Android.App;
using Android.Content.PM;
using Avalonia.Android;

namespace salehiMaps.Android;

[Activity(
    Theme = "@style/salehiMaps.Theme",
    MainLauncher = true,
    ConfigurationChanges = ConfigChanges.Orientation
                           | ConfigChanges.ScreenSize
                           | ConfigChanges.UiMode
                           | ConfigChanges.SmallestScreenSize)]
public class MainActivity : AvaloniaMainActivity<App>
{
}
