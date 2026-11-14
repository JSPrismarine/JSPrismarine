import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.core.CompositeDirection.Direction8;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.IdMapper;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.registries.VanillaRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.Bootstrap;
import net.minecraft.util.Mth;
import net.minecraft.world.level.ChunkPos;
import net.minecraft.world.level.LevelHeightAccessor;
import net.minecraft.world.level.WorldGenLevel;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeResolver;
import net.minecraft.world.level.biome.Biomes;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.CarvingMask;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.PalettedContainerFactory;
import net.minecraft.world.level.chunk.ProtoChunk;
import net.minecraft.world.level.chunk.Strategy;
import net.minecraft.world.level.chunk.UpgradeData;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.chunk.storage.IOWorker;
import net.minecraft.world.level.levelgen.blending.Blender;
import net.minecraft.world.level.levelgen.blending.BlendingData;
import net.minecraft.world.level.levelgen.synth.Noise;

/**
 * Dumps `vectors/blending.json`: Java's world blender run over a fixed arrangement of synthetic
 * old chunks.
 *
 * The old chunks are `ProtoChunk`s filled by {@link #blockAt}, a deterministic terrain that
 * `src/blending/blending.test.ts` rebuilds block for block. Each gets a `BlendingData` the way
 * `Blender.of` would: calculated against which of its neighbors are old. The dump records each
 * record's heights, densities and biome columns, then, for a few chunks being generated, what
 * `blendOffsetAndFactor`, `blendDensity`, the biome resolver and the carving filter answer.
 *
 * `Blender.of` takes a `WorldGenRegion`, which needs a running server. The dump builds the two
 * maps with `Blender.of`'s own loop and hands them to the private constructor instead, so the maps
 * are real fastutil maps filled in Java's order. The carving filter comes from the private
 * `createAroundOldChunksCarvingMaskFilter`, called with a proxy `WorldGenLevel` that answers
 * `getChunk`.
 *
 * It also records the two data versions that decide which chunks are old: the jar's own, and the
 * lowest one `IOWorker.isOldChunk` does not treat as old.
 *
 * Usage: `DumpBlendingVectors <output-directory>`, run from inside `node_modules/.cache/jsprismarine/`.
 */
public final class DumpBlendingVectors {
    /** Old chunks whose old generation covers the whole 26.3 overworld, sections -4 to 20. */
    private static final int[][] FULL_HEIGHT_OLD = {
        { -3, -2 }, { -3, -1 }, { -3, 0 }, { -3, 1 }, { -3, 2 },
        { -2, -2 }, { -2, -1 }, { -2, 0 }, { -2, 1 }, { -2, 2 },
        { -1, -2 }, { -1, -1 }, { -1, 0 }, { -1, 1 }, { -1, 2 },
        { 3, -4 }
    };
    /** Old chunks from before 1.18, covering sections 0 to 16. */
    private static final int[][] LOW_OLD = { { 2, 3 } };
    /** The chunks the blender is asked about. (-2, 0) is itself old. */
    private static final int[][] CENTERS = { { 0, 0 }, { 1, 2 }, { -2, 0 }, { 6, -3 } };

    /** The center of the circle of chunks whose map order is dumped; it puts chunk 0, 0 in it. */
    private static final int[] HASH_ORDER_CENTER = { 3, -2 };

    private static final String[] BIOMES = { "minecraft:plains", "minecraft:forest", "minecraft:desert" };

    public static void main(final String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: DumpBlendingVectors <output-directory>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();

        HolderLookup.Provider provider = VanillaRegistries.createWorldLookup();
        List<Holder<Biome>> biomes = new ArrayList<>();
        IdMapper<Holder<Biome>> biomeIds = new IdMapper<>();
        for (String name : BIOMES) {
            Holder<Biome> holder = provider.lookupOrThrow(Registries.BIOME)
                .getOrThrow(ResourceKey.create(Registries.BIOME, net.minecraft.resources.Identifier.parse(name)));
            biomes.add(holder);
            biomeIds.add(holder);
        }
        PalettedContainerFactory containers = new PalettedContainerFactory(
            Strategy.createForBlockStates(Block.BLOCK_STATE_REGISTRY),
            Blocks.AIR.defaultBlockState(),
            null,
            Strategy.createForBiomes(biomeIds),
            biomes.get(0),
            null
        );
        LevelHeightAccessor world = LevelHeightAccessor.create(-64, 384);

        Map<Long, ProtoChunk> oldChunks = new HashMap<>();
        for (int[] at : FULL_HEIGHT_OLD) oldChunks.put(ChunkPos.pack(at[0], at[1]), oldChunk(at, -4, 20, world, containers, biomes));
        for (int[] at : LOW_OLD) oldChunks.put(ChunkPos.pack(at[0], at[1]), oldChunk(at, 0, 16, world, containers, biomes));

        Map<Long, ProtoChunk> newChunks = new HashMap<>();
        WorldGenLevel region = (WorldGenLevel) Proxy.newProxyInstance(
            WorldGenLevel.class.getClassLoader(),
            new Class<?>[] { WorldGenLevel.class },
            (proxy, method, methodArgs) -> {
                if (method.getName().equals("getChunk") && methodArgs.length >= 2 && methodArgs[0] instanceof Integer x) {
                    int z = (Integer) methodArgs[1];
                    ProtoChunk old = oldChunks.get(ChunkPos.pack(x, z));
                    if (old != null) return old;
                    return newChunks.computeIfAbsent(ChunkPos.pack(x, z), key -> new ProtoChunk(
                        new ChunkPos(x, z), UpgradeData.EMPTY, world, containers, null
                    ));
                }
                throw new UnsupportedOperationException(method.toString());
            }
        );

        Method calculateData = BlendingData.class.getDeclaredMethod("calculateData", ChunkAccess.class, Set.class);
        calculateData.setAccessible(true);
        Field densitiesField = BlendingData.class.getDeclaredField("densities");
        densitiesField.setAccessible(true);
        Field biomesField = BlendingData.class.getDeclaredField("biomes");
        biomesField.setAccessible(true);

        // Blender.of calls getOrUpdateBlendingData, which calculates each record against the
        // record's own neighbors before it is used. Every record here is calculated up front.
        List<String> records = new ArrayList<>();
        List<Long> keys = new ArrayList<>(oldChunks.keySet());
        keys.sort(Long::compare);
        for (long key : keys) {
            ProtoChunk chunk = oldChunks.get(key);
            BlendingData data = chunk.getBlendingData();
            Set<Direction8> newSides = BlendingData.sideByGenerationAge(region, ChunkPos.getX(key), ChunkPos.getZ(key), false);
            calculateData.invoke(data, chunk, newSides);

            List<String> heights = new ArrayList<>();
            BlendingData.Packed packed = data.pack();
            float[] packedHeights = packed.heights().orElse(null);
            for (int i = 0; i < 16; i++) heights.add(packedHeights == null ? "null" : floatJson(packedHeights[i]));

            float[][] densities = (float[][]) densitiesField.get(data);
            List<String> densityColumns = new ArrayList<>();
            for (float[] column : densities) {
                if (column == null) {
                    densityColumns.add("null");
                    continue;
                }
                List<String> values = new ArrayList<>();
                for (float value : column) values.add(floatJson(value));
                densityColumns.add("[" + String.join(",", values) + "]");
            }

            @SuppressWarnings("unchecked")
            List<List<Holder<Biome>>> biomeColumns = (List<List<Holder<Biome>>>) biomesField.get(data);
            List<String> biomeJson = new ArrayList<>();
            for (List<Holder<Biome>> column : biomeColumns) {
                if (column == null) {
                    biomeJson.add("null");
                    continue;
                }
                StringBuilder indices = new StringBuilder();
                for (Holder<Biome> biome : column) indices.append(biomes.indexOf(biome));
                biomeJson.add("\"" + indices + "\"");
            }

            records.add("{\"x\":" + ChunkPos.getX(key) + ",\"z\":" + ChunkPos.getZ(key)
                + ",\"minSection\":" + packed.minSection() + ",\"maxSection\":" + packed.maxSection()
                + ",\"heights\":[" + String.join(",", heights) + "]"
                + ",\"densities\":[" + String.join(",", densityColumns) + "]"
                + ",\"biomes\":[" + String.join(",", biomeJson) + "]}");
        }

        Constructor<Blender> blenderConstructor = Blender.class.getDeclaredConstructor(
            Long2ObjectOpenHashMap.class, Long2ObjectOpenHashMap.class, CarvingMask.Filter.class
        );
        blenderConstructor.setAccessible(true);
        Method carvingFilterOf = Blender.class.getDeclaredMethod(
            "createAroundOldChunksCarvingMaskFilter", WorldGenLevel.class, ChunkAccess.class
        );
        carvingFilterOf.setAccessible(true);
        Method offsetAndFactor = Blender.class.getDeclaredMethod("blendOffsetAndFactor", int.class, int.class);
        offsetAndFactor.setAccessible(true);

        List<String> centers = new ArrayList<>();
        for (int[] center : CENTERS) {
            int centerX = center[0];
            int centerZ = center[1];
            Long2ObjectOpenHashMap<BlendingData> heightAndBiome = new Long2ObjectOpenHashMap<>();
            Long2ObjectOpenHashMap<BlendingData> density = new Long2ObjectOpenHashMap<>();
            int range = 7;
            int maxDistSq = Mth.square(range + 1);
            for (int dx = -range; dx <= range; dx++) {
                for (int dz = -range; dz <= range; dz++) {
                    if (dx * dx + dz * dz > maxDistSq) continue;
                    ProtoChunk old = oldChunks.get(ChunkPos.pack(centerX + dx, centerZ + dz));
                    if (old == null) continue;
                    heightAndBiome.put(ChunkPos.pack(centerX + dx, centerZ + dz), old.getBlendingData());
                    if (dx >= -1 && dx <= 1 && dz >= -1 && dz <= 1) {
                        density.put(ChunkPos.pack(centerX + dx, centerZ + dz), old.getBlendingData());
                    }
                }
            }
            CarvingMask.Filter filter = (CarvingMask.Filter) carvingFilterOf.invoke(
                null, region, region.getChunk(centerX, centerZ)
            );
            Blender blender = blenderConstructor.newInstance(heightAndBiome, density, filter);

            int minBlockX = centerX * 16;
            int minBlockZ = centerZ * 16;

            List<String> offsets = new ArrayList<>();
            for (int z = minBlockZ - 4; z < minBlockZ + 20; z += 2) {
                for (int x = minBlockX - 4; x < minBlockX + 20; x += 2) {
                    Object output = offsetAndFactor.invoke(blender, x, z);
                    Method alpha = output.getClass().getDeclaredMethod("alpha");
                    Method offset = output.getClass().getDeclaredMethod("blendingOffset");
                    alpha.setAccessible(true);
                    offset.setAccessible(true);
                    offsets.add(floatJson((Float) alpha.invoke(output)));
                    offsets.add(floatJson((Float) offset.invoke(output)));
                }
            }

            List<String> densities = new ArrayList<>();
            for (int z = minBlockZ - 2; z < minBlockZ + 18; z += 5) {
                for (int x = minBlockX - 2; x < minBlockX + 18; x += 5) {
                    for (int y = -72; y <= 330; y += 9) {
                        densities.add(floatJson(blender.blendDensity(x, y, z, noiseValue(x, y, z))));
                    }
                }
            }

            BiomeResolver base = (quartX, quartY, quartZ) -> null;
            BiomeResolver resolver = blender.getBiomeResolver(base);
            StringBuilder biomeAnswers = new StringBuilder();
            for (int quartY : new int[] { -17, -16, -1, 0, 15, 16, 20, 63, 64, 79, 80 }) {
                for (int quartZ = centerZ * 4 - 8; quartZ < centerZ * 4 + 12; quartZ++) {
                    for (int quartX = centerX * 4 - 8; quartX < centerX * 4 + 12; quartX++) {
                        Holder<Biome> biome = resolver.getNoiseBiome(quartX, quartY, quartZ);
                        biomeAnswers.append(biome == null ? "-" : Integer.toString(biomes.indexOf(biome)));
                    }
                }
            }

            StringBuilder carving = new StringBuilder();
            if (filter != null) {
                for (int y = -64; y < 320; y += 7) {
                    for (int z = 0; z < 16; z += 3) {
                        for (int x = 0; x < 16; x += 3) carving.append(filter.test(x, y, z) ? '1' : '0');
                    }
                }
            }

            centers.add("{\"x\":" + centerX + ",\"z\":" + centerZ
                + ",\"empty\":" + blender.isEmpty()
                + ",\"offsets\":[" + String.join(",", offsets) + "]"
                + ",\"densities\":[" + String.join(",", densities) + "]"
                + ",\"biomes\":\"" + biomeAnswers + "\""
                + ",\"carving\":" + (filter == null ? "null" : "\"" + carving + "\"") + "}");
        }

        // The order a map filled the way Blender.of fills it hands its values back in. The circle
        // around HASH_ORDER_CENTER holds key 0 and passes three rehashes (24, 48 and 96 entries).
        Long2ObjectOpenHashMap<Integer> hashOrder = new Long2ObjectOpenHashMap<>();
        int inserted = 0;
        for (int dx = -7; dx <= 7; dx++) {
            for (int dz = -7; dz <= 7; dz++) {
                if (dx * dx + dz * dz > 64) continue;
                hashOrder.put(ChunkPos.pack(HASH_ORDER_CENTER[0] + dx, HASH_ORDER_CENTER[1] + dz), Integer.valueOf(inserted++));
            }
        }
        List<String> hashOrderValues = new ArrayList<>();
        hashOrder.forEach((long key, Integer value) -> hashOrderValues.add(value.toString()));

        Field shiftField = Blender.class.getDeclaredField("SHIFT_NOISE");
        shiftField.setAccessible(true);
        Noise shift = (Noise) shiftField.get(null);
        List<String> shiftSamples = new ArrayList<>();
        for (int[] at : new int[][] { { 0, 0, 0 }, { 1, 0, -1 }, { -37, 12, 91 }, { 250, -64, -250 }, { 4096, 319, -77 } }) {
            shiftSamples.add(floatJson(shift.get(at[0], at[1], at[2])));
        }

        String json = "{\"dataVersion\":" + SharedConstants.getCurrentVersion().dataVersion().version()
            + ",\"oldBelowDataVersion\":" + oldBelowDataVersion()
            + ",\"biomes\":[\"" + String.join("\",\"", BIOMES) + "\"]"
            + ",\"shiftNoise\":[" + String.join(",", shiftSamples) + "]"
            + ",\"hashOrder\":{\"center\":[" + HASH_ORDER_CENTER[0] + "," + HASH_ORDER_CENTER[1] + "],\"order\":["
            + String.join(",", hashOrderValues) + "]}"
            + ",\"records\":[" + String.join(",", records) + "]"
            + ",\"centers\":[" + String.join(",", centers) + "]}";

        Path out = Path.of(args[0]);
        Files.createDirectories(out);
        Path file = out.resolve("blending.json");
        Files.writeString(file, json + "\n", StandardCharsets.UTF_8);
        System.out.println("wrote " + file);
    }

    /**
     * The synthetic old terrain; `blending.test.ts` has the same function.
     *
     * No block here is excluded from `isGround` by a tag. The dumper runs without a data pack, so
     * `#minecraft:leaves` and `#minecraft:logs` are unbound and would match nothing; the tag
     * exclusions belong to whoever implements `OldChunkView` and are tested there.
     */
    private static BlockState blockAt(final int x, final int y, final int z, final int minY) {
        if (y < minY) return Blocks.AIR.defaultBlockState();
        int height = 62 + Math.floorMod(x * 7 + z * 13, 23);
        boolean pond = Math.floorMod(x + z * 3, 11) == 0;
        if (y < height - 3) return Blocks.STONE.defaultBlockState();
        if (y < height) return Blocks.DIRT.defaultBlockState();
        if (y == height) return pond ? Blocks.SAND.defaultBlockState() : Blocks.GRASS_BLOCK.defaultBlockState();
        if (pond) return y <= height + 2 ? Blocks.WATER.defaultBlockState() : Blocks.AIR.defaultBlockState();
        if (Math.floorMod(x * 5 + z, 17) == 0) {
            if (y <= height + 4) return Blocks.COBBLESTONE.defaultBlockState();
            if (y <= height + 6) return Blocks.GLASS.defaultBlockState();
            return Blocks.AIR.defaultBlockState();
        }
        if (Math.floorMod(x * 3 + z * 7, 29) == 0 && y == height + 1) return Blocks.RED_MUSHROOM_BLOCK.defaultBlockState();
        if (Math.floorMod(x + z, 5) == 0 && y == height + 1) return Blocks.SHORT_GRASS.defaultBlockState();
        if (Math.floorMod(x - z, 13) == 0 && y == height + 1) return Blocks.OAK_SLAB.defaultBlockState();
        return Blocks.AIR.defaultBlockState();
    }

    /** The synthetic biome by absolute quart; `blending.test.ts` has the same function. */
    private static int biomeAt(final int quartX, final int quartY, final int quartZ) {
        return Math.floorMod(quartX + quartZ * 2 + Math.floorDiv(quartY, 4), BIOMES.length);
    }

    /** The density a chunk would have had without the blender; any deterministic value does. */
    private static float noiseValue(final int x, final int y, final int z) {
        return (float) (Math.floorMod(x * 31 + y * 17 + z * 7, 200) - 100) / 50.0F;
    }

    private static ProtoChunk oldChunk(
        final int[] at,
        final int minSection,
        final int maxSection,
        final LevelHeightAccessor world,
        final PalettedContainerFactory containers,
        final List<Holder<Biome>> biomes
    ) {
        BlendingData data = BlendingData.unpack(new BlendingData.Packed(minSection, maxSection, java.util.Optional.empty()));
        ProtoChunk chunk = new ProtoChunk(new ChunkPos(at[0], at[1]), UpgradeData.EMPTY, world, containers, data);
        // Past `terrain` before any block is placed, so only the final heightmaps are primed and the
        // record walks down from the top of the old area, as it does for a chunk loaded from disk.
        chunk.setPersistedStatus(ChunkStatus.FEATURES);
        chunk.fillBiomesFromNoise((quartX, quartY, quartZ) -> biomes.get(biomeAt(quartX, quartY, quartZ)));
        int minY = minSection * 16;
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        for (int localX = 0; localX < 16; localX++) {
            for (int localZ = 0; localZ < 16; localZ++) {
                int x = at[0] * 16 + localX;
                int z = at[1] * 16 + localZ;
                for (int y = -64; y < 120; y++) {
                    BlockState state = blockAt(x, y, z, minY);
                    if (!state.isAir()) chunk.setBlockState(pos.set(x, y, z), state);
                }
            }
        }
        return chunk;
    }

    /** The lowest data version `IOWorker.isOldChunk` does not call old, found by asking it. */
    private static int oldBelowDataVersion() throws Exception {
        Method isOldChunk = IOWorker.class.getDeclaredMethod("isOldChunk", CompoundTag.class);
        isOldChunk.setAccessible(true);
        Field unsafeField = sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
        unsafeField.setAccessible(true);
        sun.misc.Unsafe unsafe = (sun.misc.Unsafe) unsafeField.get(null);
        Object worker = unsafe.allocateInstance(IOWorker.class);

        int current = SharedConstants.getCurrentVersion().dataVersion().version();
        for (int version = 0; version <= current; version++) {
            CompoundTag tag = new CompoundTag();
            tag.putInt("DataVersion", version);
            if (!(Boolean) isOldChunk.invoke(worker, tag)) return version;
        }
        throw new IllegalStateException("every data version up to " + current + " is old");
    }

    private static String floatJson(final float value) {
        if (value == Float.MAX_VALUE) return "\"max\"";
        return Float.toString(value);
    }
}
