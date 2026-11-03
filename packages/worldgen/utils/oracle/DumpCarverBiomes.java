import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.QuartPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.registries.VanillaRegistries;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeManager;
import net.minecraft.world.level.biome.BiomeResolver;
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.biome.MultiNoiseBiomeSource;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterLists;
import net.minecraft.world.level.levelgen.NoiseGeneratorSettings;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.densityfunction.SamplerContext;

/**
 * Dumps `vectors/carver-biomes.json`: the biome Java reads a source chunk's carvers from, beside
 * the biome a jittered block lookup at the same corner would give.
 *
 * `NoiseBasedChunkGenerator.getBiomeGenerationSettingsForCarver` asks the biome source for the
 * noise biome at `(QuartPos.fromBlock(minBlockX), 0, QuartPos.fromBlock(minBlockZ))`. It does not
 * go through `BiomeManager`, whose jitter moves a block's biome to a neighboring cell. The two
 * answers differ on some chunks, and a data pack whose neighboring biomes list different carvers
 * digs different caves depending on which one a generator reads.
 *
 * Usage: `DumpCarverBiomes <output-directory>`, run from inside `node_modules/.cache/jsprismarine/`.
 */
public final class DumpCarverBiomes {
    private static final long SEED = 1234L;
    private static final int FIRST_CHUNK = -24;
    private static final int CHUNKS = 48;

    public static void main(final String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: DumpCarverBiomes <output-directory>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();

        HolderLookup.Provider provider = VanillaRegistries.createWorldLookup();
        BiomeSource source = MultiNoiseBiomeSource.createFromPreset(
            provider.lookupOrThrow(Registries.MULTI_NOISE_BIOME_SOURCE_PARAMETER_LIST)
                .getOrThrow(MultiNoiseBiomeSourceParameterLists.OVERWORLD)
        );
        NoiseGeneratorSettings settings = provider.lookupOrThrow(Registries.NOISE_SETTINGS)
            .getOrThrow(NoiseGeneratorSettings.OVERWORLD).value();
        RandomState state = RandomState.create(provider.lookupOrThrow(Registries.NOISE), SEED, settings);
        BiomeResolver resolver = source.createResolver(state.createClimateSampler(SamplerContext.EMPTY_UNCACHED));
        BiomeManager manager = new BiomeManager(resolver, BiomeManager.obfuscateSeed(SEED));

        Map<String, Integer> index = new LinkedHashMap<>();
        List<String> noise = new ArrayList<>();
        List<String> jittered = new ArrayList<>();
        for (int chunkX = FIRST_CHUNK; chunkX < FIRST_CHUNK + CHUNKS; chunkX++) {
            for (int chunkZ = FIRST_CHUNK; chunkZ < FIRST_CHUNK + CHUNKS; chunkZ++) {
                int blockX = chunkX * 16;
                int blockZ = chunkZ * 16;
                Holder<Biome> carverBiome = resolver.getNoiseBiome(QuartPos.fromBlock(blockX), 0, QuartPos.fromBlock(blockZ));
                Holder<Biome> blockBiome = manager.getBiome(new BlockPos(blockX, 0, blockZ));
                noise.add(Integer.toString(indexOf(index, carverBiome)));
                jittered.add(Integer.toString(indexOf(index, blockBiome)));
            }
        }

        List<String> names = new ArrayList<>();
        for (String name : index.keySet()) names.add("\"" + name + "\"");
        String json = "{\"seed\":\"" + SEED + "\",\"firstChunk\":" + FIRST_CHUNK + ",\"chunks\":" + CHUNKS
            + ",\"biomes\":[" + String.join(",", names) + "]"
            + ",\"noise\":[" + String.join(",", noise) + "]"
            + ",\"jittered\":[" + String.join(",", jittered) + "]}";

        Path out = Path.of(args[0]);
        Files.createDirectories(out);
        Path file = out.resolve("carver-biomes.json");
        Files.writeString(file, json + "\n", StandardCharsets.UTF_8);
        System.out.println("wrote " + file);
    }

    private static int indexOf(final Map<String, Integer> index, final Holder<Biome> biome) {
        String name = biome.unwrapKey().orElseThrow().identifier().toString();
        return index.computeIfAbsent(name, key -> index.size());
    }
}
