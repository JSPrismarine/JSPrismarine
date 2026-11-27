import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import net.minecraft.SharedConstants;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.data.registries.VanillaRegistries;
import net.minecraft.server.Bootstrap;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.repository.ServerPacksSource;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.server.packs.resources.ResourceManager;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.TagLoader;
import net.minecraft.world.attribute.EnvironmentAttributeSystem;
import net.minecraft.world.flag.FeatureFlags;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LiquidBlockContainer;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.dimension.BuiltinDimensionTypes;
import net.minecraft.world.level.dimension.DimensionType;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.material.FlowingFluid;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

/**
 * Dumps `vectors/<release>/fluid-spread.json`: what Java's `FlowingFluid.getSpread` answers for a
 * set of small block layouts with a water or lava block at the origin.
 *
 * `getSpread` takes a `ServerLevel`, which needs a running server. The dump runs it against
 * {@link LayoutLevel}, a `ServerLevel` subclass allocated without its constructor, that answers
 * the four things the spread search reads from the level: block states, the source conversion game
 * rules, and the dimension's environment attributes, which decide whether lava is fast. Everything
 * else `getSpread` reaches is Java's own code: the slope search, `getNewLiquid`, the collision
 * shapes, `Shapes.mergedFaceOccludes`, `FluidState.canBeReplacedWith` and
 * `LiquidBlockContainer.canPlaceLiquid`. Block tags come from the jar's vanilla data pack, since
 * `minecraft:washed_away_by_fluids` decides which blocks a fluid may enter.
 *
 * Each layout's origin is a fluid that the real tick would spread sideways: it stands on a full
 * block, a flowing origin is one `getNewLiquid` keeps as it is, and its next amount is above zero.
 * So the port's whole flow step, not just its private search, can be compared with the answer.
 *
 * The dump also records, for each block state the layouts use, the shape and tag facts a host
 * answers through the port's world interface, and which pairs of those states close the face
 * between them. The test hands those to the port as its host, so it compares the spread rule and
 * not a host's shape tables.
 *
 * Usage: `DumpFluidSpreadVectors <output-file>`, run from inside `node_modules/.cache/jsprismarine/`.
 */
public final class DumpFluidSpreadVectors {
    /** The faces `getSpread` answers for, named as the port and the JSON name them. */
    private static final Direction[] HORIZONTAL = { Direction.NORTH, Direction.SOUTH, Direction.WEST, Direction.EAST };

    /** One block layout: a dimension, the origin and the blocks around it, later entries on top. */
    private record Layout(String name, String dimension, int[] origin, List<Entry> entries) {}

    /** A box of one block state, from one corner to the other, both included. */
    private record Entry(int[] from, int[] to, String state) {}

    /**
     * A `ServerLevel` that answers from a map of block states. It is allocated with
     * `Unsafe.allocateInstance`, so neither its constructor nor `ServerLevel`'s ever runs, and only
     * the methods below may be reached.
     */
    static final class LayoutLevel extends ServerLevel {
        Map<BlockPos, BlockState> blocks;
        GameRules gameRules;
        EnvironmentAttributeSystem attributes;

        /** Never called; it exists because the compiler needs a constructor to chain to. */
        private LayoutLevel() {
            super(null, null, null, null, null, null, false, 0L, null, false);
        }

        @Override
        public BlockState getBlockState(final BlockPos pos) {
            return blocks.getOrDefault(pos, Blocks.AIR.defaultBlockState());
        }

        @Override
        public FluidState getFluidState(final BlockPos pos) {
            return getBlockState(pos).getFluidState();
        }

        @Override
        public GameRules getGameRules() {
            return gameRules;
        }

        @Override
        public EnvironmentAttributeSystem environmentAttributes() {
            return attributes;
        }
    }

    public static void main(final String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: DumpFluidSpreadVectors <output-file>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
        bindVanillaTags();

        HolderLookup.Provider provider = VanillaRegistries.createWorldLookup();
        Map<String, EnvironmentAttributeSystem> attributesByDimension = new HashMap<>();
        attributesByDimension.put("overworld", attributesOf(provider, BuiltinDimensionTypes.OVERWORLD));
        attributesByDimension.put("nether", attributesOf(provider, BuiltinDimensionTypes.NETHER));

        Method getSpread = FlowingFluid.class.getDeclaredMethod("getSpread", ServerLevel.class, BlockPos.class, BlockState.class);
        getSpread.setAccessible(true);
        Method getNewLiquid = FlowingFluid.class.getDeclaredMethod("getNewLiquid", ServerLevel.class, BlockPos.class, BlockState.class);
        getNewLiquid.setAccessible(true);
        Method getDropOff = FlowingFluid.class.getDeclaredMethod("getDropOff", net.minecraft.world.level.LevelReader.class);
        getDropOff.setAccessible(true);

        Field unsafeField = sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
        unsafeField.setAccessible(true);
        sun.misc.Unsafe unsafe = (sun.misc.Unsafe) unsafeField.get(null);

        Set<BlockState> palette = new LinkedHashSet<>();
        palette.add(Blocks.AIR.defaultBlockState());
        List<String> cases = new ArrayList<>();
        for (Layout layout : layouts()) {
            Map<BlockPos, BlockState> blocks = new LinkedHashMap<>();
            List<String> entries = new ArrayList<>();
            for (Entry entry : layout.entries()) {
                BlockState state = parse(entry.state());
                palette.add(state);
                for (int x = entry.from()[0]; x <= entry.to()[0]; x++) {
                    for (int y = entry.from()[1]; y <= entry.to()[1]; y++) {
                        for (int z = entry.from()[2]; z <= entry.to()[2]; z++) {
                            BlockPos at = new BlockPos(x, y, z);
                            if (state.isAir()) blocks.remove(at);
                            else blocks.put(at, state);
                        }
                    }
                }
                entries.add("{\"from\":" + coordinates(entry.from()) + ",\"to\":" + coordinates(entry.to())
                    + ",\"state\":\"" + BlockStateParser.serialize(state) + "\"}");
            }

            LayoutLevel level = (LayoutLevel) unsafe.allocateInstance(LayoutLevel.class);
            level.blocks = blocks;
            level.gameRules = new GameRules(FeatureFlags.VANILLA_SET);
            level.attributes = attributesByDimension.get(layout.dimension());

            BlockPos origin = new BlockPos(layout.origin()[0], layout.origin()[1], layout.origin()[2]);
            BlockState originState = level.getBlockState(origin);
            FluidState originFluid = originState.getFluidState();
            if (!(originFluid.getType() instanceof FlowingFluid fluid)) {
                throw new IllegalStateException(layout.name() + ": the origin holds no flowing fluid");
            }
            checkSpreadsSideways(layout, level, origin, originState, originFluid, fluid, getNewLiquid, getDropOff);

            @SuppressWarnings("unchecked")
            Map<Direction, FluidState> spread = (Map<Direction, FluidState>) getSpread.invoke(fluid, level, origin, originState);
            List<String> sides = new ArrayList<>();
            for (Direction direction : HORIZONTAL) {
                FluidState next = spread.get(direction);
                if (next != null) sides.add("\"" + direction.getSerializedName() + "\":" + fluidJson(next));
            }
            cases.add("{\"name\":\"" + layout.name() + "\",\"dimension\":\"" + layout.dimension()
                + "\",\"origin\":" + coordinates(layout.origin())
                + ",\"blocks\":[" + String.join(",", entries) + "]"
                + ",\"spread\":{" + String.join(",", sides) + "}}");
        }

        List<String> states = new ArrayList<>();
        List<String> occluding = new ArrayList<>();
        for (BlockState state : palette) {
            VoxelShape shape = state.getCollisionShape(net.minecraft.world.level.EmptyBlockGetter.INSTANCE, BlockPos.ZERO);
            states.add("\"" + BlockStateParser.serialize(state) + "\":{"
                + "\"fullCube\":" + (shape == Shapes.block())
                + ",\"solid\":" + state.isSolid()
                + ",\"washedAway\":" + state.is(BlockTags.WASHED_AWAY_BY_FLUIDS)
                + ",\"holdsWater\":" + (state.getBlock() instanceof LiquidBlockContainer) + "}");
        }
        for (BlockState from : palette) {
            VoxelShape fromShape = from.getCollisionShape(net.minecraft.world.level.EmptyBlockGetter.INSTANCE, BlockPos.ZERO);
            if (fromShape == Shapes.block()) continue;
            for (BlockState to : palette) {
                VoxelShape toShape = to.getCollisionShape(net.minecraft.world.level.EmptyBlockGetter.INSTANCE, BlockPos.ZERO);
                if (toShape == Shapes.block()) continue;
                for (Direction direction : Direction.values()) {
                    if (Shapes.mergedFaceOccludes(fromShape, toShape, direction)) {
                        occluding.add("{\"from\":\"" + BlockStateParser.serialize(from) + "\",\"to\":\""
                            + BlockStateParser.serialize(to) + "\",\"face\":\"" + direction.getSerializedName() + "\"}");
                    }
                }
            }
        }

        String json = "{\"version\":\"" + SharedConstants.getCurrentVersion().name() + "\""
            + ",\"states\":{" + String.join(",", states) + "}"
            + ",\"occludingFaces\":[" + String.join(",", occluding) + "]"
            + ",\"cases\":[" + String.join(",", cases) + "]}";
        Path output = Path.of(args[0]);
        Files.createDirectories(output.toAbsolutePath().getParent());
        Files.writeString(output, json, StandardCharsets.UTF_8);
        System.out.println("Wrote " + cases.size() + " fluid spread cases to " + output);
    }

    /**
     * Fails the dump unless the real tick would reach `getSpread` from this origin: it cannot fall,
     * a flowing origin keeps its state, and the amount it passes on is above zero.
     */
    private static void checkSpreadsSideways(
        final Layout layout,
        final LayoutLevel level,
        final BlockPos origin,
        final BlockState originState,
        final FluidState originFluid,
        final FlowingFluid fluid,
        final Method getNewLiquid,
        final Method getDropOff
    ) throws Exception {
        BlockState below = level.getBlockState(origin.below());
        if (below.getCollisionShape(level, origin.below()) != Shapes.block()) {
            throw new IllegalStateException(layout.name() + ": the origin has to stand on a full block");
        }
        if (!originFluid.isSource()) {
            FluidState settled = (FluidState) getNewLiquid.invoke(fluid, level, origin, originState);
            if (!settled.equals(originFluid)) {
                throw new IllegalStateException(layout.name() + ": the origin would settle to " + settled);
            }
        }
        int amount = originFluid.getValue(FlowingFluid.FALLING) ? 7 : originFluid.getAmount() - (int) getDropOff.invoke(fluid, level);
        if (amount <= 0) throw new IllegalStateException(layout.name() + ": the origin has nothing to pass on");
    }

    /** The small layouts, each named for what it checks. */
    private static List<Layout> layouts() {
        List<Layout> layouts = new ArrayList<>();
        // A flat floor, the same for every layout, wide enough that no side finds its edge.
        int[] floorFrom = { -6, 0, -6 };
        int[] floorTo = { 6, 0, 6 };

        layouts.add(layout("water source on a flat floor", "overworld", floor(floorFrom, floorTo), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with a hole two east", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:air"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source between two holes", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:air"), at(-2, 0, 0, "minecraft:air"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with a diagonal hole", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 1, "minecraft:air"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with a hole at the slope distance", "overworld", floor(floorFrom, floorTo),
            at(5, 0, 0, "minecraft:air"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with a hole past the slope distance", "overworld", floor(floorFrom, floorTo),
            at(6, 0, 0, "minecraft:air"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source walled to the east", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:stone"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source reaching a hole around a wall", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:air"), at(1, 1, 0, "minecraft:stone"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source in a corridor toward a hole", "overworld", floor(floorFrom, floorTo),
            box(-3, 1, -1, 4, 1, -1, "minecraft:stone"), box(-3, 1, 1, 4, 1, 1, "minecraft:stone"),
            at(-3, 1, 0, "minecraft:stone"), at(4, 0, 0, "minecraft:air"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with water below the hole", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:water[level=3]"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with lava below the hole", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:lava"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source beside short grass", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:short_grass"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source beside a cactus", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:cactus"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with a cactus over the hole", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:air"), at(2, 1, 0, "minecraft:cactus"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with short grass over the hole", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:air"), at(2, 1, 0, "minecraft:short_grass"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source beside lower flowing water", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:water[level=3]"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source beside another source", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:water"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source one gap from another source", "overworld", floor(floorFrom, floorTo),
            at(2, 1, 0, "minecraft:water"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source one gap from another source over soul sand", "overworld", floor(floorFrom, floorTo),
            at(1, 0, 0, "minecraft:soul_sand"), at(2, 1, 0, "minecraft:water"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source one gap from another source over a bottom slab", "overworld", floor(floorFrom, floorTo),
            at(1, 0, 0, "minecraft:stone_slab[type=bottom]"), at(2, 1, 0, "minecraft:water"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source one gap from another source over a hole", "overworld", floor(floorFrom, floorTo),
            at(1, 0, 0, "minecraft:air"), at(2, 1, 0, "minecraft:water"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source beside a dry bottom slab", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:stone_slab[type=bottom]"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source beside a waterlogged bottom slab", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:stone_slab[type=bottom,waterlogged=true]"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source one dry slab from another source", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:stone_slab[type=bottom]"), at(2, 1, 0, "minecraft:water"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with a bottom slab over the hole", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:air"), at(2, 1, 0, "minecraft:stone_slab[type=bottom]"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with a top slab over the hole", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:air"), at(2, 1, 0, "minecraft:stone_slab[type=top]"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source beside seagrass", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:seagrass"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source with a top slab beside it", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:stone_slab[type=top]"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("waterlogged bottom slab on a flat floor", "overworld", floor(floorFrom, floorTo),
            at(0, 1, 0, "minecraft:stone_slab[type=bottom,waterlogged=true]")));
        layouts.add(layout("waterlogged bottom slab with a hole two east", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:air"), at(0, 1, 0, "minecraft:stone_slab[type=bottom,waterlogged=true]")));
        layouts.add(layout("water source beside flowing lava of amount 4", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:lava[level=4]"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source beside flowing lava of amount 5", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:lava[level=3]"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source beside flowing lava of amount 3", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:lava[level=5]"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("water source beside shallow lava under lava", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:lava[level=6]"), at(1, 2, 0, "minecraft:lava"), at(0, 1, 0, "minecraft:water")));
        layouts.add(layout("flowing water fed by a source", "overworld", floor(floorFrom, floorTo),
            at(-1, 1, 0, "minecraft:water"), at(0, 1, 0, "minecraft:water[level=1]")));
        layouts.add(layout("flowing water fed by a source with a hole two east", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:air"), at(-1, 1, 0, "minecraft:water"), at(0, 1, 0, "minecraft:water[level=1]")));
        layouts.add(layout("falling water on a flat floor", "overworld", floor(floorFrom, floorTo),
            at(0, 2, 0, "minecraft:water"), at(0, 1, 0, "minecraft:water[level=8]")));
        layouts.add(layout("falling water with a hole two east", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:air"), at(0, 2, 0, "minecraft:water"), at(0, 1, 0, "minecraft:water[level=8]")));

        layouts.add(layout("lava source on a flat floor", "overworld", floor(floorFrom, floorTo), at(0, 1, 0, "minecraft:lava")));
        layouts.add(layout("lava source with a hole at the slope distance", "overworld", floor(floorFrom, floorTo),
            at(3, 0, 0, "minecraft:air"), at(0, 1, 0, "minecraft:lava")));
        layouts.add(layout("lava source with a hole past the slope distance", "overworld", floor(floorFrom, floorTo),
            at(4, 0, 0, "minecraft:air"), at(0, 1, 0, "minecraft:lava")));
        layouts.add(layout("lava source one gap from another source", "overworld", floor(floorFrom, floorTo),
            at(2, 1, 0, "minecraft:lava"), at(0, 1, 0, "minecraft:lava")));
        layouts.add(layout("lava source beside lower flowing lava", "overworld", floor(floorFrom, floorTo),
            at(1, 1, 0, "minecraft:lava[level=6]"), at(0, 1, 0, "minecraft:lava")));
        layouts.add(layout("lava source with water below the hole", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:water"), at(0, 1, 0, "minecraft:lava")));
        layouts.add(layout("lava source with seagrass below the hole", "overworld", floor(floorFrom, floorTo),
            at(2, 0, 0, "minecraft:seagrass"), at(0, 1, 0, "minecraft:lava")));
        layouts.add(layout("flowing lava fed by a source", "overworld", floor(floorFrom, floorTo),
            at(-1, 1, 0, "minecraft:lava"), at(0, 1, 0, "minecraft:lava[level=2]")));
        layouts.add(layout("lava source in the nether on a flat floor", "nether", floor(floorFrom, floorTo),
            at(0, 1, 0, "minecraft:lava")));
        layouts.add(layout("lava source in the nether with a hole past the overworld slope distance", "nether",
            floor(floorFrom, floorTo), at(4, 0, 0, "minecraft:air"), at(0, 1, 0, "minecraft:lava")));
        layouts.add(layout("lava source in the nether with a hole past the slope distance", "nether",
            floor(floorFrom, floorTo), at(6, 0, 0, "minecraft:air"), at(0, 1, 0, "minecraft:lava")));
        layouts.add(layout("flowing lava in the nether fed by a source", "nether", floor(floorFrom, floorTo),
            at(-1, 1, 0, "minecraft:lava"), at(0, 1, 0, "minecraft:lava[level=1]")));
        return layouts;
    }

    private static Layout layout(final String name, final String dimension, final Entry... entries) {
        return new Layout(name, dimension, new int[] { 0, 1, 0 }, List.of(entries));
    }

    private static Entry floor(final int[] from, final int[] to) {
        return new Entry(from, to, "minecraft:stone");
    }

    private static Entry at(final int x, final int y, final int z, final String state) {
        return new Entry(new int[] { x, y, z }, new int[] { x, y, z }, state);
    }

    private static Entry box(final int x0, final int y0, final int z0, final int x1, final int y1, final int z1, final String state) {
        return new Entry(new int[] { x0, y0, z0 }, new int[] { x1, y1, z1 }, state);
    }

    private static BlockState parse(final String state) throws Exception {
        return BlockStateParser.parseForBlock(BuiltInRegistries.BLOCK, state, false).blockState();
    }

    /** Binds the vanilla data pack's tags to the built-in registries, as a server's reload does. */
    private static void bindVanillaTags() {
        RegistryAccess access = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
        // `VanillaPackResources.asResourceManager` reads the client side, so the data side is built here.
        ResourceManager resources = new MultiPackResourceManager(
            PackType.SERVER_DATA, List.of(ServerPacksSource.createVanillaPackSource().fullResources())
        );
        for (Registry.PendingTags<?> pending : TagLoader.loadTagsForExistingRegistries(resources, access)) pending.apply();
        if (!Blocks.AIR.defaultBlockState().is(BlockTags.WASHED_AWAY_BY_FLUIDS)) {
            throw new IllegalStateException("the vanilla block tags did not bind");
        }
    }

    /** A dimension's environment attributes as its own layer, the one `isFastLava` reads. */
    private static EnvironmentAttributeSystem attributesOf(
        final HolderLookup.Provider provider,
        final net.minecraft.resources.ResourceKey<DimensionType> key
    ) {
        DimensionType type = provider.lookupOrThrow(Registries.DIMENSION_TYPE).getOrThrow(key).value();
        return EnvironmentAttributeSystem.builder().addConstantLayer(type.attributes()).build();
    }

    private static String coordinates(final int[] at) {
        return "[" + at[0] + "," + at[1] + "," + at[2] + "]";
    }

    private static String fluidJson(final FluidState state) {
        String kind = state.getType().isSame(Fluids.WATER) ? "water" : "lava";
        return "{\"kind\":\"" + kind + "\",\"amount\":" + state.getAmount()
            + ",\"falling\":" + state.getValue(FlowingFluid.FALLING) + ",\"source\":" + state.isSource() + "}";
    }
}
