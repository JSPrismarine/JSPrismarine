import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.repository.ServerPacksSource;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.tags.TagLoader;
import net.minecraft.core.component.DataComponentMap;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.SyncedDataHolder;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.server.Bootstrap;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.StandingAndWallBlockItem;
import net.minecraft.world.item.context.BlockPlaceContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.border.WorldBorder;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Dumps `vectors/<release>/placement.json`: the state Java's own `getStateForPlacement` gives each
 * block whose placement `src/rules/javaPlacement.ts` or a family copies, over a grid of placements.
 *
 * A placement needs a `Level` to read neighbors from and a `Player` to read the look from. The
 * dump allocates both with `Unsafe.allocateInstance`, which runs no constructor, so no server
 * starts: {@link MapLevel} answers `getBlockState` from an in-memory map and leaves everything
 * else to `Level`'s own code, and a `ServerPlayer` gets the fields a placement reads, its yaw,
 * head yaw and pitch, the shared flags that say whether it sneaks, and a survival player's
 * abilities. The context itself is a real `BlockPlaceContext` built with its own constructor, so
 * `replacingClickedOnBlock`, the clicked position and the nearest looking directions are Java's.
 * Item components and the vanilla tags are bound first, as a loaded server would have them.
 *
 * Beside the answers the dump records what the port's world is asked about each neighbor state
 * the layouts use, so a test can build a world that answers as Java does.
 *
 * Each block gets two answers per placement: `state`, what `Block.getStateForPlacement` returns,
 * and `placed`, what the block's item would put down: `StandingAndWallBlockItem.getPlacementState`
 * for a sign, banner, head or coral fan item, and for any other item the state when it survives
 * where it goes, as `BlockItem.canPlace` asks. The world holds no entities, so `canPlace`'s
 * obstruction check always passes and the dump leaves it out rather than build a collision
 * context from the allocated player.
 *
 * Usage: `DumpPlacementVectors <output-file> <Class>...`, each class the simple name of one whose
 * `getStateForPlacement` the port copies. Every block whose placement resolves to one of them is
 * run, and each class has to be one a run block inherits; blocks that answer every placement
 * alike apart from their own name share one entry.
 */
public final class DumpPlacementVectors {
    /** Where every placement goes. */
    private static final BlockPos AT = new BlockPos(0, 64, 0);

    /** The looks tried, as yaw and pitch in degrees: the four compass points and in between, level and steep. */
    private static final float[][] LOOKS = {
        { 0, 0 }, { 90, 0 }, { 180, 0 }, { 270, 0 }, { 45, 0 }, { 30, -20 },
        { 120, 35 }, { 200, -70 }, { 300, 75 }, { -45, 10 }, { 160, 90 }, { 10, -90 }
    };

    /**
     * The neighbor layouts. Each names the block on the clicked side, the block on the other five
     * sides, and the block at the position itself; `self` is the block being placed in its
     * default state, `self-facing` the same with `facing` set to the clicked face. A layout whose
     * position holds a block replaces it: the click lands on that block rather than beside it.
     */
    private static final String[][] LAYOUTS = {
        { "stone", "air", "air" },
        { "stone", "stone", "air" },
        { "jungle_log", "jungle_log", "air" },
        { "self", "air", "air" },
        { "self", "self", "air" },
        { "self-facing", "air", "air" },
        { "stone", "redstone_block", "air" },
        { "stone", "stone", "short_grass" },
        { "stone", "stone", "self" }
    };

    /** The two click positions on the clicked face: below and above its middle, or two corners of a top or bottom face. */
    private static final double[] CLICKS = { -0.25, 0.25 };

    /** The characters a result index is spelled with, in order; JSON-safe printable ASCII. */
    private static final String ALPHABET;

    static {
        StringBuilder alphabet = new StringBuilder();
        for (char c = '!'; c <= '~'; c++) if (c != '"' && c != '\\') alphabet.append(c);
        ALPHABET = alphabet.toString();
    }

    private static sun.misc.Unsafe unsafe;

    public static void main(String[] args) throws Exception {
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
        Field unsafeField = sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
        unsafeField.setAccessible(true);
        unsafe = (sun.misc.Unsafe) unsafeField.get(null);
        // An item stack reads its item's components, which only a loaded server binds. A
        // placement reads which item is in hand and nothing of its components, so empty ones do.
        Method bindComponents = Holder.Reference.class.getDeclaredMethod("bindComponents", DataComponentMap.class);
        bindComponents.setAccessible(true);
        for (Item item : BuiltInRegistries.ITEM) bindComponents.invoke(item.builtInRegistryHolder(), DataComponentMap.EMPTY);
        // Placement reads block tags, such as the logs cocoa grows on and the ground a dripleaf
        // takes, and only a loaded server binds them. The vanilla data pack inside the jar has them.
        TagLoader.loadTagsForExistingRegistries(
                new MultiPackResourceManager(PackType.SERVER_DATA, List.of(ServerPacksSource.createVanillaPackSource().fullResources())),
                RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY))
            .forEach(pending -> {
                System.out.println("Binding " + pending.size() + " tags of " + pending.key().identifier());
                pending.apply();
            });
        if (!Blocks.JUNGLE_LOG.defaultBlockState().is(net.minecraft.tags.BlockTags.SUPPORTS_COCOA)) {
            throw new IllegalStateException("The vanilla block tags did not bind");
        }

        Set<String> classes = new LinkedHashSet<>(Arrays.asList(args).subList(1, args.length));
        Map<String, Group> groups = new LinkedHashMap<>();
        Set<String> found = new LinkedHashSet<>();
        for (Block block : BuiltInRegistries.BLOCK) {
            String declaring = placementClassOf(block);
            if (declaring == null || !classes.contains(declaring)) continue;
            found.addAll(hierarchyOf(block.getClass()));
            System.out.println("Placing " + BuiltInRegistries.BLOCK.getKey(block) + " through " + declaring);
            Group run = run(block, declaring);
            String key = declaring + "\n" + run.key;
            Group existing = groups.get(key);
            if (existing == null) groups.put(key, run);
            else existing.members.addAll(run.members);
        }
        for (String name : classes) {
            if (!found.contains(name)) throw new IllegalStateException("No block placed here runs " + name + ".getStateForPlacement");
        }

        StringBuilder json = new StringBuilder();
        json.append("{\"version\":\"").append(SharedConstants.getCurrentVersion().name()).append('"');
        json.append(",\"position\":[").append(AT.getX()).append(',').append(AT.getY()).append(',').append(AT.getZ()).append(']');
        json.append(",\"faces\":[");
        for (int i = 0; i < Direction.values().length; i++) {
            if (i > 0) json.append(',');
            json.append('"').append(Direction.values()[i].getSerializedName()).append('"');
        }
        json.append("],\"clicks\":").append(Arrays.toString(CLICKS));
        json.append(",\"looks\":[");
        for (int i = 0; i < LOOKS.length; i++) {
            if (i > 0) json.append(',');
            json.append('[').append(number(LOOKS[i][0])).append(',').append(number(LOOKS[i][1])).append(']');
        }
        json.append("],\"layouts\":[");
        for (int i = 0; i < LAYOUTS.length; i++) {
            if (i > 0) json.append(',');
            json.append("{\"clicked\":\"").append(LAYOUTS[i][0]).append("\",\"around\":\"").append(LAYOUTS[i][1])
                .append("\",\"at\":\"").append(LAYOUTS[i][2]).append("\"}");
        }
        json.append("],\"named\":{");
        String[] names = { "stone", "jungle_log", "redstone_block", "short_grass", "seagrass", "water" };
        for (int i = 0; i < names.length; i++) {
            if (i > 0) json.append(',');
            String state = names[i].equals("seagrass") ? Blocks.SEAGRASS.defaultBlockState().toString()
                : names[i].equals("water") ? Blocks.WATER.defaultBlockState().toString()
                : named(Blocks.AIR, names[i], Direction.UP).toString();
            json.append('"').append(names[i]).append("\":\"").append(stateString(state)).append('"');
        }
        json.append("},\"facts\":{");
        json.append(FACTS.entrySet().stream().map(e -> '"' + e.getKey() + "\":" + e.getValue()).collect(Collectors.joining(",")));
        json.append("},\"alphabet\":\"").append(ALPHABET).append('"');
        json.append(",\"blocks\":[");
        boolean first = true;
        for (Group group : groups.values()) {
            if (!first) json.append(',');
            first = false;
            json.append("{\"class\":\"").append(group.declaring).append('"');
            json.append(",\"blocks\":[").append(group.members.stream()
                .map(m -> m[1] == null ? "{\"block\":\"" + m[0] + "\"}" : "{\"block\":\"" + m[0] + "\",\"wall\":\"" + m[1] + "\"}")
                .collect(Collectors.joining(","))).append(']');
            json.append(",\"default\":\"").append(group.defaultState).append('"');
            json.append(",\"facing\":[").append(group.facing.stream().map(f -> '"' + f + '"').collect(Collectors.joining(","))).append(']');
            json.append(",\"waterlogged\":\"").append(group.waterlogged).append('"');
            json.append(",\"palette\":[").append(group.palette.stream().map(s -> s == null ? "null" : '"' + s + '"').collect(Collectors.joining(","))).append(']');
            json.append(",\"state\":\"").append(group.state).append('"');
            json.append(",\"placed\":\"").append(group.placed).append("\"}");
        }
        json.append("]}");
        Path out = Path.of(args[0]);
        Files.createDirectories(out.getParent());
        Files.writeString(out, json.toString(), StandardCharsets.UTF_8);
        System.out.println("Wrote " + groups.size() + " block groups to " + out);
    }

    private static String number(float value) {
        return value == Math.rint(value) ? Integer.toString((int) value) : Float.toString(value);
    }

    /**
     * The simple names of a class, its superclasses and every interface they implement. A tag
     * may name a class whose `getStateForPlacement` a block reaches through `super` or an
     * interface, such as `AbstractSkullBlock` or `SegmentableBlock`, which the dumped blocks cover.
     */
    private static Set<String> hierarchyOf(Class<?> type) {
        Set<String> names = new LinkedHashSet<>();
        java.util.ArrayDeque<Class<?>> pending = new java.util.ArrayDeque<>(List.of(type));
        while (!pending.isEmpty()) {
            Class<?> next = pending.poll();
            if (next == null || next == Object.class || !names.add(next.getSimpleName())) continue;
            if (next.getSuperclass() != null) pending.add(next.getSuperclass());
            pending.addAll(Arrays.asList(next.getInterfaces()));
        }
        return names;
    }

    /** The simple name of the class that declares the `getStateForPlacement` a block runs. */
    private static String placementClassOf(Block block) {
        for (Class<?> type = block.getClass(); type != null && type != Object.class; type = type.getSuperclass()) {
            try {
                type.getDeclaredMethod("getStateForPlacement", BlockPlaceContext.class);
                return type == Block.class ? null : type.getSimpleName();
            } catch (NoSuchMethodException missing) {
                // Not declared here; the superclass may.
            }
        }
        return null;
    }

    /**
     * One block's answers, before it joins the group of blocks that answer alike. Every state in
     * it spells the block's own id as `$` and its wall block's as `$wall`, so the group holds for
     * each member.
     */
    private static final class Group {
        final String declaring;
        /** Each member's id and its wall block's id, or null when it has none. */
        final List<String[]> members = new ArrayList<>();
        final String defaultState;
        final List<String> facing;
        final String waterlogged;
        final List<String> palette;
        final String state;
        final String placed;
        final String key;

        Group(String declaring, String[] member, String defaultState, List<String> facing, String waterlogged,
                List<String> palette, String state, String placed) {
            this.declaring = declaring;
            this.members.add(member);
            this.defaultState = defaultState;
            this.facing = facing;
            this.waterlogged = waterlogged;
            this.palette = palette;
            this.state = state;
            this.placed = placed;
            this.key = String.join("\n", defaultState, String.join("|", facing), waterlogged,
                palette.stream().map(String::valueOf).collect(Collectors.joining("|")), state, placed);
        }
    }

    private static Group run(Block block, String declaring) throws Exception {
        String id = BuiltInRegistries.BLOCK.getKey(block).toString();
        Item item = block.asItem();
        // A wall sign's item is the standing sign's; only the block an item places gets the item's answer.
        StandingAndWallBlockItem standing = item instanceof StandingAndWallBlockItem both && both.getBlock() == block ? both : null;
        String wall = standing == null ? null : BuiltInRegistries.BLOCK.getKey(wallBlockOf(standing)).toString();
        Method mustSurvive = BlockItem.class.getDeclaredMethod("mustSurvive");
        mustSurvive.setAccessible(true);
        Method placementState = BlockItem.class.getDeclaredMethod("getPlacementState", BlockPlaceContext.class);
        placementState.setAccessible(true);
        Constructor<BlockPlaceContext> contextOf = BlockPlaceContext.class.getDeclaredConstructor(
            Level.class, Player.class, InteractionHand.class, ItemStack.class, BlockHitResult.class);
        contextOf.setAccessible(true);

        List<String> palette = new ArrayList<>();
        Map<String, Integer> indexOf = new HashMap<>();
        StringBuilder state = new StringBuilder();
        StringBuilder placed = new StringBuilder();
        MapLevel level = (MapLevel) unsafe.allocateInstance(MapLevel.class);
        for (Direction face : Direction.values()) {
            for (double click : CLICKS) {
                for (float[] look : LOOKS) {
                    for (String[] layout : LAYOUTS) {
                        for (boolean water : new boolean[] { false, true }) {
                            for (boolean sneaking : new boolean[] { false, true }) {
                                level.blocks = layoutBlocks(block, layout, face, water);
                                for (Map.Entry<BlockPos, BlockState> placedHere : level.blocks.entrySet()) recordFacts(level, placedHere.getKey(), placedHere.getValue());
                                BlockPos hit = level.blocks.containsKey(AT) && !level.blocks.get(AT).isAir() && !level.blocks.get(AT).is(Blocks.WATER)
                                    ? AT : AT.relative(face.getOpposite());
                                Vec3 location = clickLocation(hit, face, click);
                                ItemStack stack = new ItemStack(item);
                                BlockPlaceContext context = contextOf.newInstance(
                                    level, player(look[0], look[1], sneaking), InteractionHand.MAIN_HAND, stack,
                                    new BlockHitResult(location, face, hit, false));
                                String result;
                                String itemResult;
                                if (!context.getClickedPos().equals(AT)) {
                                    // The block at the position would not be replaced, so the click
                                    // goes beside it rather than here; the layout does not apply.
                                    result = "~";
                                    itemResult = "~";
                                } else {
                                    BlockState java = block.getStateForPlacement(context);
                                    result = java == null ? null : spelled(java);
                                    BlockState put;
                                    if (standing != null) {
                                        put = (BlockState) placementState.invoke(standing, context);
                                    } else if (java != null && item instanceof BlockItem blockItem && (boolean) mustSurvive.invoke(blockItem)) {
                                        put = java.canSurvive(level, AT) ? java : null;
                                    } else {
                                        put = java;
                                    }
                                    itemResult = put == null ? null : spelled(put);
                                }
                                state.append(ALPHABET.charAt(paletteIndex(palette, indexOf, result)));
                                placed.append(ALPHABET.charAt(paletteIndex(palette, indexOf, itemResult)));
                            }
                        }
                    }
                }
            }
        }
        List<String> facing = new ArrayList<>();
        for (Direction face : Direction.values()) facing.add(placeholder(spelled(named(block, "self-facing", face)), id, wall));
        return new Group(declaring, new String[] { id, wall }, placeholder(spelled(block.defaultBlockState()), id, wall), facing,
            placeholder(spelled(waterlogged(block.defaultBlockState())), id, wall),
            palette.stream().map(entry -> entry == null ? null : placeholder(entry, id, wall)).toList(), state.toString(), placed.toString());
    }

    private static Block wallBlockOf(StandingAndWallBlockItem item) throws Exception {
        Field wall = StandingAndWallBlockItem.class.getDeclaredField("wallBlock");
        wall.setAccessible(true);
        return (Block) wall.get(item);
    }

    /**
     * `Block{minecraft:ladder}[facing=north]` as `minecraft:ladder[facing=north]`, with the block's
     * own id spelled `$` and its wall block's `$wall`, so blocks that answer alike compare equal.
     */
    private static String placeholder(String state, String id, String wall) {
        if (state.equals("~")) return state;
        String plain = stateString(state);
        for (String[] name : new String[][] { { id, "$" }, { wall, "$wall" } }) {
            if (name[0] != null && (plain.equals(name[0]) || plain.startsWith(name[0] + "["))) return name[1] + plain.substring(name[0].length());
        }
        return plain;
    }

    /** `Block{minecraft:ladder}[facing=north,waterlogged=false]` as `minecraft:ladder[facing=north,waterlogged=false]`. */
    private static String stateString(String state) {
        return state.replaceFirst("^Block\\{([^}]+)\\}", "$1");
    }

    /**
     * What the port's world asks of a neighbor, by state: how a piston treats it, which the port
     * reads as whether it holds a block up, whether its collision shape is a full cube, and
     * whether its top face is sturdy. The server answers these from Java's tables too.
     */
    private static final Map<String, String> FACTS = new java.util.TreeMap<>();

    private static void recordFacts(MapLevel level, BlockPos pos, BlockState state) {
        FACTS.computeIfAbsent(stateString(spelled(state)), key -> "{\"pushReaction\":\"" + state.getPistonPushReaction().name().toLowerCase()
            + "\",\"fullCube\":" + state.isCollisionShapeFullBlock(level, pos)
            + ",\"sturdyTop\":" + state.isFaceSturdy(level, pos, Direction.UP) + "}");
    }

    /** Each state's `toString`, kept by instance: Java interns block states, and spelling one is slow. */
    private static final Map<BlockState, String> SPELLED = new java.util.IdentityHashMap<>();

    private static String spelled(BlockState state) {
        return SPELLED.computeIfAbsent(state, BlockState::toString);
    }

    private static int paletteIndex(List<String> palette, Map<String, Integer> indexOf, String entry) {
        String key = entry == null ? "\0null" : entry;
        Integer index = indexOf.get(key);
        if (index != null) return index;
        if (palette.size() >= ALPHABET.length()) throw new IllegalStateException("Too many distinct states");
        palette.add(entry);
        indexOf.put(key, palette.size() - 1);
        return palette.size() - 1;
    }

    private static Vec3 clickLocation(BlockPos hit, Direction face, double offset) {
        Vec3 center = Vec3.atCenterOf(hit).add(face.getStepX() * 0.5, face.getStepY() * 0.5, face.getStepZ() * 0.5);
        if (face.getAxis() == Direction.Axis.Y) return center.add(offset, 0, offset);
        return center.add(0, offset, 0);
    }

    private static Map<BlockPos, BlockState> layoutBlocks(Block block, String[] layout, Direction face, boolean water) {
        Map<BlockPos, BlockState> blocks = new HashMap<>();
        boolean replacing = !layout[2].equals("air");
        for (Direction side : Direction.values()) {
            String name = !replacing && side == face.getOpposite() ? layout[0] : layout[1];
            BlockState state = named(block, name, face);
            if (state != null) blocks.put(AT.relative(side), state);
        }
        BlockState at = named(block, layout[2], face);
        if (water) at = at == null ? Blocks.WATER.defaultBlockState() : waterlogged(at);
        if (at != null) blocks.put(AT, at);
        return blocks;
    }

    /** A block that holds water where it can: seagrass for short grass, the waterlogged state for anything with the property. */
    private static BlockState waterlogged(BlockState state) {
        if (state.is(Blocks.SHORT_GRASS)) return Blocks.SEAGRASS.defaultBlockState();
        for (Property<?> property : state.getProperties()) {
            if (property.getName().equals("waterlogged")) return setNamed(state, property, "true");
        }
        return state;
    }

    private static BlockState named(Block block, String name, Direction face) {
        switch (name) {
            case "air":
                return null;
            case "self":
                return block.defaultBlockState();
            case "self-facing": {
                BlockState state = block.defaultBlockState();
                for (Property<?> property : state.getProperties()) {
                    if (property.getName().equals("facing") && property.getValue(face.getSerializedName()).isPresent()) {
                        return setNamed(state, property, face.getSerializedName());
                    }
                }
                return state;
            }
            default:
                return BuiltInRegistries.BLOCK.getValue(net.minecraft.resources.Identifier.withDefaultNamespace(name)).defaultBlockState();
        }
    }

    private static <T extends Comparable<T>> BlockState setNamed(BlockState state, Property<T> property, String value) {
        return state.setValue(property, property.getValue(value).orElseThrow());
    }

    private static ServerPlayer player(float yaw, float pitch, boolean sneaking) throws Exception {
        ServerPlayer player = (ServerPlayer) unsafe.allocateInstance(ServerPlayer.class);
        player.setYRot(yaw);
        player.setXRot(pitch);
        player.setYHeadRot(yaw);
        Field flagsField = Entity.class.getDeclaredField("DATA_SHARED_FLAGS_ID");
        flagsField.setAccessible(true);
        @SuppressWarnings("unchecked")
        EntityDataAccessor<Byte> flags = (EntityDataAccessor<Byte>) flagsField.get(null);
        SynchedEntityData.DataItem<?>[] items = new SynchedEntityData.DataItem<?>[flags.id() + 1];
        // Bit 1 of the shared flags is the shift key, which `isSecondaryUseActive` reads.
        items[flags.id()] = new SynchedEntityData.DataItem<>(flags, (byte) (sneaking ? 1 << 1 : 0));
        Constructor<SynchedEntityData> dataOf = SynchedEntityData.class.getDeclaredConstructor(SyncedDataHolder.class, SynchedEntityData.DataItem[].class);
        dataOf.setAccessible(true);
        Field entityData = Entity.class.getDeclaredField("entityData");
        unsafe.putObject(player, unsafe.objectFieldOffset(entityData), dataOf.newInstance(player, items));
        // A survival player's abilities, which a lectern reads to ask whether it may load a book's data.
        Field abilities = Player.class.getDeclaredField("abilities");
        unsafe.putObject(player, unsafe.objectFieldOffset(abilities), new net.minecraft.world.entity.player.Abilities());
        return player;
    }

    /**
     * A `Level` over a map of block states, allocated without its constructor. It answers
     * `getBlockState` from the map, air elsewhere, the fluid from the block state the way a
     * chunk does, the overworld's build height, a default world border, and no entities.
     * Everything else a placement reads, such as `hasNeighborSignal`, is `Level`'s own code
     * over those answers. The abstract members a placement never reaches throw.
     */
    public static final class MapLevel extends Level {
        Map<BlockPos, BlockState> blocks = Map.of();
        private static final WorldBorder BORDER = new WorldBorder();

        private MapLevel() {
            super(null, null, null, null, false, false, 0L, 0);
        }

        @Override
        public BlockState getBlockState(BlockPos pos) {
            BlockState state = blocks.get(pos);
            return state == null ? Blocks.AIR.defaultBlockState() : state;
        }

        @Override
        public FluidState getFluidState(BlockPos pos) {
            return getBlockState(pos).getFluidState();
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
        public WorldBorder getWorldBorder() {
            return BORDER;
        }

        @Override
        public List<Entity> getEntities(Entity except, AABB box, Predicate<? super Entity> predicate) {
            return List.of();
        }
        private static UnsupportedOperationException unreached() {
            return new UnsupportedOperationException("A placement does not reach this");
        }

        @Override public net.minecraft.world.clock.ClockManager clockManager() { throw unreached(); }
        @Override public net.minecraft.world.attribute.EnvironmentAttributeSystem environmentAttributes() { throw unreached(); }
        @Override public void destroyBlockProgress(int id, BlockPos pos, int progress) { throw unreached(); }
        @Override public java.util.Collection<net.minecraft.world.entity.boss.enderdragon.EnderDragonPart> dragonParts() { return List.of(); }
        @Override public net.minecraft.world.flag.FeatureFlagSet enabledFeatures() { return net.minecraft.world.flag.FeatureFlags.DEFAULT_FLAGS; }
        @Override public void explode(Entity source, DamageSource damage, net.minecraft.world.level.ExplosionDamageCalculator calculator, double x, double y, double z, float radius, boolean fire, Level.ExplosionInteraction interaction, net.minecraft.core.particles.ParticleOptions small, net.minecraft.core.particles.ParticleOptions large, net.minecraft.util.random.WeightedList<net.minecraft.core.particles.ExplosionParticleInfo> particles, Holder<SoundEvent> sound) { throw unreached(); }
        @Override public void gameEvent(Holder<net.minecraft.world.level.gameevent.GameEvent> event, Vec3 position, net.minecraft.world.level.gameevent.GameEvent.Context context) { throw unreached(); }
        @Override public String gatherChunkSourceStats() { throw unreached(); }
        @Override public net.minecraft.world.ticks.LevelTickAccess<Block> getBlockTicks() { throw unreached(); }
        @Override public net.minecraft.world.level.chunk.ChunkSource getChunkSource() { throw unreached(); }
        @Override protected net.minecraft.world.level.entity.LevelEntityGetter<Entity> getEntities() { throw unreached(); }
        @Override public Entity getEntity(int id) { throw unreached(); }
        @Override public net.minecraft.world.ticks.LevelTickAccess<net.minecraft.world.level.material.Fluid> getFluidTicks() { throw unreached(); }
        @Override public net.minecraft.world.level.saveddata.maps.MapItemSavedData getMapData(net.minecraft.world.level.saveddata.maps.MapId id) { throw unreached(); }
        @Override public net.minecraft.world.level.storage.LevelData.RespawnData getRespawnData() { throw unreached(); }
        @Override public net.minecraft.world.scores.Scoreboard getScoreboard() { throw unreached(); }
        @Override public int getSeaLevel() { return 63; }
        @Override public Holder<net.minecraft.world.level.biome.Biome> getUncachedNoiseBiome(int x, int y, int z) { throw unreached(); }
        @Override public void levelEvent(Entity source, int type, BlockPos pos, int data) { throw unreached(); }
        @Override public void playSeededSound(Entity except, Entity source, Holder<SoundEvent> sound, SoundSource category, float volume, float pitch, long seed) { throw unreached(); }
        @Override public void playSeededSound(Entity except, double x, double y, double z, Holder<SoundEvent> sound, SoundSource category, float volume, float pitch, long seed) { throw unreached(); }
        @Override public List<? extends Player> players() { return List.of(); }
        @Override public net.minecraft.world.item.crafting.RecipeAccess recipeAccess() { throw unreached(); }
        @Override public void sendBlockUpdated(BlockPos pos, BlockState from, BlockState to, int flags) { throw unreached(); }
        @Override public void setRespawnData(net.minecraft.world.level.storage.LevelData.RespawnData data) { throw unreached(); }
        @Override public net.minecraft.world.TickRateManager tickRateManager() { throw unreached(); }
    }
}
