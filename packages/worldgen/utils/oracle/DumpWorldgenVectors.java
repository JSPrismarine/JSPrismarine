import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import net.minecraft.SharedConstants;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.registries.VanillaRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.Bootstrap;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.levelgen.Aquifer;
import net.minecraft.world.level.levelgen.LegacyRandomSource;
import net.minecraft.world.level.levelgen.NoiseGeneratorSettings;
import net.minecraft.world.level.levelgen.PositionalRandomFactory;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.RandomSupport;
import net.minecraft.world.level.levelgen.XoroshiroRandomSource;
import net.minecraft.world.level.levelgen.densityfunction.DensityFunction;
import net.minecraft.world.level.levelgen.densityfunction.SamplerContext;
import net.minecraft.world.level.levelgen.synth.BlendedNoise;
import net.minecraft.world.level.levelgen.synth.Noise;
import net.minecraft.world.level.levelgen.synth.NormalNoise;
import net.minecraft.world.level.levelgen.synth.PerlinNoise;
import net.minecraft.world.level.levelgen.synth.SimplexNoise;
import net.minecraft.world.level.levelgen.synth.SmearedPerlinNoise;

/**
 * Dumps golden vectors for `@jsprismarine/worldgen` straight out of Mojang's own
 * classes: the two random sources, the four noise kinds, and every noise router
 * slot of all seven vanilla noise settings. Run against the unobfuscated Java
 * Edition server jar on the classpath; `run.mjs` beside this file compiles and
 * invokes it and writes `src/vectors/*.json`.
 *
 * Writing JSON by hand here keeps the dumper free of a serializer dependency.
 * Longs are emitted as decimal strings because JSON numbers cannot hold them.
 */
public final class DumpWorldgenVectors {
    private static final long[] SEEDS = { 0L, 1L, -1L, 1234L, 123456789012345L, -9223372036854775808L };
    private static final int[] BOUNDS = { 1, 3, 16, 100, 1000000 };
    private static final String[] HASH_NAMES = { "minecraft:continentalness", "octave_-7", "minecraft:aquifer", "" };
    private static final int[][] POSITIONS = {
        { 0, 0, 0 }, { 1, 2, 3 }, { 16, 64, 32 }, { -37, -51, 119 }, { 1000, 200, -1000 }, { 12345, 7, -54321 }
    };

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: DumpWorldgenVectors <output-directory>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();

        Path out = Path.of(args[0]);
        Files.createDirectories(out);
        write(out.resolve("random.json"), dumpRandom());
        write(out.resolve("noise.json"), dumpNoise());
        write(out.resolve("density.json"), dumpDensity());
    }

    private static void write(final Path file, final String json) throws IOException {
        Files.writeString(file, json + "\n", StandardCharsets.UTF_8);
        System.out.println("wrote " + file);
    }

    // ---------------------------------------------------------------- randoms

    private static String dumpRandom() {
        List<String> seeds = new ArrayList<>();
        for (long seed : SEEDS) {
            seeds.add(
                obj(
                    field("seed", quote(Long.toString(seed))),
                    field("mixStafford13", quote(Long.toString(RandomSupport.mixStafford13(seed)))),
                    field("upgradeSeedTo128bit", longs(upgraded(seed))),
                    field("xoroshiro", dumpSource(new XoroshiroRandomSource(seed), seed, false)),
                    field("legacy", dumpSource(new LegacyRandomSource(seed), seed, true))
                )
            );
        }

        List<String> hashes = new ArrayList<>();
        for (String name : HASH_NAMES) {
            RandomSupport.Seed128bit hash = RandomSupport.seedFromHashOf(name);
            hashes.add(obj(field("name", quote(name)), field("seed", longs(new long[] { hash.seedLo(), hash.seedHi() }))));
        }

        return obj(field("seeds", array(seeds)), field("seedFromHashOf", array(hashes)));
    }

    private static long[] upgraded(final long seed) {
        RandomSupport.Seed128bit value = RandomSupport.upgradeSeedTo128bit(seed);
        return new long[] { value.seedLo(), value.seedHi() };
    }

    private static String dumpSource(final RandomSource prototype, final long seed, final boolean legacy) {
        List<String> bounded = new ArrayList<>();
        for (int bound : BOUNDS) {
            bounded.add(obj(field("bound", Integer.toString(bound)), field("values", ints(nextInts(fresh(seed, legacy), bound, 8)))));
        }

        List<String> positional = new ArrayList<>();
        PositionalRandomFactory factory = fresh(seed, legacy).forkPositional();
        for (int[] pos : POSITIONS) {
            positional.add(
                obj(
                    field("at", ints(pos)),
                    field("values", longStrings(nextLongs(factory.at(pos[0], pos[1], pos[2]), 4)))
                )
            );
        }

        List<String> hashed = new ArrayList<>();
        for (String name : HASH_NAMES) {
            hashed.add(obj(field("name", quote(name)), field("values", longStrings(nextLongs(factory.fromHashOf(name), 4)))));
        }

        List<String> seeded = new ArrayList<>();
        for (long value : new long[] { 0L, 42L, -7L }) {
            seeded.add(
                obj(field("seed", quote(Long.toString(value))), field("values", longStrings(nextLongs(factory.fromSeed(value), 4))))
            );
        }

        return obj(
            field("nextLong", longStrings(nextLongs(fresh(seed, legacy), 8))),
            field("nextInt", ints(nextInts(fresh(seed, legacy), 0, 8))),
            field("nextIntBounded", array(bounded)),
            field("nextFloat", floats(nextFloats(fresh(seed, legacy), 6))),
            field("nextDouble", doubles(nextDoubles(fresh(seed, legacy), 6))),
            field("nextGaussian", doubles(nextGaussians(fresh(seed, legacy), 6))),
            field("nextBoolean", booleans(nextBooleans(fresh(seed, legacy), 8))),
            field("fork", longStrings(nextLongs(fresh(seed, legacy).fork(), 4))),
            field("positionalAt", array(positional)),
            field("positionalFromHashOf", array(hashed)),
            field("positionalFromSeed", array(seeded))
        );
    }

    private static RandomSource fresh(final long seed, final boolean legacy) {
        return legacy ? new LegacyRandomSource(seed) : new XoroshiroRandomSource(seed);
    }

    private static long[] nextLongs(final RandomSource random, final int count) {
        long[] values = new long[count];
        for (int i = 0; i < count; i++) values[i] = random.nextLong();
        return values;
    }

    private static int[] nextInts(final RandomSource random, final int bound, final int count) {
        int[] values = new int[count];
        for (int i = 0; i < count; i++) values[i] = bound == 0 ? random.nextInt() : random.nextInt(bound);
        return values;
    }

    private static float[] nextFloats(final RandomSource random, final int count) {
        float[] values = new float[count];
        for (int i = 0; i < count; i++) values[i] = random.nextFloat();
        return values;
    }

    private static double[] nextDoubles(final RandomSource random, final int count) {
        double[] values = new double[count];
        for (int i = 0; i < count; i++) values[i] = random.nextDouble();
        return values;
    }

    private static double[] nextGaussians(final RandomSource random, final int count) {
        double[] values = new double[count];
        for (int i = 0; i < count; i++) values[i] = random.nextGaussian();
        return values;
    }

    private static boolean[] nextBooleans(final RandomSource random, final int count) {
        boolean[] values = new boolean[count];
        for (int i = 0; i < count; i++) values[i] = random.nextBoolean();
        return values;
    }

    // ------------------------------------------------------------------ noise

    private static String dumpNoise() {
        List<String> entries = new ArrayList<>();

        entries.add(field("perlin", samples(new PerlinNoise(new XoroshiroRandomSource(1234L)))));
        entries.add(field("simplex", samples(new SimplexNoise(new XoroshiroRandomSource(1234L)))));
        entries.add(field("simplexNoOffset", samples(new SimplexNoise(new XoroshiroRandomSource(1234L), true))));
        entries.add(field("smearedPerlin", samples(new SmearedPerlinNoise(new XoroshiroRandomSource(1234L), 8.0))));
        entries.add(field("legacyPerlin", samples(new PerlinNoise(new LegacyRandomSource(1234L)))));

        NormalNoise.Builder builder = NormalNoise.builder();
        builder.setBaseOctave(-9);
        builder.setOctaveCount(9);
        builder.setBaseAmplitude(0.8880832896205223);
        builder.setAmplitudeModifier(2, 2.0);
        builder.setAmplitudeModifier(3, 2.0);
        builder.setAmplitudeModifier(4, 2.0);
        NormalNoise continentalness = builder.build();
        entries.add(field("normalContinentalness", samples(continentalness.create(new XoroshiroRandomSource(1234L)))));

        NormalNoise.Builder single = NormalNoise.builder();
        single.setBaseOctave(-3);
        single.setBaseAmplitude(0.955388882960065);
        entries.add(field("normalAquiferBarrier", samples(single.build().create(new XoroshiroRandomSource(1234L)))));

        NormalNoise.Builder unnormalized = NormalNoise.builder();
        unnormalized.setBaseOctave(-5);
        unnormalized.setOctaveCount(3);
        unnormalized.setBaseAmplitude(1.0);
        unnormalized.setNormalize(false);
        entries.add(field("normalUnnormalized", samples(unnormalized.build().create(new XoroshiroRandomSource(1234L)))));

        BlendedNoise blended = new BlendedNoise(0.25, 0.125, 80.0, 160.0, 8.0);
        var sampler = blended.compileSampler(new XoroshiroRandomSource(1234L));
        List<String> blendedSamples = new ArrayList<>();
        for (int[] pos : POSITIONS) {
            blendedSamples.add(
                obj(
                    field("at", ints(pos)),
                    field("value", floatValue(sampler.sampleValue(SamplerContext.EMPTY_UNCACHED, pos[0], pos[1], pos[2])))
                )
            );
        }
        entries.add(field("oldBlendedNoise", array(blendedSamples)));

        return obj(entries.toArray(String[]::new));
    }

    private static String samples(final Noise noise) {
        List<String> values = new ArrayList<>();
        for (int[] pos : POSITIONS) {
            values.add(
                obj(
                    field("at", ints(pos)),
                    field("value3d", floatValue(noise.get(pos[0] * 0.25, pos[1] * 0.125, pos[2] * 0.25))),
                    field("value2d", floatValue(noise.get(pos[0] * 0.25, pos[2] * 0.25)))
                )
            );
        }
        return array(values);
    }

    // ---------------------------------------------------------------- density

    @SuppressWarnings("unchecked")
    private static ResourceKey<NoiseGeneratorSettings>[] allSettings() {
        return new ResourceKey[] {
            NoiseGeneratorSettings.OVERWORLD,
            NoiseGeneratorSettings.LARGE_BIOMES,
            NoiseGeneratorSettings.AMPLIFIED,
            NoiseGeneratorSettings.NETHER,
            NoiseGeneratorSettings.END,
            NoiseGeneratorSettings.CAVES,
            NoiseGeneratorSettings.FLOATING_ISLANDS
        };
    }

    private static String dumpDensity() {
        HolderLookup.Provider provider = VanillaRegistries.createWorldLookup();
        HolderLookup.RegistryLookup<NoiseGeneratorSettings> settingsLookup = provider.lookupOrThrow(Registries.NOISE_SETTINGS);
        List<String> dimensions = new ArrayList<>();

        for (ResourceKey<NoiseGeneratorSettings> key : allSettings()) {
            NoiseGeneratorSettings settings = settingsLookup.getOrThrow(key).value();
            RandomState state = RandomState.create(provider.lookupOrThrow(Registries.NOISE), 1234L, settings);
            List<String> slots = new ArrayList<>();
            slots.add(field("temperature", routerSamples(state, settings.noiseRouter().temperature())));
            slots.add(field("vegetation", routerSamples(state, settings.noiseRouter().vegetation())));
            slots.add(field("continents", routerSamples(state, settings.noiseRouter().continents())));
            slots.add(field("erosion", routerSamples(state, settings.noiseRouter().erosion())));
            slots.add(field("depth", routerSamples(state, settings.noiseRouter().depth())));
            slots.add(field("ridges", routerSamples(state, settings.noiseRouter().ridges())));
            slots.add(field("chunk_surface_level", routerSamples(state, settings.noiseRouter().chunkSurfaceLevel())));
            slots.add(field("final_density", routerSamples(state, settings.noiseRouter().finalDensity())));

            List<String> aquifers = new ArrayList<>();
            if (settings.aquifers().isPresent()) {
                Aquifer.Config config = settings.aquifers().get();
                aquifers.add(field("barrier", routerSamples(state, config.barrierNoise())));
                aquifers.add(field("fluid_level_floodedness", routerSamples(state, config.fluidLevelFloodednessNoise())));
                aquifers.add(field("fluid_level_spread", routerSamples(state, config.fluidLevelSpreadNoise())));
                aquifers.add(field("lava", routerSamples(state, config.lavaNoise())));
                aquifers.add(field("exclusion", routerSamples(state, config.exclusion())));
                aquifers.add(field("surface_level", routerSamples(state, config.surfaceLevel())));
            }

            dimensions.add(
                obj(
                    field("settings", quote(key.identifier().toString())),
                    field("router", obj(slots.toArray(String[]::new))),
                    field("aquifers", obj(aquifers.toArray(String[]::new)))
                )
            );
        }

        return obj(field("seed", quote("1234")), field("dimensions", array(dimensions)));
    }

    private static String routerSamples(final RandomState state, final DensityFunction function) {
        List<String> values = new ArrayList<>();
        for (int[] pos : POSITIONS) {
            values.add(floatValue(state.sampleBlockValueUncached(function, pos[0], pos[1], pos[2])));
        }
        return array(values);
    }

    // ------------------------------------------------------------ json output

    private static String obj(final String... fields) {
        return "{" + String.join(",", fields) + "}";
    }

    private static String field(final String name, final String value) {
        return quote(name) + ":" + value;
    }

    private static String array(final List<String> values) {
        return "[" + String.join(",", values) + "]";
    }

    private static String quote(final String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String longs(final long[] values) {
        List<String> parts = new ArrayList<>();
        for (long value : values) parts.add(quote(Long.toString(value)));
        return array(parts);
    }

    private static String longStrings(final long[] values) {
        return longs(values);
    }

    private static String ints(final int[] values) {
        List<String> parts = new ArrayList<>();
        for (int value : values) parts.add(Integer.toString(value));
        return array(parts);
    }

    private static String booleans(final boolean[] values) {
        List<String> parts = new ArrayList<>();
        for (boolean value : values) parts.add(Boolean.toString(value));
        return array(parts);
    }

    private static String floats(final float[] values) {
        List<String> parts = new ArrayList<>();
        for (float value : values) parts.add(floatValue(value));
        return array(parts);
    }

    private static String doubles(final double[] values) {
        List<String> parts = new ArrayList<>();
        for (double value : values) parts.add(doubleValue(value));
        return array(parts);
    }

    /** Emits the shortest decimal that round-trips to the same float. */
    private static String floatValue(final float value) {
        if (Float.isNaN(value) || Float.isInfinite(value)) return quote(Float.toString(value));
        return String.format(Locale.ROOT, "%s", Float.toString(value));
    }

    /** Emits the shortest decimal that round-trips to the same double. */
    private static String doubleValue(final double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) return quote(Double.toString(value));
        return Double.toString(value);
    }
}
