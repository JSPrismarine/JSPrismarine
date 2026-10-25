import { DisconnectReason } from '@jsprismarine/minecraft';
import { RakNetListener, ServerName } from '@jsprismarine/raknet';
import Console from './Console';
import SessionManager from './SessionManager';
import BanManager from './ban/BanManager';
import BlockManager from './block/BlockManager';
import type { Random } from './utils/Random';
import { ChatManager } from './chat/ChatManager';
import { buildServerContent } from './content/ServerContent';
import type { ServerContent } from './content/ServerContent';
import { readContentSettings } from './content/settings';
import { serverWorldSource } from './content/world/serverSource';
import { EntityRuntimes } from './entity/data/live';
import type { LiveEntityRuntime } from './entity/data/live';
import type { ServerWorldHandle } from './content/world/serverSource';
import { StationRegistry } from './crafting/CraftingStation';
import RecipeManager from './crafting/RecipeManager';
import { CommandManager } from './command/CommandManager';
import { EventEmitter } from './events/EventEmitter';
import { TickEvent } from './events/Events';
import RaknetConnectEvent from './events/raknet/RaknetConnectEvent';
import RaknetDisconnectEvent from './events/raknet/RaknetDisconnectEvent';
import RaknetEncapsulatedPacketEvent from './events/raknet/RaknetEncapsulatedPacketEvent';
import ItemManager from './item/ItemManager';
import { CreativeInventory } from './inventory/CreativeInventory';
import ClientConnection from './network/ClientConnection';
import { joinContentPayloads } from './network/contentPayloads';
import Identifiers from './network/Identifiers';
import { WorldReplicators } from './network/NetworkWorldReplicator';
import { PacketLogFilter } from './network/PacketLogFilter';
import PacketRegistry from './network/PacketRegistry';
import type { DataPacket } from './network/Packets';
import BatchPacket from './network/packet/BatchPacket';
import { readPacketId } from './network/packet/DataPacket';
import { isPreLoginHandler } from './network/handler/PreLoginPacketHandler';
import { PermissionManager } from './permission/PermissionManager';
import { QueryManager } from './query/QueryManager';
import Timer from './utils/Timer';
import ChunkScheduler from './world/ChunkScheduler';
import WorldManager from './world/WorldManager';

import type { InetAddress, RakNetSession } from '@jsprismarine/raknet';
import type { Config } from './config/Config';

import type { Logger } from '@jsprismarine/logger';
import pkg from '../package.json' with { type: 'json' };

type LateTickProfile = {
    elapsedMs: number;
    tickHandlersMs: number;
    worldUpdatesMs: number;
    chunkSchedulerMs: number;
    timerDelayMs: number;
    slowestWorldName: string | null;
    slowestWorldMs: number;
};

const summarizeLateTicks = (profiles: readonly LateTickProfile[]): string => {
    const totals = profiles.reduce(
        (summary, profile) => ({
            elapsedMs: summary.elapsedMs + profile.elapsedMs,
            tickHandlersMs: summary.tickHandlersMs + profile.tickHandlersMs,
            worldUpdatesMs: summary.worldUpdatesMs + profile.worldUpdatesMs,
            chunkSchedulerMs: summary.chunkSchedulerMs + profile.chunkSchedulerMs,
            timerDelayMs: summary.timerDelayMs + profile.timerDelayMs,
            otherMs:
                summary.otherMs +
                Math.max(
                    0,
                    profile.elapsedMs - profile.tickHandlersMs - profile.worldUpdatesMs - profile.chunkSchedulerMs
                )
        }),
        { elapsedMs: 0, tickHandlersMs: 0, worldUpdatesMs: 0, chunkSchedulerMs: 0, timerDelayMs: 0, otherMs: 0 }
    );
    const average = (duration: number) => `${(duration / profiles.length).toFixed(0)} ms`;
    const slowestWorld = profiles.reduce<LateTickProfile | undefined>(
        (slowest, profile) => (!slowest || profile.slowestWorldMs > slowest.slowestWorldMs ? profile : slowest),
        undefined
    );
    const slowestWorldDetail = slowestWorld?.slowestWorldName
        ? `; slowest world update ${slowestWorld.slowestWorldName} (${slowestWorld.slowestWorldMs.toFixed(0)} ms)`
        : '';

    return `Lag profile over ${profiles.length} late tick(s): avg work ${average(totals.elapsedMs)}/tick (tick handlers ${average(totals.tickHandlersMs)}, world updates ${average(totals.worldUpdatesMs)}, chunk scheduler ${average(totals.chunkSchedulerMs)}, other ${average(totals.otherMs)}); timer callback delays ${totals.timerDelayMs.toFixed(0)} ms total${slowestWorldDetail}`;
};

/**
 * JSPrismarine's main server class.
 * @public
 */
export default class Server extends EventEmitter {
    private raknet: RakNetListener | undefined;
    private readonly logger: Logger;
    private readonly config: Config;
    private packetLogFilter: PacketLogFilter | null = null;
    private readonly console: Console | undefined;
    private readonly packetRegistry: PacketRegistry;
    private readonly sessionManager = new SessionManager();
    private readonly commandManager: CommandManager;
    private readonly worldManager: WorldManager;

    /**
     * Feeds chunks to players a slice at a time.
     *
     * Server wide rather than per player on purpose: the budget it enforces has to be
     * shared, or ten players joining would each claim a full slice and the tick would
     * overrun by tenfold.
     */
    private readonly chunkScheduler: ChunkScheduler = new ChunkScheduler(undefined, (error, coord) => {
        // Reported rather than thrown: see the comment on the scheduler's own catch. The
        // logger is read when the failure happens, not when this closure is built.
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
            coord
                ? `Failed to send chunk §b${coord.x}, ${coord.z}§r: ${reason}`
                : `Failed to flush a chunk batch: ${reason}`
        );
        this.logger.error(error);
    });
    /**
     * The network's view of each world: who is watching it, and what they are told.
     *
     * Held here rather than on the `World` itself, which knows the players in it and nothing
     * about their connections - see {@link WorldChangeSink}.
     */
    private readonly worldReplicators = new WorldReplicators(this);
    private readonly itemManager: ItemManager;
    private readonly blockManager: BlockManager;
    private readonly recipeManager: RecipeManager;

    /**
     * This server's creative menu.
     *
     * Owned here rather than kept in a static, so two servers in one process each serve
     * their own registries. Built on the first read, which is after plugins have
     * registered.
     */
    private readonly creativeInventory = new CreativeInventory(this);

    /**
     * The blocks a player can craft at. Derived from the recipe book once it is loaded, so a
     * plugin's recipe brings its station with it.
     */
    private readonly stationRegistry = new StationRegistry();
    private readonly queryManager: QueryManager;
    private readonly chatManager: ChatManager;
    private readonly permissionManager: PermissionManager;
    private readonly banManager: BanManager;

    /** The source of chance for anything that rolls - see {@link Server.getRandom}. */
    private random: Random = Math.random;

    /**
     * Every content registry built from the pack stack.
     *
     * Undefined only before {@link Server.enableContent} has run, which is why the field is
     * private and {@link Server.getContent} throws rather than handing out `undefined`.
     */
    private content: ServerContent | undefined;

    /**
     * The world the content acts through, kept beside the content it was built for.
     *
     * The adapters are inside `ServerContent.world` as the nine projected interfaces, which is
     * all a content package may see. The interaction path needs one thing those do not expose:
     * the item actor port, which it tells what an interaction landed on.
     */
    private contentWorld: ServerWorldHandle | undefined;

    /**
     * The data-driven entity runtimes, one per dimension.
     *
     * Filled by the content world source as it assembles each dimension's adapter, and read
     * by that dimension's `World` to tick it. A dimension gains its runtime the first time
     * anything asks for its adapter, so the map is empty until then.
     */
    private entityRuntimes = new EntityRuntimes();

    /**
     * If the server is stopping.
     * @internal
     */
    private stopping = false;

    /**
     * The current ticker timer.
     * @internal
     */
    private tickerTimer: NodeJS.Timeout | undefined;

    /**
     * The current TPS.
     * @internal
     */
    private tps = 20;

    /**
     * The current tick.
     * @internal
     */
    private currentTick = 0n;

    /**
     * If the server is headless.
     * @internal
     */
    private readonly headless: boolean;

    // TODO: Move this somewhere else.
    private static readonly MINECRAFT_TICK_TIME_MS = 1000 / 20;

    /**
     * How far behind schedule the loop may fall before it stops trying to make the time
     * back. Below this, missed ticks are run back to back until the clock is caught: a
     * hitch of a few ticks should not leave the world permanently running late. Above it,
     * the backlog is written off - a ten second stall would otherwise be repaid as two
     * hundred consecutive ticks, running the world at maximum speed and starving the
     * event loop exactly when it is already struggling.
     * @internal
     */
    private static readonly MAX_CATCH_UP_MS = 2000;

    /**
     * Creates a new server instance.
     * @param {object} options - The options.
     * @param {LoggerBuilder} options.logger - The logger.
     * @param {Config} options.config - The config.
     * @returns {Server} The server instance.
     */
    public constructor({ logger, config, headless = false }: { logger: Logger; config: Config; headless?: boolean }) {
        super();

        this.headless = headless;

        logger.info(
            `Starting JSPrismarine server version §ev${pkg.version}§r for Minecraft: Bedrock Edition ${Identifiers.MinecraftVersions.at(-1)} (protocol version §e${Identifiers.Protocol}§r)`
        );

        this.logger = logger;
        this.config = config;
        this.packetRegistry = new PacketRegistry(this);
        this.itemManager = new ItemManager(this);
        this.blockManager = new BlockManager(this);
        this.recipeManager = new RecipeManager(this);
        this.worldManager = new WorldManager(this);
        if (!this.headless) this.console = new Console(this);
        this.commandManager = new CommandManager(this);
        this.queryManager = new QueryManager(this);
        this.chatManager = new ChatManager(this);
        this.permissionManager = new PermissionManager(this);
        this.banManager = new BanManager(this);
    }

    /**
     * Enables the server.
     * @returns {Promise<void>} A promise that resolves when the server is enabled.
     * @internal
     */
    private async enable(): Promise<void> {
        await this.config.enable();
        await this.console?.enable();
        await this.logger.enable();
        this.enableContent();
        // Built before a player arrives, so the report of what the content
        // build invented reads as a startup line and a build that cannot
        // produce payloads says so here rather than on the first join.
        joinContentPayloads(this.content, this.logger);
        await this.permissionManager.enable();
        await this.packetRegistry.enable();
        await this.itemManager.enable();
        await this.blockManager.enable();
        await this.recipeManager.enable();
        this.stationRegistry.registerRecipeStations(this);
        await this.banManager.enable();
        await this.commandManager.enable();
        await this.worldManager.enable();

        // `#minecraft:load` runs once the packs are loaded and the worlds are
        // up, because its functions are allowed to touch a world.
        await this.commandManager.runLoadFunctions();

        this.logger.setConsole(this.console);
    }

    /**
     * Builds the content registries from the pack stack.
     *
     * The build is what blocks, items, entities, recipes, loot and spawning are, so a failure
     * stops the server rather than leaving it running on nothing. `content-strict` decides the
     * softer half: whether a single pack that reports an error also fails the build, or whether
     * the stack loads short and writes the error into the content report.
     * @internal
     */
    private enableContent(): void {
        const settings = readContentSettings();
        this.content = undefined;
        this.contentWorld = undefined;
        // A fresh registry per build: the runtimes hold a closure over the content that is
        // about to be replaced, and an entity driven by the old one would read the old types.
        this.entityRuntimes = new EntityRuntimes();

        const seed = this.worldSeed();
        const timer = new Timer();
        this.contentWorld = serverWorldSource({
            // By dimension rather than by name: the content packages address a world
            // as `minecraft:overworld`, and this server loads one world per dimension.
            worldFor: (dimension) =>
                this.worldManager.getWorlds().find((world) => world.getDimension().name === dimension),
            content: () => {
                if (!this.content) throw new Error('the content world was read before the content was built');
                return this.content;
            },
            seed,
            difficulty: () => this.config.getDifficulty(),
            entityRuntimes: this.entityRuntimes
        });

        try {
            this.content = buildServerContent({
                strict: settings.strict,
                seed,
                world: this.contentWorld,
                packs: {
                    worldPacks: settings.worldPacks.map((path) => ({ kind: 'directory', path })),
                    pluginPacks: settings.datapacks.map((path) => ({ kind: 'datapack', path }))
                }
            });
        } catch (error: unknown) {
            this.logger.error(error);
            throw new Error('Failed to build the content registries; the pack stack was not loaded', {
                cause: error
            });
        }

        const errors = this.content.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
        this.logger.info(
            `Loaded §e${this.content.blocks.types.size}§r blocks, §e${this.content.items.registry.size}§r items and §e${this.content.entities.registry.size}§r entities from the pack stack in §e${timer.stop()} ms`
        );
        if (errors > 0) this.logger.warn(`The pack stack reported §c${errors}§r error(s); see the content report`);
    }

    /**
     * The default world's seed, read from the config rather than from the world.
     *
     * The content build runs before any world loads, and a `World` takes its seed from this
     * same entry, so the two agree.
     * @returns {bigint} The seed, and zero when the default world has no entry.
     * @internal
     */
    private worldSeed(): bigint {
        const seed = this.config.getWorlds()[this.config.getLevelName()]?.seed;
        return typeof seed === 'number' ? BigInt(Math.trunc(seed)) : 0n;
    }

    /**
     * Disables the server.
     * @returns {Promise<void>} A promise that resolves when the server is disabled.
     * @internal
     */
    private async disable(): Promise<void> {
        await this.worldManager.disable();
        await this.commandManager.disable();
        await this.banManager.disable();
        await this.recipeManager.disable();
        await this.blockManager.disable();
        await this.itemManager.disable();
        await this.permissionManager.disable();
        await this.packetRegistry.disable();
        await this.config.disable();
        await this.logger.disable();
    }

    public getMetadata() {
        if (!this.raknet) throw new Error('Server is not started');
        return this.raknet.serverName;
    }

    /**
     * Reloads the server.
     * @returns {Promise<void>} A promise that resolves when the server is reloaded.
     * @remarks This method is equivalent to calling {@link Server#disable} and {@link Server#enable}.
     * @remarks This method and functionality is unsupported and should ideally be completely avoided.
     */
    public async reload(): Promise<void> {
        await this.disable();
        await this.enable();
    }

    /**
     * Starts the server.
     * @param serverIp - Optional bind address. Defaults to the configured server IP.
     * @param port - Optional bind port. Defaults to the configured server port.
     * @returns {Promise<void>} A promise that resolves when the server is started.
     */
    public async bootstrap(serverIp?: string, port?: number): Promise<void> {
        await this.enable();

        const bindAddress = serverIp ?? this.config.getServerIp();
        const bindPort = port ?? this.config.getServerPort();

        this.raknet = new RakNetListener(
            this.getConfig().getMaxPlayers(),
            this.getConfig().getOnlineMode(),
            new ServerName(this),
            this.getLogger()
        );
        this.raknet.start(bindAddress, bindPort);

        this.raknet.on('openConnection', async (session: RakNetSession) => {
            const event = new RaknetConnectEvent(session);
            await this.emit('raknetConnect', event);

            if (event.isCanceled()) {
                session.disconnect();
                return;
            }

            const token = session.getAddress().toToken();
            if (this.sessionManager.has(token)) {
                this.logger.error(`Another client with token (${token}) is already connected!`);
                session.disconnect('Already connected from another location');
                return;
            }

            const timer = new Timer();
            this.logger.debug(`${token} is attempting to connect`);
            this.sessionManager.add(token, new ClientConnection(session, this.logger, this.getPacketLogFilter()));
            this.logger.verbose(`New connection handling took §e${timer.stop()} ms§r`);
        });

        this.raknet.on('closeConnection', async (inetAddr: InetAddress, reason: string) => {
            const time = Date.now();
            const token = inetAddr.toToken();

            // Claimed before anything is awaited. RakNet frees the address the instant it
            // forgets a session, and both this handler and the check in `openConnection` key
            // on the token, so leaving the entry in place across the awaits below left a
            // window in which a client reconnecting from the same port was turned away as
            // "already connected" - and the tear-down that then ran released the connection
            // that had just replaced it.
            const session = this.sessionManager.get(token);
            this.sessionManager.remove(token);

            // Read before the tear-down below, which detaches the session and takes the
            // player out of its world. A player is only added to a world once the client
            // reports itself initialised, so a session whose player is not in one belongs
            // to a client that gave up between login and spawn.
            const player = session?.getPlayerSession()?.getPlayer() ?? null;
            const spawned = player !== null && player.getWorld().getEntity(player.getRuntimeId()) === player;

            const event = new RaknetDisconnectEvent(inetAddr, reason);
            await this.emit('raknetDisconnect', event);

            if (!session) {
                this.logger.info(`${token} disconnected due to ${reason}`);
                return;
            }

            await session.closePlayerSession();

            // A spawned player announces its own departure in chat. For one that never got
            // that far this line is the only trace the connection leaves, so it is kept at a
            // level the default console shows.
            if (spawned) this.logger.debug(`${token} disconnected due to ${reason}`);
            else {
                const who = player === null ? token : `${player.getName()} (${token})`;
                this.logger.info(`${who} disconnected during the join due to ${reason}`);
            }
            this.logger.debug(`Player destruction took about ${Date.now() - time} ms`);
        });

        this.raknet.on('encapsulated', async (packet: any, inetAddr: InetAddress) => {
            const event = new RaknetEncapsulatedPacketEvent(inetAddr, packet);
            await this.emit('raknetEncapsulatedPacket', event);

            let connection: ClientConnection | null;
            if ((connection = this.sessionManager.get(inetAddr.toToken()) ?? null) === null) {
                this.logger.error(`Got a packet from a closed connection (${inetAddr.toToken()})`);
                return;
            }

            try {
                // Read batch content and handle them
                const batched = new BatchPacket(packet.content);
                batched.compressed = connection.hasCompression;

                // Read all packets inside batch and handle them
                for (const buf of await batched.asyncDecode()) {
                    const pid = readPacketId(buf);

                    if (!this.packetRegistry.getPackets().has(pid)) {
                        this.logger.warn(`Packet 0x${pid.toString(16)} isn't implemented`);
                        continue;
                    }

                    // Get packet from registry
                    const packet = new (this.packetRegistry.getPackets().get(pid)!)(buf);

                    try {
                        packet.decode();
                    } catch (error: unknown) {
                        this.logger.error(error);
                        this.logger.error(`Error while decoding packet: ${packet.constructor.name}: ${error}`);
                        continue;
                    }

                    try {
                        const handler = this.packetRegistry.getHandler(pid);
                        if (this.getPacketLogFilter().shouldLog(packet))
                            this.logger.silly(`Received §b${packet.constructor.name}§r packet`);

                        // A pre-login handler takes the bare connection; every other handler
                        // needs the player session that login creates. A packet that reaches
                        // the wrong side of that line is dropped rather than handed an object
                        // of the wrong shape.
                        const session = connection.getPlayerSession();
                        if (isPreLoginHandler(handler)) {
                            if (session === null) await handler.handle(packet, this, connection);
                            else
                                this.logger.debug(
                                    `Dropped §b${packet.constructor.name}§r: pre-login packet received after login`
                                );
                        } else if (session !== null) await handler.handle(packet, this, session);
                        else
                            this.logger.debug(
                                `Dropped §b${packet.constructor.name}§r: received before login completed`
                            );
                    } catch (error: unknown) {
                        this.logger.error(`Handler error ${packet.constructor.name}-handler: (${error})`);
                        this.logger.error(error);
                    }
                }
            } catch (error: unknown) {
                this.logger.error(error);
            }
        });

        this.raknet.on('raw', async (buffer: Buffer, inetAddr: InetAddress) => {
            if (!this.config.getEnableQuery()) return;

            try {
                await this.queryManager.onRaw(buffer, inetAddr);
            } catch (error: unknown) {
                this.logger.verbose(`QueryManager encountered an error`);
                this.logger.error(error);
            }
        });

        if (this.config.getEnableTicking()) {
            // Monotonic, not wall clock: `Date.now()` follows the system time, and an NTP
            // correction or a VM resume moves it under the scheduler. A forward step used to
            // read as accumulated lateness and trigger a catch-up burst; a backward one as
            // time to kill, stalling the server for the size of the step.
            const now = () => performance.now();

            // Every tick's deadline is derived from one fixed origin, so a tick that runs
            // long is absorbed rather than shifting every deadline behind it.
            //
            // The previous form corrected the same lateness twice - once against the last
            // period (`MINECRAFT_TICK_TIME_MS - executionTime`, where `executionTime` was
            // measured from the *end* of the previous tick and so already included its
            // sleep) and again against the accumulated total. Two corrections for one error
            // is a loop gain of two, and the loop oscillated accordingly: it alternated a
            // near-zero gap with a near-100ms one, averaging a correct 20 TPS while never
            // actually holding 50ms. Everything leaving the tick in a batch - entity
            // movement, chunk sends - went out in pairs separated by silence.
            let epoch = now();
            let nextTickExpectedStartAt = epoch;

            // Completion times of the ticks within the last second, oldest first.
            const recentTicks: number[] = [];
            const lateTickProfiles: LateTickProfile[] = [];
            const maxProfileCount = Math.ceil(Server.MAX_CATCH_UP_MS / Server.MINECRAFT_TICK_TIME_MS);
            const tick = async () => {
                if (this.stopping) return;
                const tickStartedAt = now();
                const timerDelayMs = Math.max(0, tickStartedAt - nextTickExpectedStartAt);
                let tickHandlersMs = 0;
                let worldUpdatesMs = 0;
                let chunkSchedulerMs = 0;
                let slowestWorldName: string | null = null;
                let slowestWorldMs = 0;

                // The next tick is scheduled from `finally`, and everything that can throw is
                // inside the `try`, because the timer for the next tick is installed only
                // once this one has finished. Anything escaping - a chunk that will not
                // generate, a world update, a plugin's tick listener - used to leave no timer
                // behind, and the server then sat there accepting connections while time
                // stood still. A tick that fails is worth a log line; it is not worth the
                // server.
                try {
                    const event = new TickEvent(this.getTick());

                    // Awaited, so a plugin's tick handler runs *inside* this tick like every
                    // other piece of tick work. Discarding the promise let its continuation
                    // land in the middle of some later tick, and its rejection could not
                    // reach the catch below - it surfaced as an unhandled rejection instead.
                    let phaseStartedAt = now();
                    try {
                        await this.emit('tick', event);
                    } finally {
                        tickHandlersMs = now() - phaseStartedAt;
                    }

                    const ticksPerSecond = 1000 / Server.MINECRAFT_TICK_TIME_MS;

                    // Update all worlds.
                    phaseStartedAt = now();
                    try {
                        await Promise.all(
                            this.worldManager.getWorlds().map(async (world) => {
                                const worldStartedAt = now();
                                try {
                                    await world.update(event.getTick());
                                } finally {
                                    const elapsedMs = now() - worldStartedAt;
                                    if (elapsedMs > slowestWorldMs) {
                                        slowestWorldMs = elapsedMs;
                                        slowestWorldName = world.getName();
                                    }
                                }
                            })
                        );
                    } finally {
                        worldUpdatesMs = now() - phaseStartedAt;
                    }

                    // `#minecraft:tick` and whatever `/schedule` put on this tick. After the
                    // worlds, as Java runs it, so a function sees the world the tick left.
                    await this.commandManager.tickFunctions();

                    // Whatever fits in this tick's slice; the rest waits for the next one.
                    phaseStartedAt = now();
                    try {
                        this.chunkScheduler.setBudget(this.config.getChunkSendBudgetMs());
                        await this.chunkScheduler.tick();
                    } finally {
                        chunkSchedulerMs = now() - phaseStartedAt;
                    }

                    if (
                        this.config.getEnableProcessTitle() &&
                        this.getTick() % ticksPerSecond === 0 &&
                        !this.headless
                    ) {
                        // Update the process title with TPS and tick.
                        process.title = `TPS: ${this.getTPS().toFixed(2)} | Tick: ${this.getTick()} | ${process.title.split('| ').at(-1)!}`;
                    }
                } catch (error: unknown) {
                    this.logger.error(error);
                } finally {
                    this.currentTick++;
                    const endTime = now();
                    const elapsedMs = endTime - tickStartedAt;

                    // TPS over a sliding window of the last second. The window used to be
                    // rebased whenever it crossed a second, which left the next reading
                    // measured over a single tick - noise, reported as a rate.
                    // Never pruned below two, so there is always a pair to measure between.
                    // Dropping to one collapses the window to zero width, and the reading
                    // then holds its last value - a server slowed past one tick a second
                    // would have gone on reporting whatever it managed before, which for a
                    // server that had never yet been measured is the optimistic 20 it starts
                    // life with.
                    recentTicks.push(endTime);
                    while (recentTicks.length > 2 && endTime - recentTicks[0]! > 1000) recentTicks.shift();
                    const window = endTime - recentTicks[0]!;
                    // Deliberately not clamped to 20. A loop making up lost time genuinely
                    // runs faster than that, and hiding it behind the target rate meant the
                    // one metric that should expose the fault reported perfect health.
                    if (window > 0) this.tps = ((recentTicks.length - 1) * 1000) / window;

                    // One correction, against one deadline.
                    let sleepTime = epoch + this.getTick() * Server.MINECRAFT_TICK_TIME_MS - endTime;
                    if (sleepTime <= 0) {
                        lateTickProfiles.push({
                            elapsedMs,
                            tickHandlersMs,
                            worldUpdatesMs,
                            chunkSchedulerMs,
                            timerDelayMs,
                            slowestWorldName,
                            slowestWorldMs
                        });
                        if (lateTickProfiles.length > maxProfileCount) lateTickProfiles.shift();
                    } else {
                        lateTickProfiles.length = 0;
                    }

                    if (-sleepTime > Server.MAX_CATCH_UP_MS) {
                        // Too far behind to make up. Move the origin forward by the debt so
                        // the schedule resumes from here instead of chasing a deadline that
                        // has already passed for the next forty ticks.
                        const behindBy = -sleepTime;
                        epoch += behindBy;
                        sleepTime = 0;
                        this.logger.warn(
                            `Can't keep up! Skipping ${(behindBy / Server.MINECRAFT_TICK_TIME_MS).toFixed(0)} ticks (${behindBy.toFixed(0)} ms behind)`,
                            'Server/tick'
                        );
                        this.logger.verbose(summarizeLateTicks(lateTickProfiles), 'Server/tick');
                    }

                    // Not while shutting down: `shutdown` clears the timer, and a tick still
                    // in flight at that moment would otherwise install a fresh one behind it.
                    if (!this.stopping) {
                        const delay = Math.max(0, sleepTime);
                        nextTickExpectedStartAt = endTime + delay;
                        this.tickerTimer = setTimeout(tick, delay);
                        this.tickerTimer.unref();
                    }
                }
            };

            // Start ticking
            void tick();
        }

        this.logger.info(`JSPrismarine is now listening on port §b${bindPort}`);
    }

    /**
     * Kills the server asynchronously.
     * @param {object} [options] - The options.
     * @param {boolean} [options.crash] - If the server should crash.
     * @param {boolean} [options.stayAlive] - If we should let the process stay alive.
     * @returns {Promise<void>} A promise that resolves when the server is killed.
     */
    public async shutdown(options?: { crash?: boolean; stayAlive?: boolean }): Promise<void> {
        if (this.stopping) return;
        this.stopping = true;

        this.logger.info('Stopping server', 'Server/kill');
        await this.console?.disable();

        clearInterval(this.tickerTimer);

        try {
            // Kick all online players. `kickAllPlayers` would send the `KICKED` code, and a
            // client told the server shut down shows that code instead.
            await Promise.all(
                this.sessionManager
                    .getAllPlayers()
                    .map((player) => player.kick('Server closed.', DisconnectReason.SHUTDOWN))
            );

            // Disable all managers.
            await this.disable();

            // `this.raknet` might be undefined if we kill the server really early.
            this.raknet?.kill();

            // Finally, remove all listeners.
            this.removeAllListeners();

            // Logger is no longer available.
            console.debug('Server stopped, Goodbye!\n');

            if (!options?.stayAlive) process.exit(options?.crash ? 1 : 0);
        } catch (error: unknown) {
            console.error(error);
            if (!options?.stayAlive) process.exit(1);
        }
    }

    /**
     * Sends a packet to every player on the server, in every world.
     *
     * The genuinely global channel: the player list, the command tree, a shutdown notice -
     * things that are about the server rather than about a place in it. Anything that happens
     * somewhere belongs on `World.broadcastAround`, which only reaches the players near it.
     * @param {DataPacket} dataPacket - The packet to send.
     */
    public async broadcastPacket<T extends DataPacket>(dataPacket: T): Promise<void> {
        const audience = this.sessionManager.getAllPlayers();
        if (audience.length === 0) return;

        // Compressed once for everybody. This was a serial `await` in a loop that built a
        // fresh batch per player, so a packet going to twenty clients meant twenty runs of
        // zlib over identical bytes, each waiting on the one before it.
        const batch = new BatchPacket();
        try {
            batch.addPacket(dataPacket);
            batch.compressionLevel = this.config.getPacketCompressionLevel();
            batch.encode();
        } catch (error: unknown) {
            this.logger.error(error);
            return;
        }

        const content = batch.getBuffer();
        for (const onlinePlayer of audience) {
            onlinePlayer.getNetworkSession().getConnection().sendSharedBatch(content, dataPacket);
        }
    }

    /**
     * Returns the server version.
     * @returns {string} The server version.
     * @example
     * ```typescript
     * console.log(server.getVersion());
     * ```
     */
    public getVersion(): string {
        return pkg.version;
    }

    /**
     * Returns the identifiers.
     * @returns {Identifiers} The identifiers.
     */
    public getIdentifiers(): typeof Identifiers {
        return Identifiers;
    }

    /**
     * Returns the query manager.
     * @returns {QueryManager} The query manager.
     */
    public getQueryManager(): QueryManager {
        return this.queryManager;
    }

    /**
     * Returns the command manager.
     * @returns {CommandManager} The command manager.
     */
    public getCommandManager(): CommandManager {
        return this.commandManager;
    }

    /**
     * Returns the player manager.
     * @returns {SessionManager} The player manager.
     */
    public getSessionManager(): SessionManager {
        return this.sessionManager;
    }

    /**
     * Returns the world manager.
     * @returns {WorldManager} The world manager.
     */
    public getChunkScheduler(): ChunkScheduler {
        return this.chunkScheduler;
    }

    /**
     * The per-world replicators: what turns something happening in a world into packets.
     * @returns {WorldReplicators} The registry, which builds one per world on first use.
     */
    public getWorldReplicators(): WorldReplicators {
        return this.worldReplicators;
    }

    public getWorldManager(): WorldManager {
        return this.worldManager;
    }

    /**
     * Returns the item manager.
     * @returns {ItemManager} The item manager.
     */
    public getItemManager(): ItemManager {
        return this.itemManager;
    }

    /**
     * Returns the block manager.
     * @returns {BlockManager} The block manager.
     */
    public getBlockManager(): BlockManager {
        return this.blockManager;
    }

    /**
     * Returns this server's creative menu.
     * @returns {CreativeInventory} The menu, built from this server's own registries.
     */
    public getCreativeInventory(): CreativeInventory {
        return this.creativeInventory;
    }

    /**
     * Every content registry built from the pack stack.
     *
     * @returns {ServerContent} The content.
     * @throws When read before {@link Server.enable} has built it.
     */
    public getContent(): ServerContent {
        if (!this.content) throw new Error('the content was read before the pack stack was built');
        return this.content;
    }

    /**
     * The world the content acts through, for the interaction path.
     *
     * @returns {ServerWorldHandle} The handle.
     * @throws When read before {@link Server.enable} has built it.
     */
    public getContentWorld(): ServerWorldHandle {
        if (!this.contentWorld) throw new Error('the content world was read before the pack stack was built');
        return this.contentWorld;
    }

    /**
     * The data-driven entities of one dimension.
     *
     * Asking builds the dimension's content adapter if nothing has yet, so a world that
     * loads after the content was built still gets a runtime.
     * @param {string} dimension - The namespaced dimension identifier.
     * @returns {LiveEntityRuntime} The runtime for that dimension.
     */
    public getEntityRuntime(dimension: string): LiveEntityRuntime {
        this.getContentWorld().at(dimension);
        const runtime = this.entityRuntimes.at(dimension);
        if (!runtime) throw new Error(`no entity runtime was built for ${dimension}`);
        return runtime;
    }

    /**
     * Replaces the content registries.
     *
     * For a test and for a plugin that composes its own stack. Hands over a whole build, not
     * a patch: a registry's numeric ids are positional, so a half-replaced content set would
     * leave the flattened tables indexed against a palette that no longer matches.
     * @param content - The build to run on from here.
     */
    public setContent(content: ServerContent): void {
        this.content = content;
        // The compiled functions came from the stack this build replaces, so
        // they go with it rather than outliving the pack that declared them.
        this.commandManager.setFunctionContent();
    }

    /**
     * Returns the logger.
     * @returns {LoggerBuilder} The logger.
     * @example
     * ```typescript
     * // Normal log:
     * server.getLogger().info('Hello, world!');
     * // Debug log:
     * server.getLogger().debug('Hello, world!');
     * // Error log:
     * server.getLogger().error(new Error('Hello World'));
     * ```
     */
    public getLogger(): Logger {
        return this.logger;
    }

    /**
     * Where anything that rolls for something gets its chance from.
     *
     * One source, reachable, rather than a `Math.random()` at each site: a drop table that is
     * handed its randomness can be rolled ten thousand times in a test and checked against the
     * odds it claims, and a plugin that wants a seeded server has somewhere to say so.
     * @returns {Random} the source of chance.
     */
    public getRandom(): Random {
        return this.random;
    }

    /**
     * Replaces the source of chance.
     * @param {Random} random - what to roll with from now on.
     */
    public setRandom(random: Random): void {
        this.random = random;
    }

    /**
     * Returns the packet registry.
     * @returns {PacketRegistry} The packet registry.
     */
    public getPacketRegistry(): PacketRegistry {
        return this.packetRegistry;
    }

    /**
     * Returns the raknet instance.
     * @returns {RakNetListener | undefined} The raknet instance.
     */
    public getRaknet(): RakNetListener | undefined {
        return this.raknet;
    }

    /**
     * Returns the chat manager.
     * @returns {ChatManager} The chat manager.
     */
    public getChatManager(): ChatManager {
        return this.chatManager;
    }

    /**
     * Returns the config.
     * @returns {Config} The config.
     * @example
     * ```typescript
     * console.log(server.getConfig().getMaxPlayers()); // 20
     * ```
     */
    /**
     * Every recipe the server knows.
     * @returns {RecipeManager} the manager.
     */
    public getRecipeManager(): RecipeManager {
        return this.recipeManager;
    }

    /**
     * Where a player can craft, and what each block does with a grid.
     * @returns {StationRegistry} the registry.
     */
    public getStationRegistry(): StationRegistry {
        return this.stationRegistry;
    }

    public getConfig(): Config {
        return this.config;
    }

    /**
     * Which packets the traffic log leaves out, from `log-excluded-packets`.
     *
     * Built once and kept: this is consulted for every packet in and out, and rebuilding the
     * set each time would put a config read on the hot path.
     * @returns {PacketLogFilter} the filter.
     */
    public getPacketLogFilter(): PacketLogFilter {
        this.packetLogFilter ??= new PacketLogFilter(this.config.getLogExcludedPackets());

        return this.packetLogFilter;
    }

    /**
     * Returns the console instance.
     * @returns {Console | undefined} The console instance.
     */
    public getConsole() {
        return this.console;
    }

    /**
     * Returns the permission manager.
     * @returns {PermissionManager} The permission manager.
     */
    public getPermissionManager(): PermissionManager {
        return this.permissionManager;
    }

    /**
     * Returns the ban manager.
     * @returns {BanManager} The ban manager.
     */
    public getBanManager(): BanManager {
        return this.banManager;
    }

    /**
     * Returns this Prismarine instance.
     * @returns {Server} The Prismarine instance.
     */
    public getServer(): Server {
        return this;
    }

    /**
     * Returns the current Tick.
     * @returns {number} The current Tick.
     */
    public getTick(): number {
        return Number(this.currentTick);
    }

    /**
     * Returns the current TPS.
     * @returns {number} The current TPS.
     */
    public getTPS(): number {
        return Number.parseFloat(this.tps.toFixed(2));
    }
}
