import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Predicate;

import com.mojang.authlib.GameProfile;
import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.server.Bootstrap;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.dedicated.DedicatedServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.ServerScoreboard;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.RandomSource;
import net.minecraft.util.debug.ServerDebugSubscribers;
import net.minecraft.world.Difficulty;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.entity.boss.enderdragon.phases.DragonPhaseInstance;
import net.minecraft.world.entity.boss.enderdragon.phases.EnderDragonPhase;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.dimension.end.EnderDragonFight;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.LegacyRandomSource;
import net.minecraft.world.level.levelgen.PositionalRandomFactory;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.level.pathfinder.Node;
import net.minecraft.world.level.pathfinder.Path;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import sun.misc.Unsafe;

/**
 * Dumps `vectors/26.3/dragon-nodes.json` and `vectors/26.3/dragon-fights.json`: Java's ender dragon
 * run on a level with no server behind it.
 *
 * The level is {@link OracleLevel}, a `ServerLevel` subclass allocated without running its
 * constructor, which answers the few calls the dragon makes: the heightmap from {@link #surface},
 * the oracle's players, open air everywhere, no other entities, and a log of what the dragon spawns.
 * The dragon, its phase manager, its phases and the players are Java's own objects built with their
 * real constructors. The fight is an `EnderDragonFight` allocated the same way with only its crystal
 * count set, which is all the phases read from it.
 *
 * The node file records the 24 path nodes over that heightmap, `findClosestNode` from a grid of
 * points, and `findPath` between every pair of nodes, with and without crystals left and with an
 * end node after the last one.
 *
 * The fight file records seeded fights: each tick runs `EnderDragon.aiStep` and records the phase,
 * the position and the yaw, and the file lists each change of the target the phase flies toward,
 * each entity the dragon spawns, and every draw from the dragon's random source with the method
 * that made it. `aiStep` is what the port copies; the rest of `Entity.tick` is not, and it leaves
 * the dragon's flight alone.
 *
 * Usage: `DumpDragonVectors <output-directory>`, run from inside `node_modules/.cache/jsprismarine/`.
 */
public final class DumpDragonVectors {
    /** The ground height the oracle's heightmap reports: `56 + floorMod(7x + 13z, 23)`. */
    static int surface(final int x, final int z) {
        return 56 + Math.floorMod(x * 7 + z * 13, 23);
    }

    private static final Unsafe UNSAFE = unsafe();

    public static void main(final String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: DumpDragonVectors <output-directory>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
        java.nio.file.Path out = java.nio.file.Path.of(args[0]);
        Files.writeString(out.resolve("dragon-nodes.json"), nodes(), StandardCharsets.UTF_8);
        Files.writeString(out.resolve("dragon-fights.json"), fights(), StandardCharsets.UTF_8);
    }

    // The level.

    /** A `ServerLevel` that is never constructed; see the class comment. */
    static final class OracleLevel extends ServerLevel {
        List<Player> oraclePlayers;
        List<String> spawned;
        int nextId;

        private OracleLevel() {
            super(null, null, null, null, null, null, false, 0L, null, false);
        }

        @Override
        public MinecraftServer getServer() {
            return Server.SERVER;
        }

        @Override
        public BlockPos getHeightmapPos(final Heightmap.Types type, final BlockPos pos) {
            return new BlockPos(pos.getX(), surface(pos.getX(), pos.getZ()), pos.getZ());
        }

        @SuppressWarnings({ "unchecked", "rawtypes" })
        @Override
        public List<ServerPlayer> players() {
            // The phases read these as `Player`; nothing casts them to `ServerPlayer`.
            return (List) this.oraclePlayers;
        }

        @Override
        public EnderDragonFight getDragonFight() {
            return null;
        }

        @Override
        public BlockState getBlockState(final BlockPos pos) {
            return Blocks.AIR.defaultBlockState();
        }

        @Override
        public FluidState getFluidState(final BlockPos pos) {
            return Fluids.EMPTY.defaultFluidState();
        }

        @Override
        public Difficulty getDifficulty() {
            return Difficulty.NORMAL;
        }

        @Override
        public ServerScoreboard getScoreboard() {
            return Server.SCOREBOARD;
        }

        @Override
        public int getNextEntityId() {
            return ++this.nextId;
        }

        @Override
        public boolean addFreshEntity(final Entity entity) {
            this.spawned.add("\"" + EntityType.getKey(entity.getType()) + "\", " + num(entity.getX()) + ", " + num(entity.getY())
                + ", " + num(entity.getZ()));
            return true;
        }

        @Override
        public void levelEvent(final Entity source, final int type, final BlockPos pos, final int data) {
        }

        @Override
        public void gameEvent(final Holder<GameEvent> event, final Vec3 position, final GameEvent.Context context) {
        }

        @Override
        public void broadcastEntityEvent(final Entity entity, final byte event) {
        }

        @Override
        public void playSeededSound(
            final Entity except,
            final double x,
            final double y,
            final double z,
            final Holder<SoundEvent> sound,
            final SoundSource source,
            final float volume,
            final float pitch,
            final long seed
        ) {
        }

        @Override
        public void playSeededSound(
            final Entity except,
            final Entity sourceEntity,
            final Holder<SoundEvent> sound,
            final SoundSource source,
            final float volume,
            final float pitch,
            final long seed
        ) {
        }

        @Override
        public List<Entity> getEntities(final Entity except, final AABB bb, final Predicate<? super Entity> selector) {
            return List.of();
        }

        @Override
        public <T extends Entity> List<T> getEntities(
            final EntityTypeTest<Entity, T> type,
            final AABB bb,
            final Predicate<? super T> selector
        ) {
            return List.of();
        }
    }

    /**
     * A server allocated without its constructor, which only answers `debugSubscribers` with nobody
     * subscribed: the dragon's navigation and its block checks ask it whether to capture debug data.
     * A holder class, so it is built after `Bootstrap` has run.
     */
    private static final class Server {
        static final MinecraftServer SERVER = server();
        static final ServerScoreboard SCOREBOARD = new ServerScoreboard(SERVER);

        private static MinecraftServer server() {
            try {
                MinecraftServer server = (MinecraftServer) UNSAFE.allocateInstance(DedicatedServer.class);
                Field subscribers = MinecraftServer.class.getDeclaredField("debugSubscribers");
                subscribers.setAccessible(true);
                subscribers.set(server, new ServerDebugSubscribers(server));
                return server;
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    /** A survival player standing where the oracle puts it. */
    static final class OraclePlayer extends Player {
        OraclePlayer(final Level level, final int index) {
            super(level, new GameProfile(new UUID(0L, index + 1L), "player" + index));
        }

        @Override
        public GameType gameMode() {
            return GameType.SURVIVAL;
        }
    }

    private static OracleLevel level() throws Exception {
        OracleLevel level = (OracleLevel) UNSAFE.allocateInstance(OracleLevel.class);
        level.oraclePlayers = new ArrayList<>();
        level.spawned = new ArrayList<>();
        return level;
    }

    /** An `EnderDragonFight` with only its crystal count, or none for a dragon outside a fight. */
    private static EnderDragonFight fight(final int crystals) throws Exception {
        if (crystals < 0) return null;
        EnderDragonFight fight = (EnderDragonFight) UNSAFE.allocateInstance(EnderDragonFight.class);
        Field alive = EnderDragonFight.class.getDeclaredField("aliveCrystals");
        alive.setAccessible(true);
        alive.setInt(fight, crystals);
        return fight;
    }

    private static EnderDragon dragon(final OracleLevel level, final int crystals) throws Exception {
        EnderDragon dragon = new EnderDragon(EntityTypes.ENDER_DRAGON, level);
        dragon.setDragonFight(fight(crystals));
        dragon.setFightOrigin(BlockPos.ZERO);
        return dragon;
    }

    // The node graph.

    private static String nodes() throws Exception {
        OracleLevel level = level();
        StringBuilder json = new StringBuilder("{\n");
        json.append("\"surface\": \"56 + floorMod(7x + 13z, 23)\",\n");

        EnderDragon withCrystals = dragon(level, 10);
        EnderDragon withoutCrystals = dragon(level, 0);
        withCrystals.findClosestNode();
        withoutCrystals.findClosestNode();
        Node[] nodes = nodeArray(withCrystals);
        json.append("\"nodes\": [");
        for (int i = 0; i < nodes.length; i++) {
            if (i > 0) json.append(", ");
            json.append('[').append(nodes[i].x).append(", ").append(nodes[i].y).append(", ").append(nodes[i].z).append(']');
        }
        json.append("],\n");

        // `findClosestNode()` from where the dragon stands, over a grid that covers the rings.
        json.append("\"closest\": [");
        boolean first = true;
        for (int x = -90; x <= 90; x += 15) {
            for (int z = -90; z <= 90; z += 15) {
                for (double y : new double[] { 40.5, 75.25, 104.75, 140 }) {
                    double px = x + 0.37;
                    double pz = z - 0.61;
                    withCrystals.setPos(px, y, pz);
                    withoutCrystals.setPos(px, y, pz);
                    if (!first) json.append(", ");
                    first = false;
                    json.append('[').append(num(px)).append(", ").append(num(y)).append(", ").append(num(pz)).append(", ")
                        .append(withCrystals.findClosestNode()).append(", ").append(withoutCrystals.findClosestNode()).append(']');
                }
            }
        }
        json.append("],\n");

        // `findPath` between every pair, as node indices, -1 standing for the end node.
        Node end = new Node(3, 61, -5);
        json.append("\"end\": [3, 61, -5],\n");
        json.append("\"paths\": [");
        first = true;
        for (EnderDragon dragon : new EnderDragon[] { withCrystals, withoutCrystals }) {
            Node[] graph = nodeArray(dragon);
            for (int from = 0; from < 24; from++) {
                for (int to = 0; to < 24; to++) {
                    for (boolean withEnd : new boolean[] { false, true }) {
                        Node last = withEnd ? new Node(end.x, end.y, end.z) : null;
                        Path path = dragon.findPath(from, to, last);
                        if (!first) json.append(",\n");
                        first = false;
                        json.append('[').append(dragon == withCrystals ? 1 : 0).append(", ").append(from).append(", ")
                            .append(to).append(", ").append(withEnd ? 1 : 0).append(", ");
                        if (path == null) {
                            json.append("null");
                        } else {
                            json.append('[');
                            for (int i = 0; i < path.getNodeCount(); i++) {
                                if (i > 0) json.append(", ");
                                json.append(indexOf(graph, path.getNode(i), last));
                            }
                            json.append(']');
                        }
                        json.append(']');
                    }
                }
            }
        }
        json.append("]\n}\n");
        return json.toString();
    }

    private static Node[] nodeArray(final EnderDragon dragon) throws Exception {
        Field field = EnderDragon.class.getDeclaredField("nodes");
        field.setAccessible(true);
        return (Node[]) field.get(dragon);
    }

    private static int indexOf(final Node[] graph, final Node node, final Node last) {
        if (node == last) return -1;
        for (int i = 0; i < graph.length; i++) if (graph[i] == node) return i;
        throw new IllegalStateException("a path node that is not one of the dragon's");
    }

    // The fights.

    /** One recorded fight. */
    private record Fight(String name, long seed, int crystals, double[] start, double[][] players, int ticks) {
    }

    private static final Fight[] FIGHTS = {
        new Fight("no crystals, a player by the portal", 1L, 0, new double[] { 0, 128, 0 },
            new double[][] { { 6.5, 57, -9.5 } }, 2400),
        new Fight("ten crystals, a player out on the island", 7L, 10, new double[] { 0, 128, 0 },
            new double[][] { { -38.5, 70, 25.5 } }, 1600),
        new Fight("no crystals, nobody there", 42L, 0, new double[] { 30, 100, -20 },
            new double[][] {}, 2000),
        new Fight("two crystals, a player out of reach of the scan", 1234L, 2, new double[] { 0, 128, 0 },
            new double[][] { { 70.5, 75, 70.5 } }, 2400),
        new Fight("no fight, two players", 99L, -1, new double[] { -10, 110, 40 },
            new double[][] { { 12.5, 60, 3.5 }, { -50.5, 80, -45.5 } }, 1600)
    };

    private static String fights() throws Exception {
        StringBuilder json = new StringBuilder("{\n\"fights\": [\n");
        for (int f = 0; f < FIGHTS.length; f++) {
            if (f > 0) json.append(",\n");
            json.append(fight(FIGHTS[f]));
        }
        return json.append("\n]\n}\n").toString();
    }

    private static String fight(final Fight fight) throws Exception {
        OracleLevel level = level();
        for (int i = 0; i < fight.players.length; i++) {
            OraclePlayer player = new OraclePlayer(level, i);
            player.setPos(fight.players[i][0], fight.players[i][1], fight.players[i][2]);
            level.oraclePlayers.add(player);
        }
        EnderDragon dragon = dragon(level, fight.crystals);
        Draws draws = new Draws(fight.seed);
        Field random = Entity.class.getDeclaredField("random");
        random.setAccessible(true);
        random.set(dragon, draws);
        dragon.snapTo(fight.start[0], fight.start[1], fight.start[2], 0.0F, 0.0F);
        dragon.getPhaseManager().setPhase(EnderDragonPhase.HOLDING_PATTERN);

        List<Integer> phases = new ArrayList<>();
        List<Double> xs = new ArrayList<>(), ys = new ArrayList<>(), zs = new ArrayList<>();
        List<Float> yRots = new ArrayList<>();
        List<String> targets = new ArrayList<>();
        List<String> spawns = new ArrayList<>();
        Vec3 lastTarget = null;
        for (int tick = 0; tick < fight.ticks; tick++) {
            draws.tick = tick;
            int spawnedBefore = level.spawned.size();
            dragon.aiStep();
            DragonPhaseInstance phase = dragon.getPhaseManager().getCurrentPhase();
            phases.add(phase.getPhase().getId());
            xs.add(dragon.getX());
            ys.add(dragon.getY());
            zs.add(dragon.getZ());
            yRots.add(dragon.getYRot());
            // The target changes a few times a lap, so the file lists each change rather than every tick.
            Vec3 target = phase.getFlyTargetLocation();
            if (tick == 0 || !java.util.Objects.equals(target, lastTarget)) {
                targets.add(target == null
                    ? "[" + tick + ", null]"
                    : "[" + tick + ", " + num(target.x) + ", " + num(target.y) + ", " + num(target.z) + "]");
            }
            lastTarget = target;
            for (int i = spawnedBefore; i < level.spawned.size(); i++) spawns.add("[" + tick + ", " + level.spawned.get(i) + "]");
        }

        StringBuilder json = new StringBuilder("{\n");
        json.append("\"name\": \"").append(fight.name).append("\",\n");
        json.append("\"seed\": ").append(fight.seed).append(",\n");
        json.append("\"crystals\": ").append(fight.crystals < 0 ? "null" : Integer.toString(fight.crystals)).append(",\n");
        json.append("\"start\": [").append(num(fight.start[0])).append(", ").append(num(fight.start[1])).append(", ")
            .append(num(fight.start[2])).append("],\n");
        json.append("\"players\": [");
        for (int i = 0; i < fight.players.length; i++) {
            if (i > 0) json.append(", ");
            json.append('[').append(num(fight.players[i][0])).append(", ").append(num(fight.players[i][1])).append(", ")
                .append(num(fight.players[i][2])).append(']');
        }
        json.append("],\n");
        json.append("\"ticks\": ").append(fight.ticks).append(",\n");
        json.append("\"phase\": ").append(ints(phases)).append(",\n");
        json.append("\"x\": ").append(doubles(xs)).append(",\n");
        json.append("\"y\": ").append(doubles(ys)).append(",\n");
        json.append("\"z\": ").append(doubles(zs)).append(",\n");
        json.append("\"yRot\": ").append(floats(yRots)).append(",\n");
        json.append("\"targets\": [").append(String.join(", ", targets)).append("],\n");
        json.append("\"spawns\": [").append(String.join(", ", spawns)).append("],\n");
        json.append("\"draws\": [").append(String.join(", ", draws.rows)).append("],\n");
        json.append("\"uncopiedDraws\": {");
        boolean first = true;
        for (var entry : draws.uncopied.entrySet()) {
            if (!first) json.append(", ");
            first = false;
            json.append('"').append(entry.getKey()).append("\": ").append(entry.getValue());
        }
        json.append("}\n}");
        return json.toString();
    }

    /**
     * The dragon's random source: Java's `LegacyRandomSource`, logging each draw as the tick, the
     * method that made it, its bound (-1 for `nextFloat`) and its value.
     *
     * The port does not copy `EnderDragon.checkCrystals`, which looks for a crystal to heal from on
     * one tick in ten, so the draws it makes are only counted.
     */
    static final class Draws implements RandomSource {
        private static final java.util.Set<String> UNCOPIED = java.util.Set.of("EnderDragon.checkCrystals");
        private final LegacyRandomSource source;
        int tick;
        final List<String> rows = new ArrayList<>();
        final java.util.Map<String, Integer> uncopied = new java.util.TreeMap<>();

        Draws(final long seed) {
            this.source = new LegacyRandomSource(seed);
        }

        private void log(final int bound, final double value) {
            String site = StackWalker.getInstance().walk(frames -> frames
                .filter(frame -> !frame.getClassName().equals(Draws.class.getName()))
                .map(frame -> {
                    String name = frame.getClassName();
                    return name.substring(name.lastIndexOf('.') + 1) + "." + frame.getMethodName();
                })
                .findFirst()
                .orElseThrow());
            if (UNCOPIED.contains(site)) this.uncopied.merge(site, 1, Integer::sum);
            else this.rows.add("[" + this.tick + ", \"" + site + "\", " + bound + ", " + num(value) + "]");
        }

        @Override
        public int nextInt(final int bound) {
            int value = this.source.nextInt(bound);
            this.log(bound, value);
            return value;
        }

        @Override
        public float nextFloat() {
            float value = this.source.nextFloat();
            this.log(-1, value);
            return value;
        }

        private UnsupportedOperationException unmodeled(final String draw) {
            return new UnsupportedOperationException("the dragon drew " + draw + ", which the vectors do not record");
        }

        @Override
        public RandomSource fork() {
            throw this.unmodeled("fork");
        }

        @Override
        public PositionalRandomFactory forkPositional() {
            throw this.unmodeled("forkPositional");
        }

        @Override
        public void setSeed(final long seed) {
            throw this.unmodeled("setSeed");
        }

        @Override
        public int nextInt() {
            throw this.unmodeled("nextInt()");
        }

        @Override
        public long nextLong() {
            throw this.unmodeled("nextLong");
        }

        @Override
        public boolean nextBoolean() {
            throw this.unmodeled("nextBoolean");
        }

        @Override
        public double nextDouble() {
            throw this.unmodeled("nextDouble");
        }

        @Override
        public double nextGaussian() {
            throw this.unmodeled("nextGaussian");
        }
    }

    // JSON.

    private static String num(final double value) {
        if (Double.isNaN(value)) return "null";
        if (value == Math.rint(value) && Math.abs(value) < 1e15) return Long.toString((long) value);
        return Double.toString(value);
    }

    private static String ints(final List<Integer> values) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) out.append(", ");
            out.append(values.get(i));
        }
        return out.append(']').toString();
    }

    private static String doubles(final List<Double> values) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) out.append(", ");
            out.append(num(values.get(i)));
        }
        return out.append(']').toString();
    }

    /** Floats as `Float.toString`, the shortest decimal that reads back as the same float. */
    private static String floats(final List<Float> values) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) out.append(", ");
            float value = values.get(i);
            out.append(value == Math.rint(value) ? Long.toString((long) value) : Float.toString(value));
        }
        return out.append(']').toString();
    }

    private static Unsafe unsafe() {
        try {
            Field field = Unsafe.class.getDeclaredField("theUnsafe");
            field.setAccessible(true);
            return (Unsafe) field.get(null);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}
