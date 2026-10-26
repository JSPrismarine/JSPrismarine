import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.IdentityHashMap;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import sun.misc.Unsafe;

import com.mojang.serialization.Lifecycle;
import net.minecraft.SharedConstants;
import net.minecraft.core.Holder;
import net.minecraft.core.BlockPos;
import net.minecraft.core.MappedRegistry;
import net.minecraft.core.RegistrationInfo;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponentMap;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.Bootstrap;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.debug.ServerDebugSubscribers;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.level.pathfinder.PathType;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.DefaultAttributes;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.storage.LevelData;
import net.minecraft.world.level.storage.PrimaryLevelData;
import net.minecraft.world.level.storage.WorldData;
import net.minecraft.server.ServerScoreboard;

/**
 * Dumps the block properties, entity attributes and navigation Java Edition keeps in code and
 * publishes in no report. Run against the unobfuscated server jar on the classpath; writes three
 * JSON files into the output directory given as the only argument. The runner script beside this
 * file compiles and invokes it; docs/research/java-code-only-behavior.md section 1 describes the
 * approach.
 */
public final class DumpJavaData {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: DumpJavaData <output-directory>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
        initializeProbeItems();

        Path out = Path.of(args[0]);
        Files.createDirectories(out);
        write(out.resolve("block_properties.json"), dumpBlocks());
        write(out.resolve("entity_attributes.json"), dumpEntities());
        write(out.resolve("entity_navigation.json"), dumpEntityNavigation());
    }

    private static void write(Path file, String json) throws IOException {
        Files.writeString(file, json, StandardCharsets.UTF_8);
        System.out.println("wrote " + file);
    }

    /** Lets constructor-only item stacks work without loading the server's dynamic registry tags. */
    private static void initializeProbeItems() throws Exception {
        Method bindComponents = Holder.Reference.class.getDeclaredMethod("bindComponents", DataComponentMap.class);
        bindComponents.setAccessible(true);
        for (Item item : List.of(Items.POTION, Items.MILK_BUCKET)) {
            bindComponents.invoke(item.builtInRegistryHolder(), DataComponentMap.EMPTY);
        }
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

    /**
     * Dumps every non-misc mob's navigator, path costs and entity-push behavior.
     * These are code rather than a generated report, and are the source of truth for the runtime's
     * water and air navigation. Bedrock's similarly named flags describe different species.
     */
    private static String dumpEntityNavigation() throws Exception {
        Field factoryField = EntityType.class.getDeclaredField("factory");
        factoryField.setAccessible(true);
        ProbeLevel level = (ProbeLevel) allocate(ProbeLevel.class);
        Json root = new Json();
        List<String> unavailable = new ArrayList<>();

        for (EntityType<?> type : BuiltInRegistries.ENTITY_TYPE) {
            if (type.getCategory() == MobCategory.MISC) continue;
            String identifier = BuiltInRegistries.ENTITY_TYPE.getKey(type).toString();
            try {
                @SuppressWarnings("unchecked")
                EntityType.EntityFactory<Entity> factory =
                        (EntityType.EntityFactory<Entity>) factoryField.get(type);
                Entity entity = factory.create((EntityType<Entity>) type, level);
                if (!(entity instanceof Mob mob)) {
                    throw new IllegalStateException(identifier + " is not a mob");
                }

                PathNavigation navigation = mob.getNavigation();
                Map<String, String> values = new LinkedHashMap<>();
                values.put("navigationClass", Json.string(navigation.getClass().getName()));
                values.put("canFloat", Boolean.toString(navigation.canFloat()));
                values.put("canNavigateGround", Boolean.toString(navigation.canNavigateGround()));
                values.put("pushable", Boolean.toString(mob.isPushable()));
                Json pathfindingMalus = new Json();
                for (PathType pathType : PathType.values()) {
                    pathfindingMalus.raw(
                            pathType.name().toLowerCase(),
                            Json.number(mob.getPathfindingMalus(pathType)));
                }
                values.put("pathfindingMalus", pathfindingMalus.toString());
                root.object(identifier, values);
            } catch (Throwable error) {
                unavailable.add(identifier + " (" + error.getClass().getSimpleName() + ")");
            }
        }

        if (!unavailable.isEmpty()) {
            throw new IllegalStateException(
                    "Could not extract Java entity navigation for: " + String.join(", ", unavailable));
        }
        return root.toString() + "\n";
    }

    private static Object allocate(Class<?> type) throws Exception {
        Field field = Unsafe.class.getDeclaredField("theUnsafe");
        field.setAccessible(true);
        return ((Unsafe) field.get(null)).allocateInstance(type);
    }

    private static final class ProbeServer extends MinecraftServer {
        private static final ServerDebugSubscribers DEBUG = new ServerDebugSubscribers(null);
        private static final ServerScoreboard SCOREBOARD = new ServerScoreboard(null);
        private static final PrimaryLevelData WORLD_DATA = (PrimaryLevelData) allocateUnchecked(PrimaryLevelData.class);

        private ProbeServer() {
            super(null, null, null, null, java.util.Optional.empty(), null, null, null, null, false, null);
        }

        @Override
        public ServerDebugSubscribers debugSubscribers() {
            return DEBUG;
        }

        @Override
        protected boolean initServer() {
            return true;
        }

        @Override
        public net.minecraft.server.permissions.LevelBasedPermissionSet operatorUserPermissions() {
            return null;
        }

        @Override
        public net.minecraft.server.permissions.PermissionSet getFunctionCompilationPermissions() {
            return null;
        }

        @Override
        public boolean shouldRconBroadcast() {
            return false;
        }

        @Override
        protected net.minecraft.util.debugchart.SampleLogger getTickTimeLogger() {
            return null;
        }

        @Override
        public boolean isTickTimeLoggingEnabled() {
            return false;
        }

        @Override
        public net.minecraft.SystemReport fillServerSystemReport(net.minecraft.SystemReport report) {
            return report;
        }

        @Override
        public boolean isDedicatedServer() {
            return false;
        }

        @Override
        public int getRateLimitPacketsPerSecond() {
            return 0;
        }

        @Override
        public int getCommandSpamThresholdSeconds() {
            return 0;
        }

        @Override
        public int getChatSpamThresholdSeconds() {
            return 0;
        }

        @Override
        public boolean useNativeTransport() {
            return false;
        }

        @Override
        public boolean isPublished() {
            return false;
        }

        @Override
        public boolean shouldInformAdmins() {
            return false;
        }

        @Override
        public boolean isSingleplayerOwner(net.minecraft.server.players.NameAndId id) {
            return false;
        }

        @Override
        public String getMotd() {
            return "";
        }

        @Override
        public String getServerVersion() {
            return "probe";
        }

        @Override
        public int getPlayerCount() {
            return 0;
        }

        @Override
        public int getMaxPlayers() {
            return 0;
        }

        @Override
        public ServerScoreboard getScoreboard() {
            return SCOREBOARD;
        }

        @Override
        public WorldData getWorldData() {
            return WORLD_DATA;
        }
    }

    private static final class ProbeLevel extends ServerLevel {
        private static final ProbeServer SERVER = (ProbeServer) allocateUnchecked(ProbeServer.class);
        private static final RegistryAccess.Frozen REGISTRY_ACCESS = DumpJavaData.registryAccess();

        private ProbeLevel() {
            super(null, null, null, null, net.minecraft.world.level.Level.OVERWORLD, null, false, 0L,
                    java.util.List.of(), false);
        }

        @Override
        public int getNextEntityId() {
            return 1;
        }

        @Override
        public MinecraftServer getServer() {
            return SERVER;
        }

        @Override
        public RegistryAccess registryAccess() {
            return REGISTRY_ACCESS;
        }

        @Override
        public ServerScoreboard getScoreboard() {
            return ProbeServer.SCOREBOARD;
        }

        @Override
        public LevelData getLevelData() {
            return ProbeServer.WORLD_DATA;
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
        public int getHeight() {
            return 384;
        }

        @Override
        public BlockState getBlockState(BlockPos position) {
            return Blocks.AIR.defaultBlockState();
        }

        @Override
        public boolean isPositionEntityTicking(BlockPos position) {
            return true;
        }
    }

    /** Builds just the dynamic holders constructors look up; their values are not read by this dump. */
    private static RegistryAccess.Frozen registryAccess() {
        RegistryAccess.Frozen builtIn = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        Map<ResourceKey<? extends Registry<?>>, Registry<?>> extra = new HashMap<>();
        try {
            addDynamicRegistry(extra, "PIG_SOUND_VARIANT", "net.minecraft.world.entity.animal.pig.PigSoundVariants", "CLASSIC",
                    "net.minecraft.world.entity.animal.pig.PigSoundVariant");
            addDynamicRegistry(extra, "PIG_VARIANT", "net.minecraft.world.entity.animal.pig.PigVariants", "DEFAULT",
                    "net.minecraft.world.entity.animal.pig.PigVariant");
            addDynamicRegistry(extra, "CAT_SOUND_VARIANT", "net.minecraft.world.entity.animal.feline.CatSoundVariants", "CLASSIC",
                    "net.minecraft.world.entity.animal.feline.CatSoundVariant");
            addDynamicRegistry(extra, "CAT_VARIANT", "net.minecraft.world.entity.animal.feline.CatVariants", "TABBY",
                    "net.minecraft.world.entity.animal.feline.CatVariant");
            addDynamicRegistry(extra, "CHICKEN_SOUND_VARIANT", "net.minecraft.world.entity.animal.chicken.ChickenSoundVariants", "CLASSIC",
                    "net.minecraft.world.entity.animal.chicken.ChickenSoundVariant");
            addDynamicRegistry(extra, "CHICKEN_VARIANT", "net.minecraft.world.entity.animal.chicken.ChickenVariants", "DEFAULT",
                    "net.minecraft.world.entity.animal.chicken.ChickenVariant");
            addDynamicRegistry(extra, "COW_SOUND_VARIANT", "net.minecraft.world.entity.animal.cow.CowSoundVariants", "CLASSIC",
                    "net.minecraft.world.entity.animal.cow.CowSoundVariant");
            addDynamicRegistry(extra, "COW_VARIANT", "net.minecraft.world.entity.animal.cow.CowVariants", "DEFAULT",
                    "net.minecraft.world.entity.animal.cow.CowVariant");
            addDynamicRegistry(extra, "FROG_VARIANT", "net.minecraft.world.entity.animal.frog.FrogVariants", "TEMPERATE",
                    "net.minecraft.world.entity.animal.frog.FrogVariant");
            addDynamicRegistry(extra, "WOLF_SOUND_VARIANT", "net.minecraft.world.entity.animal.wolf.WolfSoundVariants", "CLASSIC",
                    "net.minecraft.world.entity.animal.wolf.WolfSoundVariant");
            addDynamicRegistry(extra, "WOLF_VARIANT", "net.minecraft.world.entity.animal.wolf.WolfVariants", "DEFAULT",
                    "net.minecraft.world.entity.animal.wolf.WolfVariant");
            addDynamicRegistry(extra, "ZOMBIE_NAUTILUS_VARIANT", "net.minecraft.world.entity.animal.nautilus.ZombieNautilusVariants", "DEFAULT",
                    "net.minecraft.world.entity.animal.nautilus.ZombieNautilusVariant");
        } catch (Exception error) {
            throw new RuntimeException("Could not construct the Java entity probe registries", error);
        }

        return new RegistryAccess.Frozen() {
            @Override
            @SuppressWarnings("unchecked")
            public <E> Optional<Registry<E>> lookup(ResourceKey<? extends Registry<? extends E>> key) {
                Registry<?> found = extra.get(key);
                return found == null ? builtIn.lookup(key) : Optional.of((Registry<E>) found);
            }

            @Override
            @SuppressWarnings({"unchecked", "rawtypes"})
            public Stream<RegistryAccess.RegistryEntry<?>> registries() {
                return Stream.concat(
                        builtIn.registries(),
                        extra.entrySet().stream().map(entry -> (RegistryAccess.RegistryEntry<?>)
                                new RegistryAccess.RegistryEntry(entry.getKey(), entry.getValue())));
            }
        };
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static void addDynamicRegistry(
            Map<ResourceKey<? extends Registry<?>>, Registry<?>> extra,
            String registryField,
            String holderClass,
            String entryField,
            String valueClass) throws Exception {
        ResourceKey registryKey = (ResourceKey) Registries.class.getField(registryField).get(null);
        ResourceKey entryKey = (ResourceKey) Class.forName(holderClass).getField(entryField).get(null);
        Class<?> type = Class.forName(valueClass);
        MappedRegistry registry = new MappedRegistry(registryKey, Lifecycle.stable());
        registry.register(entryKey, allocate(type), RegistrationInfo.BUILT_IN);
        registry.freeze();
        extra.put(registryKey, registry);
    }

    private static Object allocateUnchecked(Class<?> type) {
        try {
            return allocate(type);
        } catch (Exception error) {
            throw new RuntimeException(error);
        }
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
