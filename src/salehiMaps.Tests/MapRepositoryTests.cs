using salehiMaps.Core;
using Xunit;

namespace salehiMaps.Tests;

public class MapRepositoryTests
{
    [Fact]
    public void Discover_PairsDatAndPreviewWithAqxPrefix()
    {
        string root = Path.Combine(Path.GetTempPath(), $"salehimaps-repo-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            File.WriteAllText(Path.Combine(root, "GOOGLE.AQX"), """
                <aqx version="12"><name>Google Maps</name>
                <source id="GEARTH"><name>Google Earth</name></source></aqx>
                """);
            File.WriteAllText(Path.Combine(root, "GOOGLE.AQX.GEARTH.DAT"), "x");
            File.WriteAllText(Path.Combine(root, "GOOGLE.AQX.GEARTH.IDX"), "x");
            File.WriteAllText(Path.Combine(root, "GOOGLE.AQX.GEARTH.PREVIEW"), "x");
            File.WriteAllText(Path.Combine(root, "CNT.UIPUEJO6.AQB"), "x");
            File.WriteAllText(Path.Combine(root, "CNT.UIPUEJO6.AQB.K9QE0XA3.DAT"), "x");

            var sets = new MapRepository(root).Discover();

            var google = Assert.Single(sets.Where(s => s.Id.Equals("GOOGLE", StringComparison.OrdinalIgnoreCase)));
            Assert.Equal("Google Maps", google.Name);
            Assert.Single(google.Sources);
            Assert.Single(google.DatPaths);
            Assert.Single(google.IdxPaths);
            Assert.EndsWith("PREVIEW", google.PreviewPath);

            var cnt = Assert.Single(sets.Where(s => s.Id.Equals("CNT.UIPUEJO6", StringComparison.OrdinalIgnoreCase)));
            Assert.Single(cnt.DatPaths);
        }
        finally
        {
            if (Directory.Exists(root))
                Directory.Delete(root, recursive: true);
        }
    }
}
