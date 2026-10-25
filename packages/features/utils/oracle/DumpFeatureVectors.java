import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.util.random.Weighted;
import net.minecraft.util.random.WeightedList;
import net.minecraft.util.valueproviders.BiasedToBottomInt;
import net.minecraft.util.valueproviders.ClampedInt;
import net.minecraft.util.valueproviders.ClampedNormalFloat;
import net.minecraft.util.valueproviders.ClampedNormalInt;
import net.minecraft.util.valueproviders.ConstantInt;
import net.minecraft.util.valueproviders.FloatProvider;
import net.minecraft.util.valueproviders.IntProvider;
import net.minecraft.util.valueproviders.TrapezoidFloat;
import net.minecraft.util.valueproviders.TrapezoidInt;
import net.minecraft.util.valueproviders.UniformFloat;
import net.minecraft.util.valueproviders.UniformInt;
import net.minecraft.util.valueproviders.VeryBiasedToBottomInt;
import net.minecraft.util.valueproviders.WeightedListInt;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.NoiseColumn;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeManager;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.blending.Blender;
import net.minecraft.world.level.levelgen.densityfunction.SamplerContext;
import net.minecraft.world.level.StructureManager;
import net.minecraft.server.level.WorldGenRegion;
import com.mojang.serialization.MapCodec;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import net.minecraft.world.level.levelgen.VerticalAnchor;
import net.minecraft.world.level.levelgen.WorldgenRandom;
import net.minecraft.world.level.levelgen.XoroshiroRandomSource;
import net.minecraft.world.level.levelgen.WorldGenerationContext;
import net.minecraft.world.level.levelgen.heightproviders.BiasedToBottomHeight;
import net.minecraft.world.level.levelgen.heightproviders.ConstantHeight;
import net.minecraft.world.level.levelgen.heightproviders.HeightProvider;
import net.minecraft.world.level.levelgen.heightproviders.TrapezoidHeight;
import net.minecraft.world.level.levelgen.heightproviders.UniformHeight;
import net.minecraft.world.level.levelgen.heightproviders.VeryBiasedToBottomHeight;
import net.minecraft.world.level.levelgen.heightproviders.WeightedListHeight;

/**
 * Writes the golden vectors `@jsprismarine/features` compares against, by asking Java Edition's
 * own classes.
 *
 * It covers the layer that decides everything downstream: the decoration and feature seed
 * derivations, the draw sequences of every int, float and height provider, and the shared
 * biome-info noise the two noise count modifiers read. Those are the parts where an extra or
 * missing draw silently changes every value after it, and they are reachable without a world.
 *
 * Features and placement modifiers themselves need a `WorldGenLevel`, which cannot be stood up
 * outside a running server, so they are verified against behavior and distributions in the
 * TypeScript suite instead. See the package README.
 *
 * Every 64-bit value is written as a string, because the runner round-trips the document through
 * `JSON.parse` and a long does not survive a double.
 *
 * Run through `utils/oracle/run.mjs`, which compiles this against the pinned server jar.
 */
public final class DumpFeatureVectors {
    private static final long[] LEVEL_SEEDS = {0L, 1234L, -512L, 7L, 987654321L, -8675309L};
    private static final int[][] CHUNKS = {{0, 0}, {1, 0}, {0, 1}, {-3, 5}, {31, -17}, {100, 100}};

    private DumpFeatureVectors() {}

    public static void main(final String[] args) throws Exception {
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();

        Path output = Path.of(args[0]);
        Files.createDirectories(output);

        Map<String, Object> document = new LinkedHashMap<>();
        document.put("seeds", seeds());
        document.put("intProviders", intProviders());
        document.put("floatProviders", floatProviders());
        document.put("heightProviders", heightProviders());
        document.put("weightedList", weightedList());
        document.put("biomeInfoNoise", biomeInfoNoise());
        document.put("mth", mth());

        String json = new GsonBuilder().setPrettyPrinting().create().toJson(document);
        Files.writeString(output.resolve("features.json"), json + "\n");
        System.out.println("Wrote " + output.resolve("features.json"));
    }

    private static WorldgenRandom decorationRandom() {
        return new WorldgenRandom(new XoroshiroRandomSource(0L));
    }

    private static JsonArray seeds() {
        JsonArray rows = new JsonArray();
        for (long levelSeed : LEVEL_SEEDS) {
            for (int[] chunk : CHUNKS) {
                WorldgenRandom random = decorationRandom();
                long population = random.setDecorationSeed(levelSeed, chunk[0] * 16, chunk[1] * 16);

                JsonObject row = new JsonObject();
                row.addProperty("levelSeed", Long.toString(levelSeed));
                row.addProperty("chunkX", chunk[0]);
                row.addProperty("chunkZ", chunk[1]);
                row.addProperty("populationSeed", Long.toString(population));

                JsonArray features = new JsonArray();
                for (int step = 0; step < 11; step++) {
                    for (int index : new int[] {0, 1, 7}) {
                        random.setFeatureSeed(population, index, step);
                        JsonObject draw = new JsonObject();
                        draw.addProperty("step", step);
                        draw.addProperty("index", index);
                        draw.addProperty("nextInt", random.nextInt());
                        draw.addProperty("nextFloat", random.nextFloat());
                        draw.addProperty("nextLong", Long.toString(random.nextLong()));
                        features.add(draw);
                    }
                }
                row.add("featureDraws", features);
                rows.add(row);
            }
        }
        return rows;
    }

    private static JsonArray samples(final String name, final List<Integer> values) {
        JsonArray row = new JsonArray();
        row.add(name);
        JsonArray drawn = new JsonArray();
        values.forEach(drawn::add);
        row.add(drawn);
        return row;
    }

    private static JsonArray intProviders() {
        Map<String, IntProvider> providers = new LinkedHashMap<>();
        providers.put("constant:5", ConstantInt.of(5));
        providers.put("uniform:0..7", UniformInt.of(0, 7));
        providers.put("uniform:-4..4", UniformInt.of(-4, 4));
        providers.put("biased_to_bottom:0..15", BiasedToBottomInt.of(0, 15));
        providers.put("very_biased_to_bottom:0..15", VeryBiasedToBottomInt.of(0, 15));
        providers.put("trapezoid:-6..6:0", TrapezoidInt.of(-6, 6, 0));
        providers.put("trapezoid:0..10:4", TrapezoidInt.of(0, 10, 4));
        providers.put("trapezoid:2..8:6", TrapezoidInt.of(2, 8, 6));
        providers.put("clamped:uniform:0..20:in:3..9", ClampedInt.of(UniformInt.of(0, 20), 3, 9));
        providers.put("clamped_normal:4:2:0..8", ClampedNormalInt.of(4.0F, 2.0F, 0, 8));
        providers.put(
            "weighted_list",
            new WeightedListInt(
                WeightedList.of(
                    new Weighted<IntProvider>(ConstantInt.of(0), 19),
                    new Weighted<IntProvider>(ConstantInt.of(1), 1),
                    new Weighted<IntProvider>(UniformInt.of(2, 5), 4)
                )
            )
        );

        JsonArray rows = new JsonArray();
        for (Map.Entry<String, IntProvider> entry : providers.entrySet()) {
            RandomSource random = new XoroshiroRandomSource(99L);
            List<Integer> drawn = new ArrayList<>();
            for (int draw = 0; draw < 24; draw++) drawn.add(entry.getValue().sample(random));
            rows.add(samples(entry.getKey(), drawn));
        }
        return rows;
    }

    private static JsonArray floatProviders() {
        Map<String, FloatProvider> providers = new LinkedHashMap<>();
        providers.put("uniform:0..1", UniformFloat.of(0.0F, 1.0F));
        providers.put("uniform:-3..7", UniformFloat.of(-3.0F, 7.0F));
        providers.put("trapezoid:-4..4:2", TrapezoidFloat.of(-4.0F, 4.0F, 2.0F));
        providers.put("clamped_normal:0.5:0.25:0..1", ClampedNormalFloat.of(0.5F, 0.25F, 0.0F, 1.0F));

        JsonArray rows = new JsonArray();
        for (Map.Entry<String, FloatProvider> entry : providers.entrySet()) {
            RandomSource random = new XoroshiroRandomSource(99L);
            JsonArray drawn = new JsonArray();
            for (int draw = 0; draw < 24; draw++) drawn.add(entry.getValue().sample(random));
            JsonArray row = new JsonArray();
            row.add(entry.getKey());
            row.add(drawn);
            rows.add(row);
        }
        return rows;
    }

    private static JsonArray heightProviders() {
        // The overworld's extent, supplied through the two objects WorldGenerationContext reads
        // rather than by overriding it, so the resolution arithmetic is Java's own.
        WorldGenerationContext context =
            new WorldGenerationContext(new OverworldExtentGenerator(), LevelHeightAccessor.create(-64, 384));

        Map<String, HeightProvider> providers = new LinkedHashMap<>();
        providers.put("constant:absolute:11", ConstantHeight.of(VerticalAnchor.absolute(11)));
        providers.put("uniform:bottom..absolute:80", UniformHeight.of(VerticalAnchor.bottom(), VerticalAnchor.absolute(80)));
        providers.put(
            "trapezoid:above_bottom:-80..above_bottom:80",
            TrapezoidHeight.of(VerticalAnchor.aboveBottom(-80), VerticalAnchor.aboveBottom(80))
        );
        providers.put(
            "biased_to_bottom:absolute:0..absolute:64:inner:8",
            BiasedToBottomHeight.of(VerticalAnchor.absolute(0), VerticalAnchor.absolute(64), 8)
        );
        providers.put(
            "very_biased_to_bottom:absolute:0..absolute:64:inner:8",
            VeryBiasedToBottomHeight.of(VerticalAnchor.absolute(0), VerticalAnchor.absolute(64), 8)
        );
        providers.put(
            "weighted_list",
            new WeightedListHeight(
                WeightedList.of(
                    new Weighted<HeightProvider>(ConstantHeight.of(VerticalAnchor.absolute(4)), 3),
                    new Weighted<HeightProvider>(UniformHeight.of(VerticalAnchor.absolute(10), VerticalAnchor.absolute(20)), 1)
                )
            )
        );
        providers.put(
            "uniform:relative_to_sea_level:-5..below_top:10",
            UniformHeight.of(VerticalAnchor.relativeToSeaLevel(-5), VerticalAnchor.belowTop(10))
        );

        JsonArray rows = new JsonArray();
        for (Map.Entry<String, HeightProvider> entry : providers.entrySet()) {
            RandomSource random = new XoroshiroRandomSource(99L);
            List<Integer> drawn = new ArrayList<>();
            for (int draw = 0; draw < 24; draw++) drawn.add(entry.getValue().sample(random, context));
            rows.add(samples(entry.getKey(), drawn));
        }
        return rows;
    }

    private static JsonArray weightedList() {
        WeightedList<String> list = WeightedList.of(
            new Weighted<>("a", 1), new Weighted<>("b", 5), new Weighted<>("c", 2)
        );
        RandomSource random = new XoroshiroRandomSource(99L);
        JsonArray drawn = new JsonArray();
        for (int draw = 0; draw < 64; draw++) drawn.add(list.getRandomOrThrow(random));
        return drawn;
    }

    private static JsonArray biomeInfoNoise() {
        JsonArray rows = new JsonArray();
        double[][] positions = {{0, 0}, {0.5, -0.25}, {12.0, 34.0}, {-100.5, 77.25}, {1024.0, -2048.0}};
        for (double[] position : positions) {
            JsonObject row = new JsonObject();
            row.addProperty("x", position[0]);
            row.addProperty("z", position[1]);
            row.addProperty("value", Biome.BIOME_INFO_NOISE.get(position[0], position[1]));
            rows.add(row);
        }
        return rows;
    }

    private static JsonArray mth() {
        RandomSource random = new XoroshiroRandomSource(5L);
        JsonArray rows = new JsonArray();
        for (int draw = 0; draw < 16; draw++) {
            JsonObject row = new JsonObject();
            row.addProperty("randomBetweenInclusive", Mth.randomBetweenInclusive(random, -5, 5));
            row.addProperty("nextInt", Mth.nextInt(random, 3, 9));
            row.addProperty("randomBetween", Mth.randomBetween(random, -2.0F, 2.0F));
            row.addProperty("normal", Mth.normal(random, 1.5F, 0.25F));
            rows.add(row);
        }
        return rows;
    }

    /**
     * A chunk generator that answers only the three extent questions
     * {@link WorldGenerationContext} asks and refuses everything else, so the height providers
     * resolve their anchors against the overworld without a world.
     */
    private static final class OverworldExtentGenerator extends ChunkGenerator {
        private OverworldExtentGenerator() {
            super(null);
        }

        @Override
        protected MapCodec<? extends ChunkGenerator> codec() {
            throw new UnsupportedOperationException();
        }

        @Override
        public void spawnOriginalMobs(final WorldGenRegion region) {
            throw new UnsupportedOperationException();
        }

        @Override
        public int getGenDepth() {
            return 384;
        }

        @Override
        public CompletableFuture<ChunkAccess> buildTerrain(
            final ChunkAccess chunk,
            final Blender blender,
            final RandomState randomState,
            final StructureManager structureManager,
            final BiomeManager biomeManager,
            final WorldGenRegion region,
            final Set<Holder<Biome>> biomes
        ) {
            throw new UnsupportedOperationException();
        }

        @Override
        public int getSeaLevel() {
            return 63;
        }

        @Override
        public int getMinY() {
            return -64;
        }

        @Override
        public int getBaseHeight(
            final int x, final int z, final Heightmap.Types type, final LevelHeightAccessor accessor, final RandomState randomState
        ) {
            throw new UnsupportedOperationException();
        }

        @Override
        public NoiseColumn getBaseColumn(
            final int x, final int z, final LevelHeightAccessor accessor, final RandomState randomState
        ) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void addDebugScreenInfo(
            final List<String> lines, final RandomState randomState, final BlockPos pos, final SamplerContext samplerContext
        ) {
            throw new UnsupportedOperationException();
        }
    }
}
