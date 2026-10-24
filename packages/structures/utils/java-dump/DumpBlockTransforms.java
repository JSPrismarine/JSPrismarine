import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import net.minecraft.SharedConstants;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;

/**
 * Dumps how Java Edition itself rotates and mirrors every block state. Mojang publishes no report
 * of this, and the rules are per block class: stairs swap their corner shape only when the facing
 * axis matches the mirror axis, rails permute their shape names, jigsaw blocks rotate a combined
 * front-and-top orientation. Guessing them is how a placed village comes out inside out, so they
 * are measured here instead.
 *
 * Run against the unobfuscated server jar on the classpath. The only argument is the output
 * directory; the dump lands there as `block_transforms.json`.
 */
public final class DumpBlockTransforms {
    /** The five placement transforms a structure template can be placed under. */
    private static final String[] TRANSFORM_NAMES = {
        "clockwise_90", "clockwise_180", "counterclockwise_90", "left_right", "front_back"
    };

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: DumpBlockTransforms <output-directory>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();

        StringBuilder json = new StringBuilder();
        json.append("{\n  \"javaVersion\": ")
            .append(quote(SharedConstants.getCurrentVersion().name()))
            .append(",\n  \"blocks\": {");

        boolean firstBlock = true;
        for (Block block : BuiltInRegistries.BLOCK) {
            String id = BuiltInRegistries.BLOCK.getKey(block).toString();
            List<BlockState> states = block.getStateDefinition().getPossibleStates();
            Map<BlockState, Integer> indices = new HashMap<>();
            for (int i = 0; i < states.size(); i++) {
                indices.put(states.get(i), i);
            }

            List<int[]> transforms = new ArrayList<>();
            transforms.add(indexesOf(states, indices, state -> state.rotate(Rotation.CLOCKWISE_90)));
            transforms.add(indexesOf(states, indices, state -> state.rotate(Rotation.CLOCKWISE_180)));
            transforms.add(indexesOf(states, indices, state -> state.rotate(Rotation.COUNTERCLOCKWISE_90)));
            transforms.add(indexesOf(states, indices, state -> state.mirror(Mirror.LEFT_RIGHT)));
            transforms.add(indexesOf(states, indices, state -> state.mirror(Mirror.FRONT_BACK)));

            boolean moves = false;
            for (int[] transform : transforms) {
                for (int i = 0; i < transform.length; i++) {
                    if (transform[i] != i) {
                        moves = true;
                        break;
                    }
                }
            }
            if (!moves) continue;

            if (!firstBlock) json.append(',');
            firstBlock = false;
            json.append("\n    ").append(quote(id)).append(": {");
            json.append("\n      \"properties\": [");
            List<Property<?>> properties = new ArrayList<>(block.getStateDefinition().getProperties());
            for (int i = 0; i < properties.size(); i++) {
                if (i > 0) json.append(", ");
                json.append(quote(properties.get(i).getName()));
            }
            json.append("],\n      \"states\": [");
            for (int i = 0; i < states.size(); i++) {
                if (i > 0) json.append(", ");
                json.append('[');
                for (int p = 0; p < properties.size(); p++) {
                    if (p > 0) json.append(", ");
                    json.append(quote(valueName(properties.get(p), states.get(i))));
                }
                json.append(']');
            }
            json.append(']');
            for (int t = 0; t < TRANSFORM_NAMES.length; t++) {
                json.append(",\n      ").append(quote(TRANSFORM_NAMES[t])).append(": [");
                int[] transform = transforms.get(t);
                for (int i = 0; i < transform.length; i++) {
                    if (i > 0) json.append(", ");
                    json.append(transform[i]);
                }
                json.append(']');
            }
            json.append("\n    }");
        }
        json.append("\n  }\n}\n");

        Path output = Path.of(args[0]);
        Files.createDirectories(output);
        Files.writeString(output.resolve("block_transforms.json"), json.toString(), StandardCharsets.UTF_8);
        System.out.println("Wrote " + output.resolve("block_transforms.json"));
    }

    /** One transform's target index per state, or the state's own index where it does not move. */
    private static int[] indexesOf(
        List<BlockState> states, Map<BlockState, Integer> indices, java.util.function.UnaryOperator<BlockState> apply
    ) {
        int[] result = new int[states.size()];
        for (int i = 0; i < states.size(); i++) {
            Integer target = indices.get(apply.apply(states.get(i)));
            result[i] = target == null ? i : target;
        }
        return result;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static String valueName(Property property, BlockState state) {
        return property.getName((Comparable) state.getValue(property));
    }

    private static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
            else out.append(c);
        }
        return out.append('"').toString();
    }
}
