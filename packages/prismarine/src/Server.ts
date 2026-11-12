import { randomInt as cryptoRandomInt } from 'node:crypto';

import { Kernel } from '@jsprismarine/kernel';
import { DisconnectReason } from '@jsprismarine/minecraft';
import type { RakNetListenerLike } from '@jsprismarine/raknet';
import Console from './Console';
import { ConsoleSender } from './command/ConsoleSender';
import SessionManager from './SessionManager';
import { ShutdownLifecycle } from './ShutdownLifecycle';
import type BanManager from './ban/BanManager';
import type { Random } from './utils/Random';
import { seededRandom } from '@jsprismarine/predicates';
import type { SeededRandomState, StatefulRandomSource } from '@jsprismarine/predicates';
import type { LootSequencesState } from '@jsprismarine/loot';
import type { ChatManager } from './chat/ChatManager';
import { lootBuildReport, lootSummary, lootWarning } from './content/lootReport';
import { buildServerContent } from './content/ServerContent';
import type { ServerContent } from './content/ServerContent';
import { readContentSettings } from './content/settings';
import { serverWorldSource } from './content/world/serverSource';
import { EntityRuntimes } from './entity/data/live';
import type { LiveEntityRuntime } from './entity/data/live';
import type { StorePlayers } from './entity/data/storePlayers';
import type { ServerWorldHandle } from './content/world/serverSource';
import { CommandManager } from './command/CommandManager';
import { EventEmitter } from './events/EventEmitter';
import { CreativeInventory } from './inventory/CreativeInventory';
import { describeSupportedProtocols } from './network/codec/describeCodecs';
import { joinContentPayloads } from './network/contentPayloads';
import { WorldReplicators } from './network/NetworkWorldReplicator';
import { PacketLogFilter } from './network/PacketLogFilter';
import PacketHandlerRegistry from './network/PacketHandlerRegistry';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import { broadcastSharedBatches } from './network/MinecraftSession';
import type { PermissionManager } from './permission/PermissionManager';
import { bansModule } from './modules/bans';
import { commandsModule, loadFunctionsModule } from './modules/commands';
import { contentModule } from './modules/content';
import { packetHandlersModule } from './modules/packetHandlers';
import { networkModule, ServerNetworking } from './modules/network';
import type { InboundPacketRecorder } from './network/InboundPacketTrace';
import type { OutboundPacketRecorder } from './network/OutboundPacketTrace';
import type { Transport } from './network/transport/Transport';
import { permissionsModule } from './modules/permissions';
import { socialModule } from './modules/social';
import { worldsModule } from './modules/worlds';
import { ServerTicker, tickerModule } from './modules/ticker';
import type { TickRecorder } from './profiling/TickRecorder';
import type { TickControl } from './modules/ticker';
import { bansToken, chatToken, permissionsToken } from './modules/tokens';
import Timer from './utils/Timer';
import { worldSeedOf } from './utils/Seed';
import { attachProfiler, ServerProfiler } from './profiling/ServerProfiler';
import { finishStartupPhase, startStartupPhase } from './profiling/startupPhase';
import ChunkScheduler from './world/ChunkScheduler';
import { RespawnRequests } from './world/RespawnRequests';
import { ChunkCompletionQueue } from './world/ChunkCompletionQueue';
import { GenerationGovernorDriver } from './world/GenerationGovernorDriver';
import { DimensionTravel } from './world/portal/DimensionTravel';
import WorldManager from './world/WorldManager';
import type { RandomSequencesState } from './command/host/randomSequences';

import type { Config } from './config/Config';
import type { RemoteConsole } from './console/RemoteConsole';

import type { Logger } from '@jsprismarine/logger';
import { serverVersion, softwareLabel } from './version';

/** The active random streams held by a server at one replay boundary. */
export interface ServerReplayRandomState {
    /** Version of this aggregate state shape. */
    readonly version: 1;
    /** General server chance source used by weather, loot fallbacks, and command selection. */
    readonly server: SeededRandomState;
    /** Per-dimension streams supplied to data-driven content behaviors. */
    readonly contentWorlds: readonly (readonly [dimension: string, state: SeededRandomState])[];
    /** Named and unkeyed Java loot-table streams. */
    readonly javaLoot: LootSequencesState;
    /** Named and unkeyed Bedrock equipment-loot streams. */
    readonly bedrockLoot: LootSequencesState;
    /** `/random` command sequence streams. */
    readonly commandSequences: RandomSequencesState;
}

/**
 * JSPrismarine's main server class.
 * @public
 */
export default class Server extends EventEmitter {
    /**
     * The network front door, run by the `prismarine:network` module.
     * Constructed here so the listener is reachable (and still undefined)
     * before the kernel starts; {@link Server.bootstrap} starts it and
     * {@link Server.shutdown} kills it, since the bind address and port only
     * arrive with `bootstrap(ip, port)`.
     */
    private readonly networking: ServerNetworking;
    private readonly logger: Logger;
    private readonly config: Config;
    private readonly profiler: ServerProfiler | undefined;
    private packetLogFilter: PacketLogFilter | null = null;
    private readonly console: Console | undefined;
    private remoteConsole: RemoteConsole | undefined;
    private readonly consoleSender: ConsoleSender;
    private readonly packetHandlerRegistry: PacketHandlerRegistry;
    private readonly sessionManager = new SessionManager();
    private readonly commandManager: CommandManager;
    private readonly worldManager: WorldManager;

    /**
     * The module kernel the managers run on, built once in the constructor.
     * {@link Server.enable} starts it between the config and the console, and
     * {@link Server.disable} stops it, so every manager starts in dependency
     * order and stops in reverse. A kernel restarts cleanly, so the same
     * instance, and the managers its modules hold, carries through
     * {@link Server.reload}'s disable-then-enable cycle.
     */
    private readonly kernel: Kernel;

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
    /** Budgets background chunk promotion and lighting independently from network sends. */
    private readonly chunkCompletionQueue: ChunkCompletionQueue;
    /** Respawn searches deaths filed, whose answers the next input step applies. */
    private readonly respawnRequests = new RespawnRequests((error) => this.logger.error(error));
    /**
     * The network's view of each world: who is watching it, and what they are told.
     *
     * Held here rather than on the `World` itself, which knows the players in it and nothing
     * about their connections - see {@link WorldChangeSink}.
     */
    private readonly worldReplicators = new WorldReplicators(this);
    /** Portal and End travel for every level: what a portal contact resolves and transfers through. */
    private readonly dimensionTravel = new DimensionTravel(this);

    /**
     * This server's creative menu.
     *
     * Owned here rather than kept in a static, so two servers in one process each serve
     * their own content build. Built on the first read, after content is available.
     */
    private readonly creativeInventory = new CreativeInventory(() => this.getContent());

    /**
     * The source of chance for anything that rolls - see {@link Server.getRandom}.
     *
     * The default keeps a seeded Mulberry32 stream so its continuation can be captured. A plugin
     * callback keeps the existing draw contract, but replay capture rejects it unless restored
     * from a recorded built-in state.
     */
    private randomSource: StatefulRandomSource = seededRandom(cryptoRandomInt(0, 0x1_0000_0000));
    private randomStateAvailable = true;
    private random: Random = () => this.randomSource.nextFloat();

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
     * The stopping flag, the interrupt holds, and the force exit a repeated
     * shutdown request means — see {@link ShutdownLifecycle}. The ordered
     * teardown itself stays in {@link Server.shutdown}.
     * @internal
     */
    private readonly lifecycle = new ShutdownLifecycle();

    /**
     * The tick loop, run by the `prismarine:ticker` module. Constructed here so
     * its counters ({@link Server.getTick}, {@link Server.getTPS},
     * {@link Server.getTickMs}) read before the kernel starts.
     * @internal
     */
    private readonly ticker: ServerTicker;
    /** Limits background generation when ticks run late; only present when generation runs in its own process. */
    private generationGovernor: GenerationGovernorDriver | undefined;

    /**
     * If the server is headless.
     * @internal
     */
    private readonly headless: boolean;

    /**
     * Creates a new server instance.
     * @param {object} options - The options.
     * @param {LoggerBuilder} options.logger - The logger.
     * @param {Config} options.config - The config.
     * @param {boolean} [options.profile] - Record server phase and event-loop timings.
     * @param {InboundPacketRecorder} [options.inboundPacketRecorder] - Opt-in sink for accepted inbound packet bytes,
     *   which may include login identity data.
     * @param {OutboundPacketRecorder} [options.outboundPacketRecorder] - Opt-in sink for encoded clientbound packets.
     * @param [options.transport] - A transport to listen on instead of the ones the config
     *   enables, such as an in-process loopback a replay harness drives. `bootstrap` then binds no
     *   socket. Its connections draw their IDs from a `ConnectionIds` of its own.
     * @param [options.chunkAdmissionBudget] - The most chunk completions one input step admits,
     *   `CHUNK_ADMISSION_BUDGET_PER_TICK` by default. A replay harness changes it to show that a
     *   recorded trace, not the budget, decides what a replay admits.
     * @param options.onStopCommandComplete - Called after a successful `/stop` dispatch sends
     *   its feedback.
     * @returns {Server} The server instance.
     */
    public constructor({
        logger,
        config,
        headless = false,
        profile = false,
        inboundPacketRecorder,
        outboundPacketRecorder,
        transport,
        chunkAdmissionBudget,
        onStopCommandComplete
    }: {
        logger: Logger;
        config: Config;
        headless?: boolean;
        profile?: boolean;
        inboundPacketRecorder?: InboundPacketRecorder;
        outboundPacketRecorder?: OutboundPacketRecorder;
        transport?: Transport;
        chunkAdmissionBudget?: number;
        onStopCommandComplete?: () => void;
    }) {
        super();

        this.chunkCompletionQueue = new ChunkCompletionQueue(undefined, {
            tick: () => this.getTick(),
            ...(chunkAdmissionBudget === undefined ? {} : { budget: chunkAdmissionBudget })
        });

        this.headless = headless;
        this.networking = new ServerNetworking(this, inboundPacketRecorder, outboundPacketRecorder, transport);

        const protocols = describeSupportedProtocols();
        logger.info(
            `Starting ${softwareLabel(true)} for Minecraft: Bedrock Edition on ${protocols.length} protocol version${protocols.length === 1 ? '' : 's'}:`
        );
        for (const protocol of protocols) logger.info(`  ${protocol}`);

        this.logger = logger;
        this.config = config;
        this.chunkScheduler.setDepth(Math.max(1, config.getChunkWorkers()) * 2);
        this.profiler = profile ? new ServerProfiler() : undefined;
        if (this.profiler) {
            attachProfiler(this, this.profiler);
            attachProfiler(this.chunkCompletionQueue, this.profiler);
        }
        this.packetHandlerRegistry = new PacketHandlerRegistry(this);
        this.worldManager = new WorldManager(this);
        this.consoleSender = new ConsoleSender(this);
        if (!this.headless) this.console = new Console(this);
        this.commandManager = new CommandManager(this, onStopCommandComplete);
        this.ticker = new ServerTicker({
            emitTick: (event) => this.emit('tick', event),
            // Packets first, then the chunks that became ready since the last step, so every world
            // sees them from its first update. A chunk an input-lane handler waits for enters at
            // once, because the step cannot finish without it. Portal trips come after the chunks, so
            // a trip whose arrival chunks this step admitted lands in it.
            admitInputs: async () =>
                (await this.networking.admitInputs()) +
                (await this.chunkCompletionQueue.admissions.admit(this.getTick())) +
                (await this.respawnRequests.admit()) +
                (await this.dimensionTravel.admit()),
            pollNetwork: () => this.networking.pollInbound(),
            // The levels, not the worlds: a level advances its clock once and ticks each of its worlds.
            getWorlds: () => this.worldManager.getLevels(),
            tickFunctions: () => this.commandManager.tickFunctions(),
            getChunkScheduler: () => this.chunkScheduler,
            getChunkCompletionQueue: () => this.chunkCompletionQueue,
            getChunkSendBudgetMs: () => this.config.getChunkSendBudgetMs(),
            isTickingEnabled: () => this.config.getEnableTicking(),
            isProcessTitleEnabled: () => this.config.getEnableProcessTitle(),
            isHeadless: () => this.headless,
            isStopping: () => this.lifecycle.isStopping(),
            getProfileOwner: () => this,
            getLogger: () => this.logger
        });
        if (config.getChunkHost() === 'process' && config.getChunkWorkers() > 0) {
            this.generationGovernor = new GenerationGovernorDriver({
                recorder: this.ticker.recorder,
                workers: config.getChunkWorkers(),
                // Pools start on first use, and the default world may not exist yet.
                control: () => {
                    try {
                        return this.worldManager.getDefaultWorld()?.getGenerator().generationControl?.();
                    } catch {
                        return undefined;
                    }
                }
            });
            this.generationGovernor.start();
        }
        this.kernel = this.buildKernel();
    }

    /**
     * Builds the kernel and registers every manager module on it.
     *
     * The kernel starts providers before their dependents and keeps
     * registration order among modules with no dependency edge between them.
     * One place relies on that order rather than on an edge: the commands start
     * before the worlds, because the console takes commands while the start
     * region is still generating, and neither module uses the other.
     * @internal
     */
    private buildKernel(): Kernel {
        const kernel = new Kernel({ logger: this.logger });
        kernel.register(
            contentModule(this, {
                build: () => {
                    const startedAt = startStartupPhase();
                    this.enableContent();
                    finishStartupPhase('content-build', startedAt);
                    // Built before a player arrives, so the report of what the content
                    // build invented reads as a startup line and a build that cannot
                    // produce payloads says so here rather than on the first join.
                    joinContentPayloads(this.content, this.logger);
                },
                close: () => this.entityRuntimes.closeAll()
            })
        );
        kernel.register(packetHandlersModule(this.packetHandlerRegistry));
        kernel.register(permissionsModule(this));
        kernel.register(bansModule(this));
        kernel.register(socialModule(this));
        kernel.register(tickerModule(this.ticker));
        kernel.register(networkModule(this.networking));
        kernel.register(commandsModule(this.commandManager));
        kernel.register(worldsModule(this.worldManager, this.chunkScheduler));
        kernel.register(loadFunctionsModule(this.commandManager));
        return kernel;
    }

    /**
     * Enables the server.
     * @returns {Promise<void>} A promise that resolves when the server is enabled.
     * @internal
     */
    private async enable(): Promise<void> {
        await this.config.enable();
        // Output needs only stdout, so attach it before anything logs.
        this.logger.setConsole(this.console);
        await this.logger.enable();
        // Everything between the config and the console is a kernel module; see `buildKernel`.
        try {
            await this.kernel.start();
        } catch (error: unknown) {
            // A shutdown during startup stops the kernel under it, which cancels the world
            // preload. That is the shutdown working, not a failed start.
            if (this.lifecycle.isStopping()) return;
            throw error;
        }

        // The console reads commands as soon as it is enabled, and piped input is already
        // waiting, so it comes last: commands need the registry and the default world.
        await this.console?.enable();
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
            // By dimension rather than by name: the content packages address a world as
            // `minecraft:overworld`, and the default level has one world per dimension. A
            // dimension still lazy answers undefined, as one nobody has entered holds nothing.
            worldFor: (dimension) => this.worldManager.getWorldByDimension(dimension),
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

        // The build compiles both loot registries whole, so what a table could
        // not be read for is known now rather than at the first chest.
        const loot = lootBuildReport(this.content);
        this.logger.info(lootSummary(loot));
        const unapplied = lootWarning(loot);
        if (unapplied !== undefined) this.logger.warn(unapplied);

        if (errors > 0) this.logger.warn(`The pack stack reported §c${errors}§r error(s); see the content report`);

        // A pack that is not on disk costs the server its content without stopping it, so say so
        // rather than let it run with no mobs, a `/summon` that refuses every type and an End
        // without a dragon.
        for (const diagnostic of this.content.diagnostics) {
            if (diagnostic.code === 'pack.missing') this.logger.warn(diagnostic.message);
        }
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
        return worldSeedOf(this.config.getWorlds()[this.config.getLevelName()]?.seed);
    }

    /**
     * Disables the server.
     * @returns {Promise<void>} A promise that resolves when the server is disabled.
     * @internal
     */
    private async disable(): Promise<void> {
        // The modules stop in reverse start order: the worlds drain their chunk deliveries
        // and close, and the content's entity runtimes close after them, because a closing
        // world saves through its dimension's runtime.
        await this.kernel.stop();
        await this.config.disable();
        await this.logger.disable();
    }

    public getMetadata() {
        const serverName = this.networking.getServerName();
        if (!serverName) throw new Error('Server is not started');
        return serverName;
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
     * @throws {Error} When an enabled transport cannot listen; the message names it, its port and the cause.
     */
    public async bootstrap(serverIp?: string, port?: number): Promise<void> {
        await this.remoteConsole?.enable();
        // The world does not tick before every transport listens, as it did not when the
        // listeners bound without being waited for.
        this.ticker.hold();
        await this.enable();
        // Shut down while it was starting: there is nothing to listen for.
        if (this.lifecycle.isStopping()) return;

        const bindAddress = serverIp ?? this.config.getServerIp();
        const bindPort = port ?? this.config.getServerPort();

        await this.networking.start(bindAddress, bindPort);
        this.ticker.release();

        this.logger.info(`JSPrismarine is now listening on port §b${bindPort}`);
        this.remoteConsole?.markRunning();
    }

    /**
     * Attaches the remote console a host process talks to. Call it before {@link bootstrap}:
     * the server enables it as it starts, reports `running` once it listens, reports
     * `stopping` as {@link shutdown} begins, and disables it last, so the final messages
     * leave the channel before the process exits.
     */
    public attachRemoteConsole(remote: RemoteConsole): void {
        this.remoteConsole = remote;
    }

    /**
     * Registers something to undo the moment a shutdown begins.
     *
     * For what the callers give up and why, see {@link ShutdownLifecycle.releaseOnShutdown}.
     * A release runs once, synchronously, before the shutdown awaits anything - which is the
     * whole point, as the teardown below may not get another turn of the event loop for
     * seconds.
     * @param release - Gives up whatever is keeping the kernel from killing this process.
     */
    public releaseOnShutdown(release: () => void): void {
        this.lifecycle.releaseOnShutdown(release);
    }

    /**
     * Kills the server asynchronously.
     *
     * Asking twice forces the exit rather than returning - see {@link ShutdownLifecycle.forceExit}.
     * @param {object} [options] - The options.
     * @param {boolean} [options.crash] - If the server should crash.
     * @param {boolean} [options.stayAlive] - If we should let the process stay alive.
     * @returns {Promise<void>} A promise that resolves when the server is killed.
     */
    public async shutdown(options?: { crash?: boolean; stayAlive?: boolean }): Promise<void> {
        if (!this.lifecycle.beginShutdown()) return this.lifecycle.forceExit(options);

        this.remoteConsole?.markStopping();
        // Before the first await, so the escape is armed even if everything below has to wait
        // for an event loop that is busy generating terrain.
        this.lifecycle.releaseHolds();

        this.logger.info(
            options?.stayAlive ? 'Stopping server' : 'Stopping server, interrupt again to exit immediately',
            'Server/kill'
        );
        await this.console?.disable();

        // Before any teardown awaits: a tick still in flight sees `stopping` and
        // stops rescheduling, and the pending timer dies here rather than firing
        // into a server mid-teardown. The kernel stops the ticker module again
        // inside `disable()`, which is a no-op by then.
        this.ticker.stop();
        this.generationGovernor?.close();

        try {
            // No tick will apply what is still held for the input step, so apply it here: a player
            // whose connection closed during the last tick is torn down and saved like the rest,
            // rather than left in its world with nobody to remove it.
            await this.networking.admitInputs(Number.POSITIVE_INFINITY);

            // Kick all online players. `kickAllPlayers` would send the `KICKED` code, and a
            // client told the server shut down shows that code instead.
            await Promise.all(
                this.sessionManager
                    .getSessions()
                    .map((session) => session.kick('Server closed.', DisconnectReason.SHUTDOWN))
            );

            // Disable all managers.
            await this.disable();

            try {
                const profileFile = await this.profiler?.save();
                if (profileFile) process.stderr.write(`JSPrismarine trace saved to ${profileFile}\n`);
            } catch (error: unknown) {
                process.stderr.write(
                    `JSPrismarine trace could not be saved: ${error instanceof Error ? error.message : String(error)}\n`
                );
            }

            // The listener might not have started if we kill the server really early.
            this.networking.kill();

            // Finally, remove all listeners.
            this.removeAllListeners();

            // Last, after the logger has closed: `process.exit` discards IPC writes still
            // queued, and this waits for them.
            await this.remoteConsole?.disable();

            // Logger is no longer available.
            console.debug('Server stopped, Goodbye!\n');

            if (!options?.stayAlive) process.exit(options?.crash ? 1 : 0);
        } catch (error: unknown) {
            console.error(error);
            await this.remoteConsole?.disable();
            if (!options?.stayAlive) process.exit(1);
        }
    }

    /**
     * Sends a packet to every player on the server, in every world.
     *
     * The genuinely global channel: the player list, the command tree, a shutdown notice -
     * things that are about the server rather than about a place in it. Anything that happens
     * somewhere belongs on `World.broadcastAround`, which only reaches the players near it.
     * @param dataPacket - The packet to send.
     */
    public async broadcastPacket<T extends NetworkPacket<unknown>>(dataPacket: T): Promise<void> {
        const audience = this.sessionManager.getSessions();
        if (audience.length === 0) return;

        // Compressed once per protocol codec rather than once per player: within a codec the
        // bytes are identical, across codecs a changed packet layout is not.
        broadcastSharedBatches(
            audience.map((session) => session.getConnection()),
            dataPacket,
            this.config.getPacketCompressionLevel(),
            (error) => this.logger.error(error)
        );
    }

    /**
     * Returns the server version, the one the startup log prints.
     * @returns {string} The server version, without a leading `v`.
     * @example
     * ```typescript
     * console.log(server.getVersion());
     * ```
     */
    public getVersion(): string {
        return serverVersion();
    }

    /**
     * The module kernel the server runs on: the supported way to resolve the
     * services the manager modules provide. Resolve a service with a token from
     * `modules/tokens`, e.g. `server.getKernel().get(bansToken)`.
     * @returns {Kernel} The kernel.
     */
    public getKernel(): Kernel {
        return this.kernel;
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

    /** The bounded queue for worker-result translation and background chunk lighting. */
    public getChunkCompletionQueue(): ChunkCompletionQueue {
        return this.chunkCompletionQueue;
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
     * The portal travel service: where a trip through a portal lands and how an entity moves there.
     * @returns {DimensionTravel} The one instance shared by every world.
     */
    public getDimensionTravel(): DimensionTravel {
        return this.dimensionTravel;
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
     * Whether {@link Server.getEntityRuntime} can answer, which it can once the pack stack is
     * built: it builds a dimension's runtime on first ask.
     * @returns {boolean} Whether the content world exists.
     */
    public hasEntityRuntime(): boolean {
        return this.contentWorld !== undefined;
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
     * The server's store players, by entity id, which every dimension's entity runtime shows and
     * runs. A player is filed when its entity first enters a store and forgotten when it leaves the
     * server.
     * @returns {StorePlayers} The store players.
     */
    public getStorePlayers(): StorePlayers {
        return this.entityRuntimes.players;
    }

    /**
     * Invalidates cached block reads held by the dimension's entity runtime.
     * @param dimension - The namespaced dimension identifier.
     * @param chunkX - The changed chunk's x coordinate; omit both coordinates to clear all chunks.
     * @param chunkZ - The changed chunk's z coordinate.
     * @internal
     */
    public invalidateEntityBlockCaches(dimension: string, chunkX?: number, chunkZ?: number): void {
        this.entityRuntimes.at(dimension)?.runtime.invalidateBlockCaches(chunkX, chunkZ);
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

    /** Captures every stateful random stream the server keeps between ticks. */
    public getReplayRandomState(): ServerReplayRandomState {
        if (!this.randomStateAvailable) {
            throw new Error('The configured server random callback has no serializable state');
        }
        const content = this.getContent();
        const world = this.getContentWorld();
        return {
            version: 1,
            server: this.randomSource.saveState(),
            contentWorlds: world.saveRandomStates(),
            javaLoot: content.loot.saveRandomState(),
            bedrockLoot: content.equipmentLoot.saveRandomState(),
            commandSequences: this.commandManager.saveRandomSequenceState()
        };
    }

    /** Restores the saved random streams without changing any draw sites or their order. */
    public restoreReplayRandomState(state: unknown): void {
        if (
            typeof state !== 'object' ||
            state === null ||
            !('version' in state) ||
            !('server' in state) ||
            !('contentWorlds' in state) ||
            !('javaLoot' in state) ||
            !('bedrockLoot' in state) ||
            !('commandSequences' in state) ||
            state.version !== 1
        ) {
            throw new TypeError('Invalid server replay random state');
        }

        const content = this.getContent();
        const world = this.getContentWorld();
        const serverRandom = seededRandom(0);
        serverRandom.restoreState(state.server);
        content.loot.restoreRandomState(state.javaLoot);
        content.equipmentLoot.restoreRandomState(state.bedrockLoot);
        this.commandManager.restoreRandomSequenceState(state.commandSequences);
        world.restoreRandomStates(state.contentWorlds);
        this.randomSource = serverRandom;
        this.randomStateAvailable = true;
        this.random = () => this.randomSource.nextFloat();
    }

    /**
     * Replaces the source of chance.
     * @param {Random} random - what to roll with from now on.
     */
    public setRandom(random: Random): void {
        this.random = random;
        this.randomStateAvailable = false;
    }

    /**
     * Returns the packet registry.
     * @returns {PacketHandlerRegistry} The packet registry.
     */
    public getPacketHandlerRegistry(): PacketHandlerRegistry {
        return this.packetHandlerRegistry;
    }

    /**
     * Returns the raknet instance.
     * @returns {RakNetListener | undefined} The raknet instance.
     */
    public getRaknet(): RakNetListenerLike | undefined {
        return this.networking.getListener();
    }

    /**
     * The respawn searches deaths filed, whose answers the next input step applies.
     * @returns {RespawnRequests} The requests.
     */
    public getRespawnRequests(): RespawnRequests {
        return this.respawnRequests;
    }

    /**
     * Returns the chat manager.
     * @returns {ChatManager} The chat manager.
     * @deprecated Resolve it through the kernel instead: `server.getKernel().get(chatToken)`,
     * with `chatToken` from `@jsprismarine/prismarine/modules/tokens`.
     */
    public getChatManager(): ChatManager {
        return this.kernel.get(chatToken);
    }

    /**
     * Returns the config.
     * @returns {Config} The config.
     * @example
     * ```typescript
     * console.log(server.getConfig().getMaxPlayers()); // 20
     * ```
     */
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
     * Returns the sender the server speaks as in chat and command feedback.
     *
     * Unlike {@link getConsole}, this is present on a headless server too.
     */
    public getConsoleSender(): ConsoleSender {
        return this.consoleSender;
    }

    /**
     * Returns the permission manager.
     * @returns {PermissionManager} The permission manager.
     * @deprecated Resolve it through the kernel instead: `server.getKernel().get(permissionsToken)`,
     * with `permissionsToken` from `@jsprismarine/prismarine/modules/tokens`.
     */
    public getPermissionManager(): PermissionManager {
        return this.kernel.get(permissionsToken);
    }

    /**
     * Returns the ban manager.
     * @returns {BanManager} The ban manager.
     * @deprecated Resolve it through the kernel instead: `server.getKernel().get(bansToken)`,
     * with `bansToken` from `@jsprismarine/prismarine/modules/tokens`.
     */
    public getBanManager(): BanManager {
        return this.kernel.get(bansToken);
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
        return this.ticker.getTick();
    }

    /**
     * Returns the current TPS.
     * @returns {number} The current TPS.
     */
    public getTPS(): number {
        return this.ticker.getTPS();
    }

    /**
     * Returns how long a tick's work has been taking, in milliseconds, as a moving average
     * over the most recent ticks. It leaves out the sleep between ticks, so a healthy server
     * reads well under the 50 ms period. Zero until the first tick completes.
     */
    public getTickMs(): number {
        return this.ticker.getTickMs();
    }

    /** The background generation limit the governor currently asks for, when it is running. */
    public getGenerationLimit(): number | undefined {
        return this.generationGovernor?.active;
    }

    /** The recent ticks' duration, lateness and phases. */
    public getTickRecorder(): TickRecorder {
        return this.ticker.recorder;
    }

    /**
     * Runs one tick now, for a harness that drives a server started with ticking disabled.
     *
     * Each call is exactly one tick and resolves when its work has settled, so a replay takes
     * the same steps on any host. See {@link ServerTicker.advance}.
     * @throws {Error} When the tick loop is running.
     */
    public advanceTick(): Promise<void> {
        return this.ticker.advance();
    }

    /** The handle `/tick` uses to change the tick rate, freeze the world, step it and sprint. */
    public getTickControl(): TickControl {
        return this.ticker;
    }
}
