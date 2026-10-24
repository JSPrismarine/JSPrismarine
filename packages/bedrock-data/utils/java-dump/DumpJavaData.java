import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

import net.minecraft.SharedConstants;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.DefaultAttributes;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.MapColor;

/**
 * Dumps the block properties and entity attributes Java Edition keeps in code and publishes in no
 * report. Run against the unobfuscated server jar on the classpath; writes two JSON files into the
 * output directory given as the only argument. The runner script beside this file compiles and
 * invokes it; docs/research/java-code-only-behavior.md section 1 describes the approach.
 */
public final class DumpJavaData {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: DumpJavaData <output-directory>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();

        Path out = Path.of(args[0]);
        Files.createDirectories(out);
        write(out.resolve("block_properties.json"), dumpBlocks());
        write(out.resolve("entity_attributes.json"), dumpEntities());
    }

    private static void write(Path file, String json) throws IOException {
        Files.writeString(file, json, StandardCharsets.UTF_8);
        System.out.println("wrote " + file);
    }

    /** Names each canonical instance of a class holding public static constants, like SoundType. */
    private static Map<Object, String> constantNames(Class<?> holder, Class<?> type) throws Exception {
        Map<Object, String> names = new IdentityHashMap<>();
        for (Field field : holder.getFields()) {
            if (Modifier.isStatic(field.getModifiers()) && type.isAssignableFrom(field.getType())) {
                names.putIfAbsent(field.get(null), field.getName().toLowerCase());
            }
        }
        return names;
    }

    @SuppressWarnings("unchecked")
    private static Map<Block, Integer> fireOdds(String fieldName) throws Exception {
        Field field = Blocks.FIRE.getClass().getDeclaredField(fieldName);
        field.setAccessible(true);
        return (Map<Block, Integer>) field.get(Blocks.FIRE);
    }

    private static String stateKey(BlockState state) {
        return state.getValues()
                .map(value -> value.property().getName() + "=" + value.valueName())
                .sorted()
                .collect(Collectors.joining(","));
    }

    private static String dumpBlocks() throws Exception {
        Map<Object, String> soundNames = constantNames(SoundType.class, SoundType.class);
        Map<Object, String> mapColorNames = constantNames(MapColor.class, MapColor.class);
        Map<Block, Integer> igniteOdds = fireOdds("igniteOdds");
        Map<Block, Integer> burnOdds = fireOdds("burnOdds");

        Json root = new Json();
        for (Block block : BuiltInRegistries.BLOCK) {
            String id = BuiltInRegistries.BLOCK.getKey(block).toString();
            BlockState defaultState = block.defaultBlockState();

            Map<String, String> base = stateProperties(defaultState, soundNames, mapColorNames);
            base.put("blastResistance", Json.number(block.getExplosionResistance()));
            base.put("friction", Json.number(block.getFriction()));
            base.put("speedFactor", Json.number(block.getSpeedFactor()));
            base.put("jumpFactor", Json.number(block.getJumpFactor()));
            base.put("bounceRestitution", Json.number(block.getBounceRestitution()));
            base.put("fallDistanceReduction", Json.number(block.getFallDistanceReduction()));
            base.put("igniteOdds", Integer.toString(igniteOdds.getOrDefault(block, 0)));
            base.put("burnOdds", Integer.toString(burnOdds.getOrDefault(block, 0)));

            Json entry = new Json();
            var states = block.getStateDefinition().getPossibleStates();
            entry.raw("stateCount", Integer.toString(states.size()));
            entry.object("base", base);

            Json overrides = new Json();
            for (BlockState state : states) {
                Map<String, String> values = stateProperties(state, soundNames, mapColorNames);
                Map<String, String> diff = new LinkedHashMap<>();
                for (Map.Entry<String, String> value : values.entrySet()) {
                    if (!value.getValue().equals(base.get(value.getKey()))) {
                        diff.put(value.getKey(), value.getValue());
                    }
                }
                if (!diff.isEmpty()) {
                    overrides.object(stateKey(state), diff);
                }
            }
            if (!overrides.isEmpty()) {
                entry.raw("stateOverrides", overrides.toString());
            }
            root.raw(id, entry.toString());
        }
        return root.toString() + "\n";
    }

    /** The per-state slice of the property table; state-invariant fields are added by the caller. */
    private static Map<String, String> stateProperties(
            BlockState state, Map<Object, String> soundNames, Map<Object, String> mapColorNames) {
        Map<String, String> row = new LinkedHashMap<>();
        row.put("hardness", Json.number(state.getDestroySpeed(null, null)));
        row.put("lightEmission", Integer.toString(state.getLightEmission()));
        row.put("lightDampening", Integer.toString(state.getLightDampening()));
        row.put("mapColor", Json.string(mapColorNames.get(state.getMapColor(null, null))));
        row.put("soundType", Json.string(soundNames.get(state.getSoundType())));
        row.put("pushReaction", Json.string(state.getPistonPushReaction().name().toLowerCase()));
        row.put("instrument", Json.string(state.instrument().getSerializedName()));
        row.put("requiresCorrectTool", Boolean.toString(state.requiresCorrectToolForDrops()));
        row.put("randomTick", Boolean.toString(state.isRandomlyTicking()));
        return row;
    }

    @SuppressWarnings("unchecked")
    private static String dumpEntities() throws Exception {
        Field suppliersField = DefaultAttributes.class.getDeclaredField("SUPPLIERS");
        suppliersField.setAccessible(true);
        Map<EntityType<?>, AttributeSupplier> suppliers =
                (Map<EntityType<?>, AttributeSupplier>) suppliersField.get(null);
        Field instancesField = AttributeSupplier.class.getDeclaredField("instances");
        instancesField.setAccessible(true);

        Json root = new Json();
        for (EntityType<?> type : BuiltInRegistries.ENTITY_TYPE) {
            AttributeSupplier supplier = suppliers.get(type);
            if (supplier == null) {
                continue;
            }
            Map<Holder<?>, AttributeInstance> instances =
                    (Map<Holder<?>, AttributeInstance>) instancesField.get(supplier);
            Map<String, String> attributes = new TreeMap<>();
            for (Map.Entry<Holder<?>, AttributeInstance> instance : instances.entrySet()) {
                String attributeId = instance.getKey().unwrapKey().orElseThrow().identifier().toString();
                attributes.put(attributeId, Json.number(instance.getValue().getBaseValue()));
            }

            Json entry = new Json();
            entry.raw("category", Json.string(type.getCategory().getName()));
            entry.raw("width", Json.number(type.getDimensions().width()));
            entry.raw("height", Json.number(type.getDimensions().height()));
            entry.object("attributes", attributes);
            root.raw(BuiltInRegistries.ENTITY_TYPE.getKey(type).toString(), entry.toString());
        }
        return root.toString() + "\n";
    }

    /** A minimal insertion-ordered JSON object writer; values arrive already encoded. */
    private static final class Json {
        private final Map<String, String> members = new LinkedHashMap<>();

        void raw(String key, String encodedValue) {
            members.put(key, encodedValue);
        }

        void object(String key, Map<String, String> encodedMembers) {
            Json nested = new Json();
            nested.members.putAll(encodedMembers);
            members.put(key, nested.toString());
        }

        boolean isEmpty() {
            return members.isEmpty();
        }

        @Override
        public String toString() {
            return members.entrySet().stream()
                    .map(member -> string(member.getKey()) + ":" + member.getValue())
                    .collect(Collectors.joining(",", "{", "}"));
        }

        static String string(String value) {
            StringBuilder sb = new StringBuilder("\"");
            for (char c : value.toCharArray()) {
                if (c == '"' || c == '\\') sb.append('\\');
                if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                else sb.append(c);
            }
            return sb.append('"').toString();
        }

        /** Encodes a float or double compactly; both editions' values survive a JSON round trip. */
        static String number(double value) {
            if (value == Math.rint(value) && Math.abs(value) < 1e15) {
                return Long.toString((long) value);
            }
            return Double.toString(value);
        }

        static String number(float value) {
            if (value == Math.rint(value) && Math.abs(value) < 1e15) {
                return Long.toString((long) value);
            }
            return Float.toString(value);
        }
    }
}
