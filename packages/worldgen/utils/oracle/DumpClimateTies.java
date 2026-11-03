import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;

import com.mojang.datafixers.util.Pair;

import net.minecraft.SharedConstants;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.registries.VanillaRegistries;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterList;
import net.minecraft.world.level.biome.MultiNoiseBiomeSourceParameterLists;
import net.minecraft.world.level.levelgen.NoiseGeneratorSettings;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.levelgen.densityfunction.SamplerContext;

/**
 * Dumps `vectors/climate-ties.json`: overworld cells where two climate boxes sit at exactly the
 * same distance from the sampled target, and what Java's search tree answers for each of them.
 *
 * Java's `Climate.RTree.search` starts from a thread-local `lastResult` and replaces it only on
 * a strictly smaller distance, so a tie is won by whichever tied box the thread found first. The
 * dumper records that dependence directly. For each cell it answers
 *
 * <ul>
 *   <li>`fresh`: the lookup on a thread that has looked nothing up, which is the answer with no
 *       history;</li>
 *   <li>`primed`: the lookup after a first lookup that lands on each tied biome, which is the
 *       answer a thread with that history gets.</li>
 * </ul>
 *
 * Every lookup runs on its own thread, because the thread-local is what carries the history.
 *
 * Usage: `DumpClimateTies <output-directory>`, run from inside `node_modules/.cache/jsprismarine/`.
 */
public final class DumpClimateTies {
    private static final long SEED = 1234L;

    /** Cells the 26.3 review found tied, as quart x, y, z. */
    private static final int[][] POSITIONS = { { 65, 0, -186 }, { 65, 16, -186 }, { 65, 40, -186 } };

    public static void main(final String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: DumpClimateTies <output-directory>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();

        HolderLookup.Provider provider = VanillaRegistries.createWorldLookup();
        MultiNoiseBiomeSourceParameterList preset = provider
            .lookupOrThrow(Registries.MULTI_NOISE_BIOME_SOURCE_PARAMETER_LIST)
            .getOrThrow(MultiNoiseBiomeSourceParameterLists.OVERWORLD)
            .value();
        Climate.ParameterList<Holder<Biome>> parameters = preset.parameters();

        NoiseGeneratorSettings settings = provider.lookupOrThrow(Registries.NOISE_SETTINGS)
            .getOrThrow(NoiseGeneratorSettings.OVERWORLD).value();
        RandomState state = RandomState.create(provider.lookupOrThrow(Registries.NOISE), SEED, settings);
        Climate.Sampler sampler = state.createClimateSampler(SamplerContext.EMPTY_UNCACHED);

        List<String> cells = new ArrayList<>();
        for (int[] quart : POSITIONS) {
            Climate.TargetPoint target = sampler.sample(quart[0], quart[1], quart[2]);

            long best = Long.MAX_VALUE;
            for (Pair<Climate.ParameterPoint, Holder<Biome>> entry : parameters.values()) {
                best = Math.min(best, entry.getFirst().fitness(target));
            }
            // The tied boxes, one example per biome so the primer below has a box to aim at.
            Map<String, Climate.ParameterPoint> tied = new LinkedHashMap<>();
            for (Pair<Climate.ParameterPoint, Holder<Biome>> entry : parameters.values()) {
                if (entry.getFirst().fitness(target) == best) {
                    tied.putIfAbsent(nameOf(entry.getSecond()), entry.getFirst());
                }
            }

            String fresh = onNewThread(() -> nameOf(parameters.findValue(target)));
            List<String> primed = new ArrayList<>();
            for (Map.Entry<String, Climate.ParameterPoint> side : tied.entrySet()) {
                Climate.TargetPoint primer = primerFor(parameters, side.getKey(), side.getValue());
                if (primer == null) continue;
                String answer = onNewThread(() -> {
                    parameters.findValue(primer);
                    return nameOf(parameters.findValue(target));
                });
                primed.add(
                    obj(
                        field("primedWith", quote(side.getKey())),
                        field("primer", longs(
                            primer.temperature(), primer.humidity(), primer.continentalness(),
                            primer.erosion(), primer.depth(), primer.weirdness()
                        )),
                        field("answer", quote(answer))
                    )
                );
            }

            cells.add(
                obj(
                    field("quart", ints(quart[0], quart[1], quart[2])),
                    field("target", longs(
                        target.temperature(), target.humidity(), target.continentalness(),
                        target.erosion(), target.depth(), target.weirdness()
                    )),
                    field("distance", Long.toString(best)),
                    field("tied", array(tied.keySet().stream().map(DumpClimateTies::quote).toList())),
                    field("fresh", quote(fresh)),
                    field("primed", array(primed))
                )
            );
        }

        Path out = Path.of(args[0]);
        Files.createDirectories(out);
        Path file = out.resolve("climate-ties.json");
        Files.writeString(
            file,
            obj(field("seed", quote(Long.toString(SEED))), field("cells", array(cells))) + "\n",
            StandardCharsets.UTF_8
        );
        System.out.println("wrote " + file);
    }

    /**
     * A target that a lookup resolves to the given biome by a box of that biome, so searching it
     * first leaves that biome's box as the thread's `lastResult`. A box's lower corner can lose
     * to an overlapping box, so the first of the corner, center and upper corner that works wins.
     */
    private static Climate.TargetPoint primerFor(
        final Climate.ParameterList<Holder<Biome>> parameters,
        final String biome,
        final Climate.ParameterPoint box
    ) throws Exception {
        List<Climate.TargetPoint> candidates = List.of(
            new Climate.TargetPoint(
                box.temperature().min(), box.humidity().min(), box.continentalness().min(),
                box.erosion().min(), box.depth().min(), box.weirdness().min()
            ),
            new Climate.TargetPoint(
                middle(box.temperature()), middle(box.humidity()), middle(box.continentalness()),
                middle(box.erosion()), middle(box.depth()), middle(box.weirdness())
            ),
            new Climate.TargetPoint(
                box.temperature().max(), box.humidity().max(), box.continentalness().max(),
                box.erosion().max(), box.depth().max(), box.weirdness().max()
            )
        );
        for (Climate.TargetPoint candidate : candidates) {
            if (biome.equals(onNewThread(() -> nameOf(parameters.findValue(candidate))))) return candidate;
        }
        return null;
    }

    private static long middle(final Climate.Parameter parameter) {
        return (parameter.min() + parameter.max()) / 2;
    }

    private static String nameOf(final Holder<Biome> biome) {
        return biome.unwrapKey().orElseThrow().identifier().toString();
    }

    /** Runs a lookup on a thread of its own, so the thread-local `lastResult` starts empty. */
    private static <T> T onNewThread(final Callable<T> work) throws Exception {
        Object[] result = new Object[1];
        Throwable[] failure = new Throwable[1];
        Thread thread = new Thread(() -> {
            try {
                result[0] = work.call();
            } catch (Throwable error) {
                failure[0] = error;
            }
        });
        thread.start();
        thread.join();
        if (failure[0] != null) throw new IOException(failure[0]);
        @SuppressWarnings("unchecked")
        T value = (T) result[0];
        return value;
    }

    // ---------------------------------------------------------------- JSON

    private static String quote(final String value) {
        return "\"" + value + "\"";
    }

    private static String field(final String name, final String value) {
        return quote(name) + ":" + value;
    }

    private static String obj(final String... fields) {
        return "{" + String.join(",", fields) + "}";
    }

    private static String array(final List<String> values) {
        return "[" + String.join(",", values) + "]";
    }

    private static String ints(final int... values) {
        List<String> parts = new ArrayList<>();
        for (int value : values) parts.add(Integer.toString(value));
        return array(parts);
    }

    private static String longs(final long... values) {
        List<String> parts = new ArrayList<>();
        for (long value : values) parts.add(Long.toString(value));
        return array(parts);
    }
}
