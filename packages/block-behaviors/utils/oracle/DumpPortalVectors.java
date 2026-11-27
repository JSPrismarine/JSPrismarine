import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeSet;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.Bootstrap;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.repository.PackRepository;
import net.minecraft.server.packs.repository.ServerPacksSource;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.tags.TagLoader;
import net.minecraft.util.BlockUtil;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.border.WorldBorder;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.portal.PortalForcer;

/**
 * Dumps `portal-creation.json`, which `run.mjs` copies to `vectors/<release>/`: where Java's
 * `PortalForcer.createPortal` builds a nether portal in a set of fixed block layouts, and every
 * block it writes there.
 *
 * `createPortal` reads the world through a few `ServerLevel` methods: the world border, the
 * dimension's lowest y, height and logical height, the `MOTION_BLOCKING` heightmap and block
 * states, and it writes through `setBlock`. {@link Layout} is a `ServerLevel` subclass that
 * answers those from a map of block states, and nothing else. A real `ServerLevel` needs a running
 * server, so the layout is allocated with `Unsafe.allocateInstance`, which skips every
 * constructor, and its own fields are set afterwards. The heightmap is computed from the map with
 * `Heightmap.Types.MOTION_BLOCKING`'s own predicate, the way a chunk's heightmap is, once
 * {@link #bindVanillaTags} has bound the tag that predicate reads. The block rules
 * (`canBeReplaced`, `isSolid`, the fluid state) are the real block states after
 * `Bootstrap.bootStrap`, and the search, its tie-breaking and the writes are Java's own code.
 *
 * Each layout is a list of cuboid fills applied in order over air, so
 * `src/rules/portal.vectors.test.ts` rebuilds the same world block for block. The dump also
 * records, for every block the layouts use, the four block rules the search reads, so the test can
 * check the port classifies each block the way Java does.
 *
 * Usage: `DumpPortalVectors <output-directory>`, run from inside `node_modules/.cache/jsprismarine/`.
 */
public final class DumpPortalVectors {
    private DumpPortalVectors() {}

    /** A dimension's vertical extent, as its dimension type gives it. */
    private record Dimension(String name, int minY, int height, int logicalHeight) {}

    private static final Dimension OVERWORLD = new Dimension("overworld", -64, 384, 384);
    private static final Dimension NETHER = new Dimension("the_nether", 0, 256, 128);
    /** A custom dimension too short for a forced portal: its top is under y 79. */
    private static final Dimension SHALLOW = new Dimension("shallow", 0, 64, 64);

    /** A cuboid of one block, corners inclusive. */
    private record Fill(int[] from, int[] to, String block) {}

    /** A square world border, as `/worldborder center` and `/worldborder set` give it. */
    private record Border(double centerX, double centerZ, double size) {}

    /** One layout: the world, the arrival block and the source portal's axis. */
    private record Case(String name, Dimension dimension, Border border, List<Fill> fills, int[] target, String axis) {}

    private static Fill fill(int x1, int y1, int z1, int x2, int y2, int z2, String block) {
        return new Fill(new int[] { x1, y1, z1 }, new int[] { x2, y2, z2 }, block);
    }

    private static int[] at(int x, int y, int z) {
        return new int[] { x, y, z };
    }

    /** Stone from y 60 to `top` across the whole search area around the origin. */
    private static Fill ground(int top) {
        return fill(-24, 60, -24, 24, top, 24, "minecraft:stone");
    }

    private static List<Case> cases() {
        List<Case> cases = new ArrayList<>();
        // Open air over flat ground: the column under the target wins.
        cases.add(new Case("open-air-x", OVERWORLD, null, List.of(ground(62)), at(3, 70, -2), "x"));
        cases.add(new Case("open-air-z", OVERWORLD, null, List.of(ground(62)), at(0, 63, 0), "z"));
        // A 5 by 5 pillar over the target, so equally close columns around it tie.
        cases.add(new Case(
            "pillar-ties",
            OVERWORLD,
            null,
            List.of(ground(62), fill(-2, 63, -2, 2, 100, 2, "minecraft:stone")),
            at(0, 64, 0),
            "x"
        ));
        cases.add(new Case(
            "pillar-ties-z",
            OVERWORLD,
            null,
            List.of(ground(62), fill(-2, 63, -2, 2, 100, 2, "minecraft:stone")),
            at(0, 64, 0),
            "z"
        ));
        // A cliff: low ground west of x = 0, high ground east of it.
        List<Fill> cliff = List.of(ground(62), fill(0, 63, -24, 24, 90, 24, "minecraft:stone"));
        cases.add(new Case("cliff-below", OVERWORLD, null, cliff, at(-4, 70, 0), "x"));
        cases.add(new Case("cliff-edge-x", OVERWORLD, null, cliff, at(1, 91, 0), "x"));
        cases.add(new Case("cliff-edge-z", OVERWORLD, null, cliff, at(0, 91, 0), "z"));
        // Short grass and a snow layer on flat ground: both replaceable, and neither blocks motion.
        cases.add(new Case(
            "short-grass",
            OVERWORLD,
            null,
            List.of(ground(62), fill(-24, 63, -24, 24, 63, 24, "minecraft:short_grass")),
            at(0, 64, 0),
            "x"
        ));
        cases.add(new Case(
            "snow-layer",
            OVERWORLD,
            null,
            List.of(ground(62), fill(-24, 63, -24, 24, 63, 24, "minecraft:snow")),
            at(0, 64, 0),
            "x"
        ));
        cases.add(new Case(
            "snow-patch",
            OVERWORLD,
            null,
            List.of(ground(62), fill(-6, 63, -6, 6, 63, 6, "minecraft:snow")),
            at(0, 64, 0),
            "z"
        ));
        // Cobwebs are solid to Java but block no motion, so the heightmap starts each column under them.
        cases.add(new Case(
            "cobweb-layer",
            OVERWORLD,
            null,
            List.of(ground(62), fill(-24, 63, -24, 24, 63, 24, "minecraft:cobweb")),
            at(0, 64, 0),
            "x"
        ));
        // Under a roof the column is walked past the cobwebs, and Java stands the portal on them.
        cases.add(new Case(
            "cobweb-cave",
            OVERWORLD,
            null,
            List.of(
                ground(62),
                fill(-24, 63, -24, 24, 63, 24, "minecraft:cobweb"),
                fill(-24, 68, -24, 24, 72, 24, "minecraft:stone")
            ),
            at(0, 64, 0),
            "x"
        ));
        // A Nether lava lake with a netherrack shore and a bedrock roof.
        List<Fill> lake = List.of(
            fill(-24, 28, -24, 24, 40, 24, "minecraft:netherrack"),
            fill(-12, 32, -12, 12, 40, 12, "minecraft:lava"),
            fill(-24, 123, -24, 24, 127, 24, "minecraft:bedrock")
        );
        cases.add(new Case("lava-lake", NETHER, null, lake, at(0, 45, 0), "z"));
        cases.add(new Case("lava-lake-x", NETHER, null, lake, at(3, 36, -1), "x"));
        // A lava sea that covers the whole search area, so the portal is forced over it.
        cases.add(new Case(
            "lava-sea",
            NETHER,
            null,
            List.of(
                fill(-24, 28, -24, 24, 31, 24, "minecraft:netherrack"),
                fill(-24, 32, -24, 24, 40, 24, "minecraft:lava")
            ),
            at(5, 36, 5),
            "x"
        ));
        // Nothing at all: forced, with y clamped into [70, top - 9].
        cases.add(new Case("void-overworld", OVERWORLD, null, List.of(), at(10, 100, 10), "x"));
        cases.add(new Case("void-nether-low", NETHER, null, List.of(), at(0, 20, 0), "z"));
        cases.add(new Case("void-nether-high", NETHER, null, List.of(), at(0, 125, 0), "x"));
        cases.add(new Case("void-overworld-high", OVERWORLD, null, List.of(), at(-7, 319, 4), "z"));
        // Ground near the build limit: the frame's top row must stay at or under y 319.
        cases.add(new Case(
            "build-limit",
            OVERWORLD,
            null,
            List.of(fill(-24, 300, -24, -1, 314, 24, "minecraft:stone"), fill(0, 300, -24, 24, 315, 24, "minecraft:stone")),
            at(0, 319, 0),
            "x"
        ));
        // Under the Nether's roof, which is the logical height rather than the build height.
        cases.add(new Case(
            "nether-roof",
            NETHER,
            null,
            List.of(
                fill(-24, 95, -24, 24, 120, 24, "minecraft:netherrack"),
                fill(-24, 121, -24, 24, 127, 24, "minecraft:bedrock"),
                fill(-24, 128, -24, 24, 140, 24, "minecraft:netherrack"),
                fill(4, 121, -2, 8, 125, 2, "minecraft:air")
            ),
            at(0, 120, 0),
            "x"
        ));
        // A world border 16 wide: columns outside it, or whose next block along the axis is, are skipped.
        cases.add(new Case("border-search", OVERWORLD, new Border(0, 0, 16), List.of(ground(62)), at(6, 63, 0), "x"));
        cases.add(new Case("border-search-z", OVERWORLD, new Border(0, 0, 16), List.of(ground(62)), at(0, 63, -9), "z"));
        // A forced portal outside an off-center border is clamped back inside it.
        cases.add(new Case("border-forced-west", OVERWORLD, new Border(0.25, 0, 10), List.of(), at(-20, 100, 3), "x"));
        cases.add(new Case("border-forced-east", OVERWORLD, new Border(0.25, 0, 10), List.of(), at(20, 100, 20), "z"));
        // A dimension too short for a forced portal: Java gives up and builds nothing.
        cases.add(new Case("too-short", SHALLOW, null, List.of(), at(0, 30, 0), "x"));
        return cases;
    }

    /**
     * The world `createPortal` reads, answering only the `ServerLevel` methods it calls.
     *
     * It is never constructed: {@link #allocate} makes one with `Unsafe.allocateInstance`, so the
     * constructor below exists only to compile, and its fields start out null and are set there.
     */
    static final class Layout extends ServerLevel {
        Map<Long, BlockState> blocks;
        List<JsonObject> writes;
        WorldBorder border;
        int minY;
        int height;
        int logicalHeight;

        @SuppressWarnings("unused")
        private Layout() {
            super(null, null, null, null, null, null, false, 0L, null, false);
        }

        static Layout allocate(Dimension dimension, WorldBorder border) throws ReflectiveOperationException {
            Field theUnsafe = Class.forName("sun.misc.Unsafe").getDeclaredField("theUnsafe");
            theUnsafe.setAccessible(true);
            Object unsafe = theUnsafe.get(null);
            Layout layout = (Layout) unsafe.getClass().getMethod("allocateInstance", Class.class).invoke(unsafe, Layout.class);
            layout.blocks = new HashMap<>();
            layout.writes = new ArrayList<>();
            layout.border = border;
            layout.minY = dimension.minY();
            layout.height = dimension.height();
            layout.logicalHeight = dimension.logicalHeight();
            return layout;
        }

        void put(BlockPos pos, BlockState state) {
            if (state.isAir()) this.blocks.remove(pos.asLong());
            else this.blocks.put(pos.asLong(), state);
        }

        @Override
        public WorldBorder getWorldBorder() {
            return this.border;
        }

        @Override
        public int getMinY() {
            return this.minY;
        }

        @Override
        public int getHeight() {
            return this.height;
        }

        @Override
        public int getLogicalHeight() {
            return this.logicalHeight;
        }

        @Override
        public BlockState getBlockState(BlockPos pos) {
            if (this.isOutsideBuildHeight(pos)) return Blocks.VOID_AIR.defaultBlockState();
            return this.blocks.getOrDefault(pos.asLong(), Blocks.AIR.defaultBlockState());
        }

        /** `Heightmap.getFirstAvailable` for the column: one above the highest motion-blocking block. */
        @Override
        public int getHeight(Heightmap.Types type, int x, int z) {
            var opaque = type.isOpaque();
            for (int y = this.getMaxY(); y >= this.minY; y--) {
                if (opaque.test(this.getBlockState(new BlockPos(x, y, z)))) return y + 1;
            }
            return this.minY;
        }

        @Override
        public boolean setBlock(BlockPos pos, BlockState state, int flags, int recursionLeft) {
            JsonObject write = new JsonObject();
            write.add("at", position(pos));
            write.addProperty("block", BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString());
            if (state.hasProperty(BlockStateProperties.HORIZONTAL_AXIS)) {
                write.addProperty("axis", state.getValue(BlockStateProperties.HORIZONTAL_AXIS).getSerializedName());
            }
            this.writes.add(write);
            this.put(pos.immutable(), state);
            return true;
        }
    }

    private static JsonArray position(BlockPos pos) {
        JsonArray array = new JsonArray();
        array.add(pos.getX());
        array.add(pos.getY());
        array.add(pos.getZ());
        return array;
    }

    private static JsonArray position(int[] xyz) {
        return position(new BlockPos(xyz[0], xyz[1], xyz[2]));
    }

    private static BlockState stateOf(String name) {
        return BuiltInRegistries.BLOCK.getValue(Identifier.parse(name)).defaultBlockState();
    }

    /**
     * Binds the vanilla data pack's tags to the built-in registries, as a server does on start.
     * `MOTION_BLOCKING` reads `#minecraft:blocks_motion_in_heightmap`, which is unbound, and so
     * matches nothing, until then.
     */
    private static void bindVanillaTags() {
        PackRepository packs = ServerPacksSource.createVanillaTrustedRepository();
        packs.reload();
        packs.setSelected(List.of("vanilla"));
        try (MultiPackResourceManager resources = new MultiPackResourceManager(PackType.SERVER_DATA, packs.openAllSelected())) {
            RegistryAccess registries = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
            TagLoader.loadTagsForExistingRegistries(resources, registries).forEach(Registry.PendingTags::apply);
        }
    }

    public static void main(String[] args) throws Exception {
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
        bindVanillaTags();
        Path outputDir = Path.of(args[0]);

        JsonArray results = new JsonArray();
        TreeSet<String> used = new TreeSet<>(List.of("minecraft:air", "minecraft:obsidian", "minecraft:nether_portal"));
        for (Case layoutCase : cases()) {
            WorldBorder border = new WorldBorder();
            if (layoutCase.border() != null) {
                border.setCenter(layoutCase.border().centerX(), layoutCase.border().centerZ());
                border.setSize(layoutCase.border().size());
            }
            Layout layout = Layout.allocate(layoutCase.dimension(), border);
            JsonArray fills = new JsonArray();
            for (Fill fill : layoutCase.fills()) {
                BlockState state = stateOf(fill.block());
                used.add(fill.block());
                for (int x = fill.from()[0]; x <= fill.to()[0]; x++) {
                    for (int y = fill.from()[1]; y <= fill.to()[1]; y++) {
                        for (int z = fill.from()[2]; z <= fill.to()[2]; z++) layout.put(new BlockPos(x, y, z), state);
                    }
                }
                JsonObject entry = new JsonObject();
                entry.add("from", position(fill.from()));
                entry.add("to", position(fill.to()));
                entry.addProperty("block", fill.block());
                fills.add(entry);
            }

            BlockPos target = new BlockPos(layoutCase.target()[0], layoutCase.target()[1], layoutCase.target()[2]);
            Direction.Axis axis = Direction.Axis.byName(layoutCase.axis());
            Optional<BlockUtil.FoundRectangle> found = new PortalForcer(layout).createPortal(target, axis);

            JsonObject result = new JsonObject();
            result.addProperty("name", layoutCase.name());
            JsonObject dimension = new JsonObject();
            dimension.addProperty("name", layoutCase.dimension().name());
            dimension.addProperty("minY", layoutCase.dimension().minY());
            dimension.addProperty("height", layoutCase.dimension().height());
            dimension.addProperty("logicalHeight", layoutCase.dimension().logicalHeight());
            result.add("dimension", dimension);
            if (layoutCase.border() != null) {
                JsonObject bounds = new JsonObject();
                bounds.addProperty("minX", border.getMinX());
                bounds.addProperty("maxX", border.getMaxX());
                bounds.addProperty("minZ", border.getMinZ());
                bounds.addProperty("maxZ", border.getMaxZ());
                result.add("border", bounds);
            }
            result.add("fills", fills);
            result.add("target", position(target));
            result.addProperty("axis", layoutCase.axis());
            if (found.isPresent()) {
                result.add("origin", position(found.get().minCorner));
                result.addProperty("width", found.get().axis1Size);
                result.addProperty("height", found.get().axis2Size);
            } else {
                result.add("origin", null);
            }
            JsonArray writes = new JsonArray();
            for (JsonObject write : layout.writes) writes.add(write);
            result.add("writes", writes);
            results.add(result);
        }

        // The block rules the search reads, for every block a layout uses or Java writes.
        JsonObject rules = new JsonObject();
        for (String name : used) {
            BlockState state = stateOf(name);
            JsonObject rule = new JsonObject();
            rule.addProperty("canBeReplaced", state.canBeReplaced());
            rule.addProperty("isSolid", state.isSolid());
            rule.addProperty("hasFluid", !state.getFluidState().isEmpty());
            rule.addProperty("motionBlocking", Heightmap.Types.MOTION_BLOCKING.isOpaque().test(state));
            rules.add(name, rule);
        }

        JsonObject out = new JsonObject();
        out.addProperty("javaVersion", SharedConstants.getCurrentVersion().name());
        out.add("blockRules", rules);
        out.add("cases", results);
        Files.createDirectories(outputDir);
        Files.writeString(
            outputDir.resolve("portal-creation.json"),
            new GsonBuilder().serializeNulls().create().toJson(out),
            StandardCharsets.UTF_8
        );
    }
}
