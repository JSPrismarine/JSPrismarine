import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.google.gson.JsonParser;
import com.mojang.datafixers.util.Pair;
import com.mojang.serialization.JsonOps;

import net.minecraft.SharedConstants;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.IdMapper;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.registries.VanillaRegistries;
import net.minecraft.resources.RegistryOps;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.Bootstrap;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeManager;
import net.minecraft.world.level.biome.BiomeResolver;
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.biome.MultiNoiseBiomeSource;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterList;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterLists;
import net.minecraft.world.level.biome.TheEndBiomeSource;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.chunk.LevelChunkSection;
import net.minecraft.world.level.chunk.PalettedContainerFactory;
import net.minecraft.world.level.chunk.ProtoChunk;
import net.minecraft.world.level.chunk.Strategy;
import net.minecraft.world.level.chunk.UpgradeData;
import net.minecraft.world.level.levelgen.Aquifer;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.LegacyRandomSource;
import net.minecraft.world.level.levelgen.NoiseBasedChunkGenerator;
import net.minecraft.world.level.levelgen.NoiseChunk;
import net.minecraft.world.level.levelgen.NoiseGeneratorSettings;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.WorldGenerationContext;
import net.minecraft.world.level.levelgen.WorldgenRandom;
import net.minecraft.world.level.levelgen.blending.Blender;
import net.minecraft.world.level.levelgen.carver.WorldCarver;
import net.minecraft.world.level.levelgen.densityfunction.DensitySampler;
import net.minecraft.world.level.levelgen.densityfunction.DensityVolume;
import net.minecraft.world.level.levelgen.densityfunction.SamplerContext;
import net.minecraft.world.level.levelgen.material.rule.MaterialRule;
import net.minecraft.world.level.chunk.CarvingMask;

/**
 * Dumps golden vectors for the surface pass, the biome sources and the carvers of
 * `@jsprismarine/worldgen` out of Mojang's own classes, the way
 * `DumpWorldgenVectors.java` beside this file does for the terrain core.
 *
 * It writes four files into the directory named by its single argument:
 *
 * <ul>
 *   <li>`surface-registries.json`: the raw `worldgen/material_rule` and
 *       `worldgen/material_condition` documents out of the jar, so the offline test suite can
 *       build the same rule trees without the jar.</li>
 *   <li>`surface-columns.json`: whole columns of three dimensions after `MaterialSystem.buildSurface`,
 *       plus one synthetic rule per condition type run over the same chunk.</li>
 *   <li>`biome-points.json`: the climate parameter lists, nearest-point lookups, the biome zoomer and
 *       the end biome source.</li>
 *   <li>`surface-carver.json`: the carving mask a whole 17 by 17 source-chunk sweep produces.</li>
 * </ul>
 *
 * Run it with the pinned unobfuscated Java Edition server jar and its libraries on the
 * classpath. JSON is written by hand so the dumper needs no serializer of its own; longs go
 * out as decimal strings because JSON numbers cannot hold them.
 */
public final class DumpSurfaceVectors {
    private static final long SEED = 1234L;
    private static final int CHUNK_X = 3;
    private static final int CHUNK_Z = -5;
    /** The columns of the chunk that every surface vector covers. */
    private static final int[] COLUMNS = { 0, 7, 15 };

    public static void main(final String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("usage: DumpSurfaceVectors <server-jar> <output-directory>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();

        Path jar = Path.of(args[0]);
        Path out = Path.of(args[1]);
        Files.createDirectories(out);

        HolderLookup.Provider provider = VanillaRegistries.createWorldLookup();
        write(out.resolve("surface-registries.json"), dumpMaterialRuleDocuments(jar));
        write(out.resolve("surface-columns.json"), dumpSurface(provider));
        write(out.resolve("biome-points.json"), dumpBiome(provider));
        write(out.resolve("surface-carver.json"), dumpCarver(provider, jar));
    }

    private static void write(final Path file, final String json) throws IOException {
        Files.writeString(file, json + "\n", StandardCharsets.UTF_8);
        System.out.println("wrote " + file);
    }

    // ------------------------------------------------------- registry documents

    /**
     * Copies the `material_rule`, `material_condition` and `carver` JSON out of the jar so the
     * test suite can parse the real trees with no jar present.
     */
    private static String dumpMaterialRuleDocuments(final Path jar) throws IOException {
        Map<String, String> rules = new TreeMap<>();
        Map<String, String> conditions = new TreeMap<>();
        Map<String, String> carvers = new TreeMap<>();
        Map<String, String> densityFunctions = new TreeMap<>();
        Map<String, String> noises = new TreeMap<>();
        Map<String, String> noiseSettings = new TreeMap<>();
        Map<String, String> biomes = new TreeMap<>();
        try (ZipInputStream zip = new ZipInputStream(Files.newInputStream(jar))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                String name = entry.getName();
                if (!name.startsWith("data/minecraft/worldgen/") || !name.endsWith(".json")) continue;
                String rest = name.substring("data/minecraft/worldgen/".length());
                int slash = rest.indexOf('/');
                String registry = rest.substring(0, slash);
                Map<String, String> target = switch (registry) {
                    case "material_rule" -> rules;
                    case "material_condition" -> conditions;
                    case "carver" -> carvers;
                    case "density_function" -> densityFunctions;
                    case "noise" -> noises;
                    case "noise_settings" -> noiseSettings;
                    case "biome" -> biomes;
                    default -> null;
                };
                if (target == null) continue;
                String id = "minecraft:" + rest.substring(slash + 1, rest.length() - ".json".length());
                target.put(id, new String(readAll(zip), StandardCharsets.UTF_8));
            }
        }
        return obj(
            field("materialRules", documents(rules)),
            field("materialConditions", documents(conditions)),
            field("carvers", documents(carvers)),
            field("densityFunctions", documents(densityFunctions)),
            field("noises", documents(noises)),
            field("noiseSettings", documents(noiseSettings)),
            field("biomeClimates", climates(biomes))
        );
    }

    /**
     * Keeps only the two climate fields of each `worldgen/biome` document. The surface pass
     * reads nothing else out of a biome, and the full documents are 67 files of spawn tables.
     */
    private static String climates(final Map<String, String> source) {
        List<String> fields = new ArrayList<>();
        for (Map.Entry<String, String> entry : source.entrySet()) {
            JsonObject biome = JsonParser.parseString(entry.getValue()).getAsJsonObject();
            JsonObject climate = new JsonObject();
            climate.add("temperature", biome.get("temperature"));
            climate.add(
                "temperature_modifier",
                biome.has("temperature_modifier") ? biome.get("temperature_modifier") : new JsonPrimitive("none")
            );
            fields.add(field(entry.getKey(), climate.toString()));
        }
        return obj(fields.toArray(new String[0]));
    }

    private static byte[] readAll(final InputStream stream) throws IOException {
        return stream.readAllBytes();
    }

    /**
     * Writes each registry document as one compact JSON string rather than as nested JSON.
     *
     * Prettier reformats a nested document into one field per line, which turns the 55 density
     * functions into 600 KB of mostly whitespace. A string stays on one line, and the test
     * suite parses it back.
     */
    private static String documents(final Map<String, String> source) {
        List<String> fields = new ArrayList<>();
        for (Map.Entry<String, String> entry : source.entrySet()) {
            JsonElement parsed = JsonParser.parseString(entry.getValue());
            fields.add(field(entry.getKey(), quote(parsed.toString())));
        }
        return obj(fields.toArray(new String[0]));
    }

    // -------------------------------------------------------------- the surface

    private record Dimension(String settings, ResourceKey<NoiseGeneratorSettings> key, String biomeSource) {}

    private static List<Dimension> dimensions() {
        return List.of(
            new Dimension("minecraft:overworld", NoiseGeneratorSettings.OVERWORLD, "overworld"),
            new Dimension("minecraft:nether", NoiseGeneratorSettings.NETHER, "nether"),
            new Dimension("minecraft:end", NoiseGeneratorSettings.END, "end")
        );
    }

    /**
     * Every synthetic rule the condition coverage test runs. Each is a complete
     * `worldgen/material_rule` document naming one condition type, so a mismatch points at the
     * condition rather than at the tree around it.
     */
    private static final List<String[]> CONDITION_CASES = List.of(
        new String[] { "above_preliminary_surface",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:above_preliminary_surface\"},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:diamond_block\"}}" },
        new String[] { "biome",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:biome\",\"biome_is\":"
                + "[\"minecraft:plains\",\"minecraft:ocean\",\"minecraft:snowy_slopes\",\"minecraft:nether_wastes\",\"minecraft:the_end\"]},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:gold_block\"}}" },
        new String[] { "noise_threshold_2d",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:noise_threshold\","
                + "\"noise\":\"minecraft:surface\",\"min_threshold\":0.1,\"max_threshold\":1.7976931348623157E308},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:emerald_block\"}}" },
        new String[] { "noise_threshold_3d",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:noise_threshold\","
                + "\"noise\":\"minecraft:calcite\",\"min_threshold\":-0.0125,\"max_threshold\":0.0125,\"is_3d\":true},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:calcite\"}}" },
        new String[] { "vertical_gradient",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:vertical_gradient\","
                + "\"random_name\":\"minecraft:bedrock_floor\",\"true_at_and_below\":{\"above_bottom\":0},"
                + "\"false_at_and_above\":{\"above_bottom\":5}},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:bedrock\"}}" },
        new String[] { "y_above",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:y_above\","
                + "\"anchor\":{\"absolute\":62},\"surface_depth_multiplier\":2,\"add_stone_depth\":true},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:iron_block\"}}" },
        new String[] { "water",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:water\","
                + "\"offset\":-6,\"surface_depth_multiplier\":-1,\"add_stone_depth\":true},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:lapis_block\"}}" },
        new String[] { "temperature",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:temperature\"},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:snow_block\"}}" },
        new String[] { "steep",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:steep\"},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:stone\"}}" },
        new String[] { "not",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:not\",\"invert\":"
                + "{\"type\":\"minecraft:water\",\"offset\":0,\"surface_depth_multiplier\":0,\"add_stone_depth\":false}},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:dirt\"}}" },
        new String[] { "hole",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:hole\"},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:coal_block\"}}" },
        new String[] { "stone_depth_floor",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:stone_depth\",\"offset\":0,"
                + "\"add_surface_depth\":true,\"secondary_depth_range\":6,\"surface_type\":\"floor\"},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:redstone_block\"}}" },
        new String[] { "stone_depth_ceiling",
            "{\"type\":\"minecraft:condition\",\"if_true\":{\"type\":\"minecraft:stone_depth\",\"offset\":0,"
                + "\"add_surface_depth\":true,\"secondary_depth_range\":30,\"surface_type\":\"ceiling\"},"
                + "\"then_run\":{\"type\":\"minecraft:block\",\"result_state\":\"minecraft:slime_block\"}}" },
        new String[] { "sequence_and_bandlands",
            "{\"type\":\"minecraft:sequence\",\"sequence\":[{\"type\":\"minecraft:condition\",\"if_true\":"
                + "{\"type\":\"minecraft:y_above\",\"anchor\":{\"absolute\":100},\"surface_depth_multiplier\":0,"
                + "\"add_stone_depth\":false},\"then_run\":{\"type\":\"minecraft:block\","
                + "\"result_state\":\"minecraft:glass\"}},{\"type\":\"minecraft:bandlands\"}]}" },
        new String[] { "ore_vein_copper",
            "{\"type\":\"minecraft:ore_vein\",\"ore_block\":\"minecraft:copper_ore\","
                + "\"raw_ore_block\":\"minecraft:raw_copper_block\",\"filler_block\":\"minecraft:granite\","
                + "\"raw_ore_chance\":0.02,\"density\":\"minecraft:overworld/ore_vein/copper_density\","
                + "\"richness\":\"minecraft:overworld/ore_vein/richness\",\"filler_gap\":\"minecraft:overworld/ore_vein/gap\"}" }
    );

    private static String dumpSurface(final HolderLookup.Provider provider) {
        List<String> dimensions = new ArrayList<>();
        List<Dimension> dimensionList = dimensions();
        for (Dimension dimension : dimensionList) {
            NoiseGeneratorSettings settings = provider.lookupOrThrow(Registries.NOISE_SETTINGS)
                .getOrThrow(dimension.key()).value();
            MaterialRule rule = settings.materialRule().value();
            String materialRule = settings.materialRule().unwrapKey().orElseThrow().identifier().toString();
            dimensions.add(
                obj(
                    field("settings", quote(dimension.settings())),
                    field("materialRule", quote(materialRule)),
                    field("biomeSource", quote(dimension.biomeSource())),
                    surfaceBody(provider, dimension, settings, rule)
                )
            );
        }

        Dimension overworld = dimensionList.get(0);
        NoiseGeneratorSettings overworldSettings = provider.lookupOrThrow(Registries.NOISE_SETTINGS)
            .getOrThrow(overworld.key()).value();
        RegistryOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, provider);
        List<String> cases = new ArrayList<>();
        for (String[] testCase : CONDITION_CASES) {
            MaterialRule rule = MaterialRule.DIRECT_CODEC
                .parse(ops, JsonParser.parseString(testCase[1]))
                .getOrThrow(message -> new IllegalStateException(testCase[0] + ": " + message));
            cases.add(
                obj(
                    field("name", quote(testCase[0])),
                    field("rule", testCase[1]),
                    surfaceBody(provider, overworld, overworldSettings, rule)
                )
            );
        }

        return obj(
            field("seed", quote(Long.toString(SEED))),
            field("chunkX", Integer.toString(CHUNK_X)),
            field("chunkZ", Integer.toString(CHUNK_Z)),
            field("dimensions", array(dimensions)),
            field("conditions", array(cases))
        );
    }

    /**
     * Fills one chunk from the noise router, runs Java's surface pass over it and returns the
     * columns as run lengths. The fill mirrors `NoiseBasedChunkGenerator.doFill`, which is the
     * state the surface pass expects to find; the surface pass itself is Mojang's.
     */
    private static String surfaceBody(
        final HolderLookup.Provider provider,
        final Dimension dimension,
        final NoiseGeneratorSettings settings,
        final MaterialRule rule
    ) {
        int minY = settings.noiseSettings().minY();
        int height = settings.noiseSettings().height();
        BiomeSource biomeSource = createBiomeSource(provider, dimension.biomeSource());
        RandomState state = RandomState.create(provider.lookupOrThrow(Registries.NOISE), SEED, settings);
        ChunkGenerator generator = new NoiseBasedChunkGenerator(
            biomeSource, provider.lookupOrThrow(Registries.NOISE_SETTINGS).getOrThrow(dimension.key())
        );

        Aquifer.FluidStatus lavaStatus = new Aquifer.FluidStatus(-54, Blocks.LAVA.defaultBlockState());
        Aquifer.FluidStatus seaStatus = new Aquifer.FluidStatus(settings.seaLevel(), settings.defaultFluid());
        Aquifer.FluidPicker fluidPicker =
            (x, y, z) -> y < Math.min(-54, settings.seaLevel()) ? lavaStatus : seaStatus;

        LevelHeightAccessor heightAccessor = LevelHeightAccessor.create(minY, height);
        ProtoChunk chunk = new ProtoChunk(
            new ChunkPos(CHUNK_X, CHUNK_Z), UpgradeData.EMPTY, heightAccessor, containerFactory(provider), null
        );
        DensityVolume volume = new DensityVolume(16, height, 16, CHUNK_X * 16, minY, CHUNK_Z * 16);

        List<String> columns = new ArrayList<>();
        try (NoiseChunk noiseChunk = new NoiseChunk(state, null, settings, fluidPicker, Blender.empty(), volume)) {
            fill(chunk, noiseChunk, settings, volume);
            BiomeResolver resolver = biomeSource.createResolver(
                state.createClimateSampler(SamplerContext.EMPTY_UNCACHED)
            );
            BiomeManager biomeManager = new BiomeManager(resolver, BiomeManager.obfuscateSeed(SEED));
            WorldGenerationContext generationContext = new WorldGenerationContext(generator, heightAccessor);
            state.surfaceSystem()
                .buildSurface(state, biomeManager, generationContext, chunk, noiseChunk, rule, null);

            for (int localZ : COLUMNS) {
                for (int localX : COLUMNS) {
                    int blockX = volume.blockX(localX);
                    int blockZ = volume.blockZ(localZ);
                    String[] states = new String[height];
                    for (int index = 0; index < height; index++) {
                        states[index] = blockName(
                            chunk.getBlockState(new net.minecraft.core.BlockPos(blockX, minY + index, blockZ))
                        );
                    }
                    columns.add(
                        obj(
                            field("x", Integer.toString(blockX)),
                            field("z", Integer.toString(blockZ)),
                            field("biome", quote(biomeName(biomeManager, blockX, chunk.getHeight(
                                Heightmap.Types.WORLD_SURFACE_WG, localX, localZ) + 1, blockZ))),
                            field("runs", runs(states, minY))
                        )
                    );
                }
            }
        }

        return field(
            "columns",
            obj(
                field("minY", Integer.toString(minY)),
                field("height", Integer.toString(height)),
                field("entries", array(columns))
            )
        );
    }

    private static void fill(
        final ProtoChunk chunk,
        final NoiseChunk noiseChunk,
        final NoiseGeneratorSettings settings,
        final DensityVolume volume
    ) {
        Heightmap oceanFloor = chunk.getOrCreateHeightmapUnprimed(Heightmap.Types.OCEAN_FLOOR_WG);
        Heightmap worldSurface = chunk.getOrCreateHeightmapUnprimed(Heightmap.Types.WORLD_SURFACE_WG);
        Aquifer aquifer = noiseChunk.aquifer();
        DensitySampler.Bound finalDensity =
            noiseChunk.cachingSamplers().get(settings.noiseRouter().finalDensity());
        BlockState air = Blocks.AIR.defaultBlockState();

        for (int z = 0; z < volume.sizeZ(); z++) {
            int blockZ = volume.blockZ(z);
            for (int x = 0; x < volume.sizeX(); x++) {
                int blockX = volume.blockX(x);
                for (int y = volume.sizeY() - 1; y >= 0; y--) {
                    int blockY = volume.blockY(y);
                    float density = finalDensity.sampleValue(blockX, blockY, blockZ);
                    BlockState state = aquifer.computeSubstance(blockX, blockY, blockZ, density);
                    if (state == null) state = settings.defaultBlock();
                    if (state != air) {
                        LevelChunkSection section = chunk.getSection(chunk.getSectionIndex(blockY));
                        section.setBlockState(x, blockY & 15, z, state, false);
                        oceanFloor.update(x, blockY, z, state);
                        worldSurface.update(x, blockY, z, state);
                    }
                }
            }
        }
    }

    private static String runs(final String[] states, final int minY) {
        List<String> runs = new ArrayList<>();
        int runStart = 0;
        for (int index = 1; index <= states.length; index++) {
            if (index == states.length || !states[index].equals(states[runStart])) {
                // One run per string: "<y> <count> <block>". See documents() for why.
                runs.add(quote((minY + runStart) + " " + (index - runStart) + " " + states[runStart]));
                runStart = index;
            }
        }
        return array(runs);
    }

    private static String blockName(final BlockState state) {
        return state.getBlock().builtInRegistryHolder().key().identifier().toString();
    }

    private static String biomeName(final BiomeManager manager, final int x, final int y, final int z) {
        return manager.getBiome(new net.minecraft.core.BlockPos(x, y, z)).unwrapKey().orElseThrow()
            .identifier().toString();
    }

    private static BiomeSource createBiomeSource(final HolderLookup.Provider provider, final String name) {
        return switch (name) {
            case "overworld" -> MultiNoiseBiomeSource.createFromPreset(
                provider.lookupOrThrow(Registries.MULTI_NOISE_BIOME_SOURCE_PARAMETER_LIST)
                    .getOrThrow(MultiNoiseBiomeSourceParameterLists.OVERWORLD)
            );
            case "nether" -> MultiNoiseBiomeSource.createFromPreset(
                provider.lookupOrThrow(Registries.MULTI_NOISE_BIOME_SOURCE_PARAMETER_LIST)
                    .getOrThrow(MultiNoiseBiomeSourceParameterLists.NETHER)
            );
            case "end" -> TheEndBiomeSource.create(provider.lookupOrThrow(Registries.BIOME));
            default -> throw new IllegalArgumentException(name);
        };
    }

    /**
     * The smallest container factory a {@link ProtoChunk} accepts. Only the block state palette
     * is read here, so the two serialization codecs stay unset.
     */
    private static PalettedContainerFactory containerFactory(final HolderLookup.Provider provider) {
        Holder<Biome> plains = provider.lookupOrThrow(Registries.BIOME).getOrThrow(Biomes.PLAINS);
        IdMapper<Holder<Biome>> biomeIds = new IdMapper<>();
        biomeIds.add(plains);
        return new PalettedContainerFactory(
            Strategy.createForBlockStates(Block.BLOCK_STATE_REGISTRY),
            Blocks.AIR.defaultBlockState(),
            null,
            Strategy.createForBiomes(biomeIds),
            plains,
            null
        );
    }

    // ---------------------------------------------------------------- the biomes

    private static final int[][] CLIMATE_TARGETS = {
        { 0, 0, 0, 0, 0, 0 },
        { 3000, -4000, 5000, -2500, 1000, 7500 },
        { -8000, 9000, -11000, 3300, -400, -6200 },
        { 10000, 10000, 10000, 10000, 10000, 10000 },
        { -10000, -10000, -10000, -10000, -10000, -10000 },
        { 1234, -5678, 910, -1112, 1314, -1516 },
        { 5500, 5500, -19000, 0, 0, 0 },
        { -4500, 2500, 3000, -8000, 2000, -1000 }
    };

    private static String dumpBiome(final HolderLookup.Provider provider) {
        List<String> lists = new ArrayList<>();
        lists.add(dumpParameterList(provider, "minecraft:overworld", MultiNoiseBiomeSourceParameterLists.OVERWORLD));
        lists.add(dumpParameterList(provider, "minecraft:nether", MultiNoiseBiomeSourceParameterLists.NETHER));

        List<String> zoomer = new ArrayList<>();
        BiomeResolver countingResolver = (quartX, quartY, quartZ) -> null;
        long zoomSeed = BiomeManager.obfuscateSeed(SEED);
        for (int[] pos : new int[][] {
            { 0, 0, 0 }, { 1, 2, 3 }, { 16, 64, 32 }, { -37, -51, 119 }, { 1000, 200, -1000 }, { 12345, 7, -54321 }
        }) {
            int[] quart = biomeZoom(zoomSeed, pos[0], pos[1], pos[2]);
            zoomer.add(obj(field("block", ints(pos)), field("quart", ints(quart))));
        }

        List<String> endSamples = new ArrayList<>();
        NoiseGeneratorSettings endSettings = provider.lookupOrThrow(Registries.NOISE_SETTINGS)
            .getOrThrow(NoiseGeneratorSettings.END).value();
        RandomState endState = RandomState.create(provider.lookupOrThrow(Registries.NOISE), SEED, endSettings);
        BiomeSource endSource = TheEndBiomeSource.create(provider.lookupOrThrow(Registries.BIOME));
        BiomeResolver endResolver = endSource.createResolver(
            endState.createClimateSampler(SamplerContext.EMPTY_UNCACHED)
        );
        List<int[]> endPositions = new ArrayList<>();
        for (int quartX : new int[] { 0, 20, 60, 120, 260, 500, 900, 1500 }) {
            for (int quartZ : new int[] { 0, 33, -77, 410 }) {
                endPositions.add(new int[] { quartX, 16, quartZ });
            }
        }
        for (int[] quart : endPositions) {
            endSamples.add(
                obj(
                    field("quart", ints(quart)),
                    field("biome", quote(endResolver.getNoiseBiome(quart[0], quart[1], quart[2])
                        .unwrapKey().orElseThrow().identifier().toString()))
                )
            );
        }

        List<String> obfuscated = new ArrayList<>();
        for (long seed : new long[] { 0L, 1L, -1L, 1234L, 123456789012345L, -9223372036854775808L }) {
            obfuscated.add(
                obj(
                    field("seed", quote(Long.toString(seed))),
                    field("obfuscated", quote(Long.toString(BiomeManager.obfuscateSeed(seed))))
                )
            );
        }

        List<String> quantized = new ArrayList<>();
        for (float value : new float[] {
            0.0F, 1.0F, -1.0F, 0.3F, -0.3F, 0.05F, -0.05F, 1.9F, -1.9F, 0.55F, 0.0003F, -0.0003F, 0.0007F, 0.0014F, 0.0024F
        }) {
            quantized.add(
                obj(
                    field("value", Float.toString(value)),
                    field("quantized", Long.toString(Climate.quantizeCoord(value)))
                )
            );
        }

        return obj(
            field("seed", quote(Long.toString(SEED))),
            field("quantizeCoord", array(quantized)),
            field("parameterLists", array(lists)),
            field("obfuscateSeed", array(obfuscated)),
            field("biomeZoom", array(zoomer)),
            field("end", array(endSamples))
        );
    }

    /**
     * Writes one climate parameter list with its biome names, the quantized parameter points and
     * the biome the search tree and a brute-force scan each return for the sample targets.
     */
    private static String dumpParameterList(
        final HolderLookup.Provider provider,
        final String name,
        final ResourceKey<MultiNoiseBiomeSourceParameterList> key
    ) {
        MultiNoiseBiomeSourceParameterList preset =
            provider.lookupOrThrow(Registries.MULTI_NOISE_BIOME_SOURCE_PARAMETER_LIST).getOrThrow(key).value();
        Climate.ParameterList<Holder<Biome>> parameters = preset.parameters();

        List<String> biomeNames = new ArrayList<>();
        Map<String, Integer> index = new java.util.LinkedHashMap<>();
        for (Pair<Climate.ParameterPoint, Holder<Biome>> entry : parameters.values()) {
            String biome = entry.getSecond().unwrapKey().orElseThrow().identifier().toString();
            if (index.putIfAbsent(biome, index.size()) == null) biomeNames.add(quote(biome));
        }

        List<String> points = new ArrayList<>();
        for (Pair<Climate.ParameterPoint, Holder<Biome>> entry : parameters.values()) {
            Climate.ParameterPoint point = entry.getFirst();
            String biome = entry.getSecond().unwrapKey().orElseThrow().identifier().toString();
            points.add(
                packed(new long[] {
                    index.get(biome),
                    point.temperature().min(), point.temperature().max(),
                    point.humidity().min(), point.humidity().max(),
                    point.continentalness().min(), point.continentalness().max(),
                    point.erosion().min(), point.erosion().max(),
                    point.depth().min(), point.depth().max(),
                    point.weirdness().min(), point.weirdness().max(),
                    point.offset()
                })
            );
        }

        List<String> lookups = new ArrayList<>();
        for (int[] target : CLIMATE_TARGETS) {
            Climate.TargetPoint point =
                new Climate.TargetPoint(target[0], target[1], target[2], target[3], target[4], target[5]);
            lookups.add(
                obj(
                    field("target", ints(target)),
                    field("tree", quote(parameters.findValue(point).unwrapKey().orElseThrow()
                        .identifier().toString())),
                    field("bruteForce", quote(parameters.findValueBruteForce(point).unwrapKey().orElseThrow()
                        .identifier().toString()))
                )
            );
        }

        return obj(
            field("name", quote(name)),
            field("biomes", array(biomeNames)),
            field("points", array(points)),
            field("lookups", array(lookups))
        );
    }

    /** Reproduces `BiomeManager.getBiome`'s cell choice by recording which quart it lands on. */
    private static int[] biomeZoom(final long zoomSeed, final int x, final int y, final int z) {
        int[] chosen = new int[3];
        BiomeResolver probe = (quartX, quartY, quartZ) -> {
            chosen[0] = quartX;
            chosen[1] = quartY;
            chosen[2] = quartZ;
            return null;
        };
        new BiomeManager(probe, zoomSeed).getBiome(new net.minecraft.core.BlockPos(x, y, z));
        return chosen;
    }

    // --------------------------------------------------------------- the carvers

    private static final List<String> CARVER_CASES = List.of("minecraft:cave", "minecraft:canyon");
    /** The target chunks each carver vector covers. */
    private static final int[][] CARVED_CHUNKS = { { 3, -5 }, { 0, 0 }, { 12, 7 }, { -20, 33 }, { 41, -62 } };

    private static String dumpCarver(final HolderLookup.Provider provider, final Path jar) {
        NoiseGeneratorSettings settings = provider.lookupOrThrow(Registries.NOISE_SETTINGS)
            .getOrThrow(NoiseGeneratorSettings.OVERWORLD).value();
        int minY = settings.noiseSettings().minY();
        int height = settings.noiseSettings().height();
        LevelHeightAccessor heightAccessor = LevelHeightAccessor.create(minY, height);
        BiomeSource biomeSource = createBiomeSource(provider, "overworld");
        ChunkGenerator generator = new NoiseBasedChunkGenerator(
            biomeSource, provider.lookupOrThrow(Registries.NOISE_SETTINGS).getOrThrow(NoiseGeneratorSettings.OVERWORLD)
        );
        WorldGenerationContext context = new WorldGenerationContext(generator, heightAccessor);

        List<String> cases = new ArrayList<>();
        for (String carverName : CARVER_CASES) {
            Holder<WorldCarver> carver = provider.lookupOrThrow(Registries.CARVER)
                .getOrThrow(ResourceKey.create(Registries.CARVER,
                    net.minecraft.resources.Identifier.parse(carverName)));
            List<String> chunks = new ArrayList<>();
            for (int[] target : CARVED_CHUNKS) {
                chunks.add(carveBody(context, carver.value(), minY, height, target[0], target[1]));
            }
            cases.add(obj(field("carver", quote(carverName)), field("chunks", array(chunks))));
        }

        return obj(
            field("seed", quote(Long.toString(SEED))),
            field("chunkX", Integer.toString(CHUNK_X)),
            field("chunkZ", Integer.toString(CHUNK_Z)),
            field("minY", Integer.toString(minY)),
            field("height", Integer.toString(height)),
            field("cases", array(cases))
        );
    }

    /**
     * Runs one carver over the 17 by 17 source chunks around the target chunk, the way
     * `NoiseBasedChunkGenerator.generateCarvers` does when every biome lists exactly that carver,
     * and returns the mask as the column segments `CarvingMask.visit` reports.
     */
    private static String carveBody(
        final WorldGenerationContext context,
        final WorldCarver carver,
        final int minY,
        final int height,
        final int chunkX,
        final int chunkZ
    ) {
        int maxY = minY + height - 1 - 7;
        CarvingMask mask = new CarvingMask(minY + 1, maxY);
        WorldgenRandom random = new WorldgenRandom(new LegacyRandomSource(0L));
        ChunkPos pos = new ChunkPos(chunkX, chunkZ);
        List<String> starts = new ArrayList<>();

        for (int dx = -8; dx <= 8; dx++) {
            for (int dz = -8; dz <= 8; dz++) {
                ChunkPos sourcePos = new ChunkPos(pos.x() + dx, pos.z() + dz);
                random.setLargeFeatureSeed(SEED, sourcePos.x(), sourcePos.z());
                if (carver.isStartChunk(random)) {
                    starts.add(ints(new int[] { sourcePos.x(), sourcePos.z() }));
                    carver.carve(context, random, pos, sourcePos, mask);
                }
            }
        }

        List<String> segments = new ArrayList<>();
        mask.visit((x, z, bottomY, topY) -> segments.add(ints(new int[] { x, z, bottomY, topY })));
        return obj(
            field("chunkX", Integer.toString(chunkX)),
            field("chunkZ", Integer.toString(chunkZ)),
            field("maskMinY", Integer.toString(minY + 1)),
            field("maskMaxY", Integer.toString(maxY)),
            field("starts", array(starts)),
            field("segments", array(segments))
        );
    }

    // ------------------------------------------------------------- json output

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

    private static String ints(final int[] values) {
        List<String> parts = new ArrayList<>();
        for (int value : values) parts.add(Integer.toString(value));
        return array(parts);
    }

    /**
     * Packs one parameter point into a single space-separated string. Prettier keeps a string on
     * one line, where it would explode a 7594-entry array of 14-number arrays into one number per
     * line.
     */
    private static String packed(final long[] values) {
        List<String> parts = new ArrayList<>();
        for (long value : values) parts.add(Long.toString(value));
        return quote(String.join(" ", parts));
    }

    private static String longs(final long[] values) {
        List<String> parts = new ArrayList<>();
        for (long value : values) parts.add(Long.toString(value));
        return array(parts);
    }

    private DumpSurfaceVectors() {}
}
