import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Consumer;

import com.mojang.authlib.GameProfile;
import net.minecraft.SharedConstants;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.RegistryDataLoader;
import net.minecraft.server.Bootstrap;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.ServerScoreboard;
import net.minecraft.server.dedicated.DedicatedServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.repository.PackRepository;
import net.minecraft.server.packs.repository.ServerPacksSource;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.BlockTags;
import net.minecraft.tags.TagLoader;
import net.minecraft.util.AbortableIterationConsumer;
import net.minecraft.util.RandomSource;
import net.minecraft.util.debug.ServerDebugSubscribers;
import net.minecraft.world.Difficulty;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageSources;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.boss.enderdragon.EnderDragon;
import net.minecraft.world.entity.boss.enderdragon.EnderDragonPart;
import net.minecraft.world.entity.boss.enderdragon.phases.DragonPhaseInstance;
import net.minecraft.world.entity.boss.enderdragon.phases.EnderDragonPhase;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.flag.FeatureFlags;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.border.WorldBorder;
import net.minecraft.world.level.chunk.ChunkAccess;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.dimension.BuiltinDimensionTypes;
import net.minecraft.world.level.dimension.end.EnderDragonFight;
import net.minecraft.world.level.entity.EntityTypeTest;
import net.minecraft.world.level.entity.LevelEntityGetter;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.LegacyRandomSource;
import net.minecraft.world.level.levelgen.PositionalRandomFactory;
import net.minecraft.world.level.material.FluidState;
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
 * constructor, which answers the calls the dragon and the entities near it make: the heightmap
 * from {@link #surface}, the blocks a fight's {@link Layout} places in open air, the oracle's
 * players and zombies, the vanilla data pack's tags and damage types, and a log of what the dragon
 * spawns and which blocks change. The dragon, its phase manager, its phases, the players and the
 * zombies are Java's own objects built with their real constructors. The fight is an
 * `EnderDragonFight` allocated the same way with only its crystal count set, which is all the
 * phases read from it.
 *
 * The node file records the 24 path nodes over that heightmap, `findClosestNode` from a grid of
 * points, and `findPath` between every pair of nodes, with and without crystals left and with an
 * end node after the last one.
 *
 * The fight file records seeded fights. Each tick first lands the blows a fight's {@link Blows}
 * deal the dragon, through `EnderDragonPart.hurtServer` as a player's attack does. It then runs
 * `Entity.commonTick` and `Entity.tick` on the dragon, as a `ServerLevel` ticks an entity, and
 * `commonTick` and `baseTick` on each standing entity, which keeps the clocks the dragon reads
 * (age, hurt time, damage cooldown, who last hurt it) without moving it. Each tick records the
 * phase, the position, the yaw and whether a wall slows the dragon. The file also lists each
 * change of the target the phase flies toward, each entity the dragon spawns, each block it
 * changes, each push and blow it deals the standing entities, each line of sight it checks, and
 * every draw from the dragon's random source with the method that made it.
 *
 * Usage: `DumpDragonVectors <output-directory>`, run from inside `node_modules/.cache/jsprismarine/`.
 */
public final class DumpDragonVectors {
    /** The ground height the oracle's heightmap reports: `56 + floorMod(7x + 13z, 23)`. */
    static int surface(final int x, final int z) {
        return 56 + Math.floorMod(x * 7 + z * 13, 23);
    }

    private static final Unsafe UNSAFE = unsafe();

    /** The vanilla data pack's worldgen registries, which hold the damage types, with their tags bound. */
    private static RegistryAccess.Frozen registries;

    public static void main(final String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: DumpDragonVectors <output-directory>");
            System.exit(2);
        }
        SharedConstants.tryDetectVersion();
        Bootstrap.bootStrap();
        loadVanillaData();
        java.nio.file.Path out = java.nio.file.Path.of(args[0]);
        Files.writeString(out.resolve("dragon-nodes.json"), nodes(), StandardCharsets.UTF_8);
        Files.writeString(out.resolve("dragon-fights.json"), fights(), StandardCharsets.UTF_8);
    }

    /**
     * Loads the vanilla data pack as a server does on start: binds its tags to the built-in
     * registries, so `#minecraft:dragon_immune` and `#minecraft:dragon_transparent` match, and
     * loads the worldgen registries with their tags, which is where the damage types live.
     */
    private static void loadVanillaData() {
        PackRepository packs = ServerPacksSource.createVanillaTrustedRepository();
        packs.reload();
        packs.setSelected(List.of("vanilla"));
        try (MultiPackResourceManager resources = new MultiPackResourceManager(PackType.SERVER_DATA, packs.openAllSelected())) {
            RegistryAccess.Frozen builtIn = RegistryAccess.fromRegistryOfRegistries(BuiltInRegistries.REGISTRY);
            List<Registry.PendingTags<?>> tags = TagLoader.loadTagsForExistingRegistries(resources, builtIn);
            List<HolderLookup.RegistryLookup<?>> lookups = TagLoader.buildUpdatedLookups(builtIn, tags);
            registries = RegistryDataLoader.load(resources, lookups, RegistryDataLoader.WORLD_REGISTRIES, Runnable::run).join();
            tags.forEach(Registry.PendingTags::apply);
        }
    }

    // The level.

    /** A `ServerLevel` that is never constructed; see the class comment. */
    static final class OracleLevel extends ServerLevel {
        List<Player> oraclePlayers;
        /** The players, then the zombies, in the order the fight lists them. */
        List<LivingEntity> standing;
        EnderDragon dragon;
        List<String> spawned;
        Map<BlockPos, BlockState> blocks;
        List<String> blockChanges;
        List<String> pushes;
        List<String> blows;
        GameRules gameRules;
        WorldBorder border;
        int tick;
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
            BlockState state = this.blocks.get(pos);
            return state == null ? Blocks.AIR.defaultBlockState() : state;
        }

        /**
         * No chunk is loaded. An entity's tick asks for one only to see whether a section holds a
         * fluid before it looks for water to swim in, and no block the oracle places holds one.
         */
        @Override
        public ChunkAccess getChunk(final int x, final int z, final ChunkStatus status, final boolean loadOrGenerate) {
            return null;
        }

        /** A chunk's answer: the fluid of the block there. */
        @Override
        public FluidState getFluidState(final BlockPos pos) {
            return this.getBlockState(pos).getFluidState();
        }

        /** A chunk's answer: true when the state changed, false when the block already was that state. */
        @Override
        public boolean setBlock(final BlockPos pos, final BlockState state, final int flags, final int recursionLeft) {
            BlockState old = this.getBlockState(pos);
            if (old == state) return false;
            BlockPos at = pos.immutable();
            if (state.isAir()) this.blocks.remove(at);
            else this.blocks.put(at, state);
            this.blockChanges.add("[" + this.tick + ", " + at.getX() + ", " + at.getY() + ", " + at.getZ() + ", " + stateJson(state) + "]");
            return true;
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
        public GameRules getGameRules() {
            return this.gameRules;
        }

        @Override
        public WorldBorder getWorldBorder() {
            return this.border;
        }

        @Override
        public long getGameTime() {
            return this.tick;
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
        public void broadcastDamageEvent(final Entity entity, final DamageSource source) {
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

        /** The entity storage's answer, which `Level.getEntities` filters: the standing entities and the dragon. */
        @Override
        protected LevelEntityGetter<Entity> getEntities() {
            return new StandingEntities(this);
        }

        @Override
        public java.util.Collection<EnderDragonPart> dragonParts() {
            return this.dragon == null ? List.of() : List.of(this.dragon.getSubEntities());
        }

        int indexOf(final Entity entity) {
            return this.standing.indexOf(entity);
        }

        /** What the dragon did to a standing entity: each push as `Entity.push` received it. */
        void pushed(final LivingEntity entity, final double x, final double y, final double z) {
            this.pushes.add("[" + this.tick + ", " + this.indexOf(entity) + ", " + num(x) + ", " + num(y) + ", " + num(z) + "]");
        }

        /**
         * Each blow a standing entity took: the tick, the entity, the damage type, the damage, whether
         * `hurtServer` took it, and the game tick of the blow its `getLastHurtByMob` remembers, or null.
         */
        void hurt(final LivingEntity entity, final DamageSource source, final float damage, final boolean took) {
            this.blows.add("[" + this.tick + ", " + this.indexOf(entity) + ", \"" + source.typeHolder().getRegisteredName() + "\", "
                + num(damage) + ", " + took + ", " + mark(entity) + "]");
        }
    }

    /** What `getLastHurtByMob` remembers, as the game tick of that blow, or null when it remembers nobody. */
    static String mark(final LivingEntity entity) {
        return entity.getLastHurtByMob() == null ? "null" : Integer.toString(entity.getLastHurtByMobTimestamp());
    }

    /**
     * The entity storage of {@link OracleLevel}: the standing entities and the dragon, matched by
     * their bounding boxes as an `EntitySection` matches them.
     */
    private record StandingEntities(OracleLevel level) implements LevelEntityGetter<Entity> {
        private List<Entity> all() {
            List<Entity> all = new ArrayList<>();
            if (this.level.dragon != null) all.add(this.level.dragon);
            all.addAll(this.level.standing);
            return all;
        }

        @Override
        public Entity get(final int id) {
            for (Entity entity : this.all()) if (entity.getId() == id) return entity;
            return null;
        }

        @Override
        public Entity get(final UUID id) {
            for (Entity entity : this.all()) if (entity.getUUID().equals(id)) return entity;
            return null;
        }

        @Override
        public Iterable<Entity> getAll() {
            return this.all();
        }

        @Override
        public <U extends Entity> void get(final EntityTypeTest<Entity, U> type, final AbortableIterationConsumer<U> output) {
            for (Entity entity : this.all()) {
                U cast = type.tryCast(entity);
                if (cast != null && output.accept(cast).shouldAbort()) return;
            }
        }

        @Override
        public void get(final AABB bb, final Consumer<Entity> output) {
            for (Entity entity : this.all()) if (entity.getBoundingBox().intersects(bb)) output.accept(entity);
        }

        @Override
        public <U extends Entity> void get(final EntityTypeTest<Entity, U> type, final AABB bb, final AbortableIterationConsumer<U> output) {
            for (Entity entity : this.all()) {
                U cast = type.tryCast(entity);
                if (cast != null && entity.getBoundingBox().intersects(bb) && output.accept(cast).shouldAbort()) return;
            }
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

    /** How much health the standing entities get, the most `max_health` allows, so no fight kills one. */
    private static final double STANDING_HEALTH = 1024;

    private static void toughen(final LivingEntity entity) {
        entity.getAttribute(Attributes.MAX_HEALTH).setBaseValue(STANDING_HEALTH);
        entity.setHealth((float) STANDING_HEALTH);
    }

    /** A survival player standing where the oracle puts it, which logs the pushes and blows it takes. */
    static final class OraclePlayer extends Player {
        OraclePlayer(final Level level, final int index) {
            super(level, new GameProfile(new UUID(0L, index + 1L), "player" + index));
            toughen(this);
        }

        @Override
        public GameType gameMode() {
            return GameType.SURVIVAL;
        }

        @Override
        public void push(final double x, final double y, final double z) {
            ((OracleLevel) this.level()).pushed(this, x, y, z);
            super.push(x, y, z);
        }

        @Override
        public boolean hurtServer(final ServerLevel level, final DamageSource source, final float damage) {
            boolean took = super.hurtServer(level, source, damage);
            ((OracleLevel) level).hurt(this, source, damage, took);
            return took;
        }
    }

    /** A zombie standing where the oracle puts it, which logs the pushes and blows it takes. */
    static final class OracleZombie extends Zombie {
        OracleZombie(final Level level) {
            super(EntityTypes.ZOMBIE, level);
            toughen(this);
        }

        @Override
        public void push(final double x, final double y, final double z) {
            ((OracleLevel) this.level()).pushed(this, x, y, z);
            super.push(x, y, z);
        }

        @Override
        public boolean hurtServer(final ServerLevel level, final DamageSource source, final float damage) {
            boolean took = super.hurtServer(level, source, damage);
            ((OracleLevel) level).hurt(this, source, damage, took);
            return took;
        }
    }

    private static OracleLevel level() throws Exception {
        OracleLevel level = (OracleLevel) UNSAFE.allocateInstance(OracleLevel.class);
        level.oraclePlayers = new ArrayList<>();
        level.standing = new ArrayList<>();
        level.spawned = new ArrayList<>();
        level.blocks = new HashMap<>();
        level.blockChanges = new ArrayList<>();
        level.pushes = new ArrayList<>();
        level.blows = new ArrayList<>();
        level.gameRules = new GameRules(FeatureFlags.VANILLA_SET);
        level.border = new WorldBorder();
        // The fields `Level`'s constructor would set that the entities read: the End's dimension
        // type, the damage types, and the random sources a sound draws its seed from.
        set(Level.class, level, "dimensionTypeRegistration",
            registries.lookupOrThrow(Registries.DIMENSION_TYPE).getOrThrow(BuiltinDimensionTypes.END));
        set(Level.class, level, "registryAccess", registries);
        set(Level.class, level, "damageSources", new DamageSources(registries));
        set(Level.class, level, "random", new LegacyRandomSource(0L));
        set(Level.class, level, "soundSeedGenerator", new LegacyRandomSource(0L));
        return level;
    }

    private static void set(final Class<?> owner, final Object target, final String name, final Object value) throws Exception {
        Field field = owner.getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
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

    /**
     * Java's dragon, which logs each `hasLineOfSight` answer: the tick, the standing entity, and
     * whether it sees it past the layout's blocks. The strafe asks on each tick it is in range, and
     * the scan's targeting asks through `Sensing`, which keeps each answer.
     */
    static final class OracleDragon extends EnderDragon {
        final List<String> sights = new ArrayList<>();

        OracleDragon(final OracleLevel level) {
            super(EntityTypes.ENDER_DRAGON, level);
        }

        @Override
        public boolean hasLineOfSight(final Entity target) {
            boolean sees = super.hasLineOfSight(target);
            OracleLevel level = (OracleLevel) this.level();
            this.sights.add("[" + level.tick + ", " + level.indexOf(target) + ", " + sees + "]");
            return sees;
        }
    }

    private static OracleDragon dragon(final OracleLevel level, final int crystals, final BlockPos origin) throws Exception {
        OracleDragon dragon = new OracleDragon(level);
        dragon.setDragonFight(fight(crystals));
        dragon.setFightOrigin(origin);
        return dragon;
    }

    // The node graph.

    private static String nodes() throws Exception {
        OracleLevel level = level();
        StringBuilder json = new StringBuilder("{\n");
        json.append("\"surface\": \"56 + floorMod(7x + 13z, 23)\",\n");

        EnderDragon withCrystals = dragon(level, 10, BlockPos.ZERO);
        EnderDragon withoutCrystals = dragon(level, 0, BlockPos.ZERO);
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

    // The blocks.

    /**
     * Blocks a fight places in the open air. `pillars` stands a one-block column from y 60 to 150 on
     * every sixth x and z between 24 and 110 blocks from the origin, leaving out the columns within
     * two blocks of a path node, so the heightmap still answers for every column the dragon asks
     * about. Each block of a column is `Palette.STATES[floorMod(3x + 5y + 11z, 9)]`.
     */
    enum Layout {
        NONE,
        PILLARS;


        void place(final OracleLevel level, final Node[] nodes) {
            if (this == NONE) return;
            for (int x = -110; x <= 110; x += 6) {
                for (int z = -110; z <= 110; z += 6) {
                    int away = x * x + z * z;
                    if (away < 24 * 24 || away > 110 * 110) continue;
                    boolean byNode = false;
                    for (Node node : nodes) byNode |= Math.abs(node.x - x) <= 2 && Math.abs(node.z - z) <= 2;
                    if (byNode) continue;
                    for (int y = 60; y <= 150; y++) {
                        level.blocks.put(new BlockPos(x, y, z), Palette.STATES[Math.floorMod(3 * x + 5 * y + 11 * z, Palette.STATES.length)]);
                    }
                }
            }
        }
    }

    /** The blocks `pillars` cycles through, a holder class so it is built after `Bootstrap` has run. */
    private static final class Palette {
        static final BlockState[] STATES = {
            Blocks.STONE.defaultBlockState(),
            Blocks.OBSIDIAN.defaultBlockState(),
            Blocks.END_STONE.defaultBlockState(),
            Blocks.FIRE.defaultBlockState(),
            Blocks.LIGHT.defaultBlockState(),
            Blocks.CAVE_AIR.defaultBlockState(),
            Blocks.OAK_LEAVES.defaultBlockState(),
            Blocks.IRON_BARS.defaultBlockState(),
            Blocks.DIRT.defaultBlockState()
        };
    }

    // The blows the dragon takes.

    /** One blow to the dragon: the part it lands on, who deals it, and how much. */
    private record Blow(String part, String source, float damage) {
    }

    /** The blows a fight deals the dragon before a tick. */
    @FunctionalInterface
    private interface Blows {
        List<Blow> at(int tick, EnderDragon dragon);
    }

    private static final Blows NO_BLOWS = (tick, dragon) -> List.of();

    /** The blows that cycle while the dragon sits, one every three ticks. */
    private static final Blow[] SITTING_BLOWS = {
        new Blow("head", "player", 6),
        new Blow("body", "player", 20),
        new Blow("neck", "player", 9),
        new Blow("tail1", "player", 12),
        new Blow("head", "player", 2),
        new Blow("body", "explosion", 16),
        new Blow("head", "zombie", 30),
        new Blow("head", "player", 15),
        new Blow("wing1", "player", 7)
    };

    /**
     * Blows at the dragon: {@link #SITTING_BLOWS} while it sits, a player's with an explosion and the
     * first zombie's bite among them, and an explosion on the body and one on the head 25 ticks
     * apart while it flies over the first 300 ticks. A player's blow knocks a flying dragon back,
     * which the port leaves to the server, and an explosion knocks back nothing. The blows stop
     * while the dragon has less than 40 health, so the fight never kills it.
     */
    private static final Blows BLOWS_AT_THE_DRAGON = (tick, dragon) -> {
        if (dragon.getHealth() < 40) return List.of();
        if (dragon.getPhaseManager().getCurrentPhase().isSitting()) {
            return tick % 3 == 0 ? List.of(SITTING_BLOWS[(tick / 3) % SITTING_BLOWS.length]) : List.of();
        }
        if (tick >= 300) return List.of();
        if (tick % 50 == 0) return List.of(new Blow("body", "explosion", 8));
        if (tick % 50 == 25) return List.of(new Blow("head", "explosion", 4));
        return List.of();
    };

    private static EnderDragonPart part(final EnderDragon dragon, final String name) {
        String[] names = { "head", "neck", "body", "tail1", "tail2", "tail3", "wing1", "wing2" };
        for (int i = 0; i < names.length; i++) if (names[i].equals(name)) return dragon.getSubEntities()[i];
        throw new IllegalArgumentException(name);
    }

    private static DamageSource source(final OracleLevel level, final String source) {
        return switch (source) {
            case "player" -> level.damageSources().playerAttack(level.oraclePlayers.getFirst());
            case "zombie" -> level.damageSources().mobAttack(level.standing.get(level.oraclePlayers.size()));
            case "explosion" -> level.damageSources().explosion(null, null);
            default -> throw new IllegalArgumentException(source);
        };
    }

    // The fights.

    /** One recorded fight. */
    private static final class Fight {
        final String name;
        final long seed;
        final int crystals;
        final double[] start;
        final double[][] players;
        final int ticks;
        BlockPos origin = BlockPos.ZERO;
        double[][] zombies = {};
        Layout layout = Layout.NONE;
        boolean mobGriefing = true;
        Blows blows = NO_BLOWS;

        Fight(final String name, final long seed, final int crystals, final double[] start, final double[][] players, final int ticks) {
            this.name = name;
            this.seed = seed;
            this.crystals = crystals;
            this.start = start;
            this.players = players;
            this.ticks = ticks;
        }

        Fight origin(final int x, final int y, final int z) {
            this.origin = new BlockPos(x, y, z);
            return this;
        }

        Fight zombies(final double[]... zombies) {
            this.zombies = zombies;
            return this;
        }

        Fight layout(final Layout layout, final boolean mobGriefing) {
            this.layout = layout;
            this.mobGriefing = mobGriefing;
            return this;
        }

        Fight blows(final Blows blows) {
            this.blows = blows;
            return this;
        }
    }

    /** Zombies on the ground around the portal, at 3, 6 and 9 blocks in eight directions. */
    private static double[][] zombiesAroundThePortal(final int originX, final int originZ) {
        List<double[]> zombies = new ArrayList<>();
        int[][] directions = { { 1, 0 }, { 1, 1 }, { 0, 1 }, { -1, 1 }, { -1, 0 }, { -1, -1 }, { 0, -1 }, { 1, -1 } };
        for (int ring : new int[] { 3, 6, 9 }) {
            for (int[] direction : directions) {
                int x = originX + direction[0] * ring;
                int z = originZ + direction[1] * ring;
                zombies.add(new double[] { x + 0.5, surface(x, z), z + 0.5 });
            }
        }
        return zombies.toArray(double[][]::new);
    }

    /** Zombies standing in the air on the holding pattern's outer ring, every 30 degrees. */
    private static double[][] zombiesOnTheRing() {
        List<double[]> zombies = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            double angle = Math.toRadians(i * 30 + 15);
            zombies.add(new double[] { Math.floor(60 * Math.cos(angle)) + 0.5, 95 + (i % 4) * 8, Math.floor(60 * Math.sin(angle)) + 0.5 });
        }
        return zombies.toArray(double[][]::new);
    }

    private static final Fight[] FIGHTS = {
        new Fight("no crystals, a player by the portal", 1L, 0, new double[] { 0, 128, 0 },
            new double[][] { { 6.5, 57, -9.5 } }, 3600),
        new Fight("ten crystals, a player out on the island", 7L, 10, new double[] { 0, 128, 0 },
            new double[][] { { -38.5, 70, 25.5 } }, 1600),
        new Fight("no crystals, nobody there", 42L, 0, new double[] { 30, 100, -20 },
            new double[][] {}, 2000),
        new Fight("two crystals, a player out of reach of the scan", 1234L, 2, new double[] { 0, 128, 0 },
            new double[][] { { 70.5, 75, 70.5 } }, 2400),
        new Fight("no fight, two players", 99L, -1, new double[] { -10, 110, 40 },
            new double[][] { { 12.5, 60, 3.5 }, { -50.5, 80, -45.5 } }, 1600),
        new Fight("no crystals, zombies around the portal and on the ring", 5L, 0, new double[] { 0, 128, 0 },
            new double[][] { { 2.5, 60, -4.5 } }, 2400)
            .zombies(concat(zombiesAroundThePortal(0, 0), zombiesOnTheRing())),
        new Fight("no crystals, pillars in the way", 11L, 0, new double[] { 0, 128, 0 },
            new double[][] { { 6.5, 57, -9.5 } }, 1800)
            .layout(Layout.PILLARS, true),
        new Fight("no crystals, pillars in the way without mob griefing", 11L, 0, new double[] { 0, 128, 0 },
            new double[][] { { 6.5, 57, -9.5 } }, 1800)
            .layout(Layout.PILLARS, false),
        new Fight("no crystals, blows at the dragon", 3L, 0, new double[] { 0, 128, 0 },
            new double[][] { { 4.5, 60, -3.5 } }, 3000)
            .zombies(zombiesAroundThePortal(0, 0))
            .blows(BLOWS_AT_THE_DRAGON),
        new Fight("one crystal, a fight away from the world's origin", 21L, 1, new double[] { 20, 120, -10 },
            new double[][] { { 44.5, 70, -27.5 } }, 2400)
            .origin(40, 0, -24)
    };

    private static double[][] concat(final double[][] a, final double[][] b) {
        double[][] all = new double[a.length + b.length][];
        System.arraycopy(a, 0, all, 0, a.length);
        System.arraycopy(b, 0, all, a.length, b.length);
        return all;
    }

    private static String fights() throws Exception {
        StringBuilder json = new StringBuilder("{\n");
        json.append("\"palette\": [");
        for (int i = 0; i < Palette.STATES.length; i++) {
            BlockState state = Palette.STATES[i];
            if (i > 0) json.append(", ");
            json.append('[').append(stateJson(state)).append(", ").append(state.isAir()).append(", ")
                .append(state.is(BlockTags.DRAGON_IMMUNE)).append(", ").append(state.is(BlockTags.DRAGON_TRANSPARENT)).append(']');
        }
        json.append("],\n");
        json.append("\"sizes\": {");
        OracleLevel probe = level();
        LivingEntity[] kinds = { new OraclePlayer(probe, 0), new OracleZombie(probe) };
        for (int i = 0; i < kinds.length; i++) {
            if (i > 0) json.append(", ");
            json.append('"').append(EntityType.getKey(kinds[i].getType())).append("\": [").append(num(kinds[i].getBbWidth()))
                .append(", ").append(num(kinds[i].getBbHeight())).append(']');
        }
        json.append("},\n\"standingHealth\": ").append(num(STANDING_HEALTH)).append(",\n\"fights\": [\n");
        for (int f = 0; f < FIGHTS.length; f++) {
            if (f > 0) json.append(",\n");
            json.append(fight(FIGHTS[f]));
        }
        return json.append("\n]\n}\n").toString();
    }

    private static String fight(final Fight fight) throws Exception {
        OracleLevel level = level();
        // `GameRules.set` tells a running server about the change; there is none to tell.
        level.gameRules.set(GameRules.MOB_GRIEFING, fight.mobGriefing, null);
        for (int i = 0; i < fight.players.length; i++) {
            OraclePlayer player = new OraclePlayer(level, i);
            player.setPos(fight.players[i][0], fight.players[i][1], fight.players[i][2]);
            level.oraclePlayers.add(player);
            level.standing.add(player);
        }
        for (double[] at : fight.zombies) {
            OracleZombie zombie = new OracleZombie(level);
            zombie.setPos(at[0], at[1], at[2]);
            level.standing.add(zombie);
        }
        OracleDragon dragon = dragon(level, fight.crystals, fight.origin);
        level.dragon = dragon;
        dragon.findClosestNode();
        fight.layout.place(level, nodeArray(dragon));
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
        List<String> hits = new ArrayList<>();
        List<String> forgets = new ArrayList<>();
        List<Integer> walls = new ArrayList<>();
        Vec3 lastTarget = null;
        for (int tick = 0; tick < fight.ticks; tick++) {
            level.tick = tick;
            draws.tick = tick;
            for (Blow blow : fight.blows.at(tick, dragon)) {
                boolean took = part(dragon, blow.part).hurtServer(level, source(level, blow.source), blow.damage);
                hits.add("[" + tick + ", \"" + blow.part + "\", \"" + blow.source + "\", " + num(blow.damage) + ", " + took + ", "
                    + num(dragon.getHealth()) + "]");
            }
            int spawnedBefore = level.spawned.size();
            dragon.commonTick();
            dragon.tick();
            for (LivingEntity entity : level.standing) {
                String before = mark(entity);
                entity.commonTick();
                entity.baseTick();
                if (!before.equals(mark(entity))) forgets.add("[" + tick + ", " + level.indexOf(entity) + ", " + mark(entity) + "]");
            }
            DragonPhaseInstance phase = dragon.getPhaseManager().getCurrentPhase();
            phases.add(phase.getPhase().getId());
            xs.add(dragon.getX());
            ys.add(dragon.getY());
            zs.add(dragon.getZ());
            yRots.add(dragon.getYRot());
            if (dragon.inWall) walls.add(tick);
            // The target changes a few times a lap, so the file lists each change rather than every tick.
            Vec3 target = phase.getFlyTargetLocation();
            if (tick == 0 || !Objects.equals(target, lastTarget)) {
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
        json.append("\"origin\": [").append(fight.origin.getX()).append(", ").append(fight.origin.getY()).append(", ")
            .append(fight.origin.getZ()).append("],\n");
        json.append("\"mobGriefing\": ").append(fight.mobGriefing).append(",\n");
        json.append("\"layout\": \"").append(fight.layout.name().toLowerCase()).append("\",\n");
        json.append("\"start\": [").append(num(fight.start[0])).append(", ").append(num(fight.start[1])).append(", ")
            .append(num(fight.start[2])).append("],\n");
        json.append("\"players\": ").append(points(fight.players)).append(",\n");
        json.append("\"zombies\": ").append(points(fight.zombies)).append(",\n");
        json.append("\"ticks\": ").append(fight.ticks).append(",\n");
        json.append("\"phase\": ").append(ints(phases)).append(",\n");
        json.append("\"x\": ").append(doubles(xs)).append(",\n");
        json.append("\"y\": ").append(doubles(ys)).append(",\n");
        json.append("\"z\": ").append(doubles(zs)).append(",\n");
        json.append("\"yRot\": ").append(floats(yRots)).append(",\n");
        json.append("\"inWall\": ").append(ints(walls)).append(",\n");
        json.append("\"targets\": [").append(String.join(", ", targets)).append("],\n");
        json.append("\"spawns\": [").append(String.join(", ", spawns)).append("],\n");
        json.append("\"blockChanges\": [").append(String.join(", ", level.blockChanges)).append("],\n");
        json.append("\"pushes\": [").append(String.join(", ", level.pushes)).append("],\n");
        json.append("\"blows\": [").append(String.join(", ", level.blows)).append("],\n");
        json.append("\"forgets\": [").append(String.join(", ", forgets)).append("],\n");
        json.append("\"hits\": [").append(String.join(", ", hits)).append("],\n");
        json.append("\"sights\": [").append(String.join(", ", dragon.sights)).append("],\n");
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
     * The port copies neither `EnderDragon.checkCrystals`, which looks for a crystal to heal from on
     * one tick in ten, nor the dragon's sounds: `Mob.baseTick` draws each tick for whether it
     * growls, and `LivingEntity.getVoicePitch` for the pitch of a growl or a hurt sound. The draws
     * those make are only counted.
     */
    static final class Draws implements RandomSource {
        private static final java.util.Set<String> UNCOPIED =
            java.util.Set.of("EnderDragon.checkCrystals", "Mob.baseTick", "LivingEntity.getVoicePitch");
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

    /** A block state as `["name", {"property": "value"}]`. */
    static String stateJson(final BlockState state) {
        StringBuilder json = new StringBuilder("[\"").append(BuiltInRegistries.BLOCK.getKey(state.getBlock())).append("\", {");
        boolean first = true;
        for (Property<?> property : state.getProperties()) {
            if (!first) json.append(", ");
            first = false;
            json.append('"').append(property.getName()).append("\": \"").append(valueName(state, property)).append('"');
        }
        return json.append("}]").toString();
    }

    private static <T extends Comparable<T>> String valueName(final BlockState state, final Property<T> property) {
        return property.getName(state.getValue(property));
    }

    private static String num(final double value) {
        if (Double.isNaN(value)) return "null";
        if (value == Math.rint(value) && Math.abs(value) < 1e15) return Long.toString((long) value);
        return Double.toString(value);
    }

    private static String points(final double[][] points) {
        StringBuilder out = new StringBuilder("[");
        for (int i = 0; i < points.length; i++) {
            if (i > 0) out.append(", ");
            out.append('[').append(num(points[i][0])).append(", ").append(num(points[i][1])).append(", ").append(num(points[i][2]))
                .append(']');
        }
        return out.append(']').toString();
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
