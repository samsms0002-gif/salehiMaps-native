using System.Globalization;
using System.Text;

namespace salehiMaps.Core.Formats;

/// <summary>
/// Expands AQX server URL placeholders for a concrete tile.
/// </summary>
public static class UrlTemplate
{
    public static string Expand(
        string template,
        int x,
        int y,
        int z,
        int serverIndex = 0,
        string ptc = "",
        string appCode = "")
    {
        ArgumentNullException.ThrowIfNull(template);

        return template
            .Replace("{$x}", x.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal)
            .Replace("{$y}", y.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal)
            .Replace("{$z}", z.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal)
            .Replace("{$s}", serverIndex.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal)
            .Replace("{$ms}", GoogleMs(x, y, z), StringComparison.Ordinal)
            .Replace("{$ptc}", ptc, StringComparison.Ordinal)
            .Replace("{$app-c}", appCode, StringComparison.Ordinal)
            .Replace("{$app_c}", appCode, StringComparison.Ordinal)
            .Replace("{$srv}", string.Empty, StringComparison.Ordinal);
    }

    /// <summary>
    /// Google's quad-key style suffix derived from tile x/y bits.
    /// </summary>
    public static string GoogleMs(int x, int y, int z)
    {
        if (z <= 0)
            return string.Empty;

        var sb = new StringBuilder(z);
        for (int i = z - 1; i >= 0; i--)
        {
            int digit = ((x >> i) & 1) | (((y >> i) & 1) << 1);
            sb.Append((char)('0' + digit));
        }
        return sb.ToString();
    }
}
