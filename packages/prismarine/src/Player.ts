import { Vector3 } from '@jsprismarine/math';
import { Gametype, getGametypeId } from '@jsprismarine/minecraft';
import type { InetAddress } from '@jsprismarine/raknet';
import type Server from './Server';
import { Chat, ChatType } from './chat/Chat';
import Human from './entity/Human';
import ChatEvent from './events/chat/ChatEvent';
import PlayerSetGamemodeEvent from './events/player/PlayerSetGamemodeEvent';
import PlayerToggleFlightEvent from './events/player/PlayerToggleFlightEvent';
import PlayerToggleSprintEvent from './events/player/PlayerToggleSprintEvent';
import type ClientConnection from './network/ClientConnection';
import { ChangeDimensionPacket } from './network/Packets';
import PlayerSession from './network/PlayerSession';
import type { ChunkCoord } from './network/packet/NetworkChunkPublisherUpdatePacket';
import MovementType from './network/type/MovementType';
import PlayStatusType from './network/type/PlayStatusType';
import TextType from './network/type/TextType';
import type Device from './utils/Device';
import Timer from './utils/Timer';
import type Skin from './utils/skin/Skin';
import type { World } from './world/';
import CoordinateUtils from './world/CoordinateUtils';
import type Chunk from './world/chunk/Chunk';

/**
 * Default spawn view distance used in vanilla
 */
export const VANILLA_DEFAULT_SPAWN_RADIUS = 4;

export default class Player extends Human {
    private readonly address: InetAddress;
    private readonly networkSession: PlayerSession;
    private permissions: string[];

    /**
     * Timer used for various metrics.
     */
    private timer: Timer;
    private connected = false;

    public xuid = '';
    public randomId = 0;

    public locale = '';
    public skin: Skin | null = null;

    public viewDistance = 0;
    public gamemode: Gametype = Gametype.WORLD_DEFAULT;

    private onGround = false;
    private flying = false;
    private sneaking = false;

    public platformChatId = ''; // TODO: read this value from Login
    public device: Device | null = null;

    public readonly chunkSendQueue = new Set<Chunk>();

    /**
     * Player's constructor.
     */
    public constructor({
        connection,
        world,
        server,
        uuid
    }: {
        connection: ClientConnection;
        world: World;
        server: Server;
        uuid?: string;
    }) {
        super({
            world,
            server,
            uuid
        });

        this.timer = new Timer();

        this.address = connection.getRakNetSession().getAddress();
        this.networkSession = new PlayerSession(server, connection, this);
        this.permissions = [];

        this.server.on('chat', this.chatHandler.bind(this));
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        const playerData = await this.getWorld().getPlayerData(this);

        this.permissions = await this.server.getPermissionManager().getPermissions(this);
        this.gamemode = getGametypeId(playerData.gamemode || this.server.getConfig().getGamemode());

        this.setPosition({
            position: playerData.position
                ? Vector3.fromObject(playerData.position)
                : await this.getWorld().getSpawnPosition(),
            pitch: playerData.position?.pitch || 0,
            yaw: playerData.position?.yaw || 0,
            headYaw: playerData.position?.headYaw || 0,
            type: MovementType.Reset
        });
        await this.sendPosition();

        await this.sendSettings();

        // Update position of all the players in the same world.
        await Promise.all(
            this.getWorld()
                .getPlayers()
                .map((target) => this.getNetworkSession().broadcastMove(target, MovementType.Reset))
        );

        // Finally mark the player as connected.
        this.server.getLogger().debug(`(Complete player creation took ${this.timer.stop()} ms)`);
        this.connected = true;
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {
        if (this.connected && this.xuid) await this.getWorld().savePlayerData(this);
        await this.getWorld().removeEntity(this);

        // De-spawn the player to all online players
        await this.getNetworkSession().removeFromPlayerList();
        for (const onlinePlayer of this.server.getSessionManager().getAllPlayers()) {
            await this.getNetworkSession().sendDespawn(onlinePlayer);
        }

        // Announce disconnection
        const event = new ChatEvent(
            new Chat({
                sender: this.server.getConsole()!,
                message: `§e%multiplayer.player.left`,
                parameters: [this.getName()],
                needsTranslation: true,
                type: ChatType.TRANSLATION
            })
        );
        await this.server.emit('chat', event);

        this.connected = false;
        this.server.removeListener('chat', this.chatHandler);
    }

    private async chatHandler(evt: ChatEvent) {
        if (evt.isCancelled()) return;

        // TODO: proper channel system
        if (
            evt.getChat().getChannel() === '*.everyone' ||
            (evt.getChat().getChannel() === '*.ops' && this.isOp()) ||
            evt.getChat().getChannel() === `*.player.${this.getName()}`
        )
            await this.sendMessage(
                evt.getChat().getMessage(),
                evt.getChat().getType() as number as TextType,
                evt.getChat().getParameters(),
                evt.getChat().isNeedsTranslation()
            );
    }

    /**
     * Used to match vanilla behavior, will send chunks
     * with an initial view radius of VANILLA_DEFAULT_SPAWN_RADIUS.
     */
    public async sendInitialSpawnChunks(): Promise<void> {
        const minX = CoordinateUtils.fromBlockToChunk(this.x) - VANILLA_DEFAULT_SPAWN_RADIUS;
        const minZ = CoordinateUtils.fromBlockToChunk(this.z) - VANILLA_DEFAULT_SPAWN_RADIUS;
        const maxX = CoordinateUtils.fromBlockToChunk(this.x) + VANILLA_DEFAULT_SPAWN_RADIUS;
        const maxZ = CoordinateUtils.fromBlockToChunk(this.z) + VANILLA_DEFAULT_SPAWN_RADIUS;

        const savedChunks: ChunkCoord[] = [];
        const sendQueue: Array<Promise<Chunk>> = [];
        for (let chunkX = minX; chunkX <= maxX; ++chunkX) {
            for (let chunkZ = minZ; chunkZ <= maxZ; ++chunkZ) {
                // TODO: vanilla does not send all of them, but in a range
                // for example it does send them from x => [-3; 3] and z => [-3; 2]
                savedChunks.push({ x: chunkX, z: chunkZ });
                sendQueue.push(this.getWorld().getChunk(chunkX, chunkZ));
            }
        }

        await this.networkSession.sendNetworkChunkPublisher(VANILLA_DEFAULT_SPAWN_RADIUS, savedChunks);

        const getUniqueChunks = (sendList: ChunkCoord[]) => {
            const xSet = new Set<number>();
            const zSet = new Set<number>();

            for (const coord of sendList) {
                xSet.add(coord.x);
                zSet.add(coord.z);
            }

            return Math.floor((xSet.size + zSet.size) / 2);
        };

        for (let i = 0; i < getUniqueChunks(savedChunks); ++i) {
            await this.networkSession.sendNetworkChunkPublisher(VANILLA_DEFAULT_SPAWN_RADIUS, []);
        }

        for await (const chunk of sendQueue) {
            await this.networkSession.sendChunk(chunk);
        }
    }

    /**
     * Change the player's current world.
     * @param {World} world - the new world
     */
    public async setWorld(world: World) {
        const dim0 = new ChangeDimensionPacket();
        dim0.dimension = 0;
        dim0.position = this.getPosition();
        dim0.respawn = false;

        const dim1 = new ChangeDimensionPacket();
        dim1.dimension = 1;
        dim1.position = this.getPosition();
        dim1.respawn = false;

        await this.sendDespawn();
        await this.getWorld().removeEntity(this);

        await super.setWorld(world);
        await world.addEntity(this);

        await this.networkSession.send(dim0);
        await this.networkSession.sendPlayStatus(PlayStatusType.PlayerSpawn);
        await this.networkSession.send(dim1);
        await this.networkSession.sendPlayStatus(PlayStatusType.PlayerSpawn);

        await this.sendInitialSpawnChunks();

        await this.networkSession.send(dim1);
        await this.networkSession.sendPlayStatus(PlayStatusType.PlayerSpawn);
        await this.networkSession.send(dim0);
        await this.networkSession.sendPlayStatus(PlayStatusType.PlayerSpawn);

        await this.networkSession.clearChunks();
        await this.networkSession.needNewChunks();
        await this.networkSession.sendPlayStatus(PlayStatusType.PlayerSpawn);
    }

    public isOnline() {
        return this.connected;
    }

    public async update(tick: number): Promise<void> {
        await super.update(tick);
        await this.networkSession.update(tick);

        // TODO: get documentation about timings from vanilla
        // 1 second / 20 = 1 tick, 20 * 5 = 1 second
        // 1 second * 60 = 1 minute
        if (tick % (20 * 5 * 60 * 1) === 0) {
            await this.networkSession.sendTime(tick);
        }

        for (const chunk of this.chunkSendQueue) {
            await this.networkSession.sendNetworkChunkPublisher(this.viewDistance || VANILLA_DEFAULT_SPAWN_RADIUS, []);
            await this.networkSession.sendChunk(chunk);
            this.chunkSendQueue.delete(chunk);
        }
    }

    public async kick(reason = 'unknown reason'): Promise<void> {
        await this.disable();
        await this.networkSession.kick(reason);
        this.server.getLogger().verbose(`Player with id §b${this.getRuntimeId()}§r was kicked: ${reason}`);
    }

    public async sendSettings(): Promise<void> {
        await this.getNetworkSession().sendGamemode();

        await Promise.all(
            this.server
                .getSessionManager()
                .getAllPlayers()
                .map(async (target) => {
                    await target.getNetworkSession().sendAbilities(this);
                    await target.getNetworkSession().sendSettings(this);
                })
        );
    }

    /**
     * Player spawning logic.
     */
    public async sendSpawn() {
        await this.sendPosition();
        await this.setGamemode();
        await this.getNetworkSession().sendInventory();
        await this.sendSettings();
    }
    public async sendDespawn() {}

    /**
     * Send a chat message to the client.
     * @param message - the message
     */
    public async sendMessage(
        message: string,
        type: TextType = TextType.Raw,
        parameters: string[] = [],
        needsTranslation = false
    ): Promise<void> {
        // TODO: Do this properly like java edition,
        // in other words, the message should be JSON formatted.
        await this.networkSession.sendMessage({
            message,
            parameters,
            needsTranslation,
            type
        });
    }

    public async setGamemode(mode?: Gametype): Promise<void> {
        mode ??= this.gamemode;

        const event = new PlayerSetGamemodeEvent(this, mode);
        this.server.post(['playerSetGamemode', event]);
        if (event.isCancelled()) return;

        this.gamemode = event.getGamemode();
        await this.networkSession.sendGamemode();

        if (this.gamemode === Gametype.CREATIVE || this.gamemode === Gametype.SPECTATOR) {
            this.metadata.setCanFly(true);
        } else {
            this.metadata.setCanFly(false);
            await this.setFlying(false);
        }

        await this.sendSettings();
        await this.networkSession.sendGamemode();
        await this.networkSession.sendMetadata();
    }

    public getNetworkSession(): PlayerSession {
        return this.networkSession;
    }

    public getAddress() {
        return this.address;
    }

    public getName(): string {
        return this.metadata.nameTag;
    }

    public getFormattedUsername(): string {
        return `<${this.getName()}>`;
    }

    public getPermissions(): string[] {
        return this.permissions;
    }

    public getXUID(): string {
        return this.xuid || '';
    }

    public isPlayer(): boolean {
        return true;
    }

    /**
     * Check if the `Player` is an operator.
     *
     * @returns `true` if this player is an operator otherwise `false`.
     */
    public isOp(): boolean {
        return this.server.getPermissionManager().isOp(this.getName());
    }

    public async setSprinting(sprinting: boolean) {
        if (sprinting === this.metadata.sprinting) return;

        const event = new PlayerToggleSprintEvent(this, sprinting);
        this.server.post(['playerToggleSprint', event]);
        if (event.isCancelled()) return;

        this.metadata.setSprinting(event.getIsSprinting());
        await this.networkSession.sendMetadata();
    }

    public isFlying() {
        return this.flying;
    }
    public async setFlying(flying: boolean) {
        if (flying === this.isFlying()) return;

        if (!this.metadata.canFly) {
            this.flying = false;
            await this.sendSettings();
            return;
        }

        const event = new PlayerToggleFlightEvent(this, flying);
        this.server.post(['playerToggleFlight', event]);
        if (event.isCancelled()) return;

        this.flying = event.getIsFlying();
        await this.sendSettings();
    }

    public isSneaking() {
        return this.sneaking;
    }
    public async setSneaking(val: boolean) {
        if (val === this.sneaking) return;
        this.sneaking = val;
    }

    public isOnGround() {
        return this.onGround;
    }
    public async setOnGround(val: boolean) {
        if (val === this.onGround) return;
        this.onGround = val;
    }

    /**
     * Set the position.
     * @param {object} options - The options to set the position.
     * @param {Vector3} options.position - The new position.
     * @param {MovementType} [options.type=MovementType.Normal] - The movement type.
     * @param {number} [options.pitch=this.pitch] - The new pitch.
     * @param {number} [options.yaw=this.yaw] - The new yaw.
     * @param {number} [options.headYaw=this.headYaw] - The new head yaw.
     * @param {boolean} [broadcast=true] - Whether to broadcast the position change.
     * @remarks This will notify the player's client about the position change.
     */
    public async setPosition(
        {
            position,
            type = MovementType.Normal,
            pitch = this.pitch,
            yaw = this.yaw,
            headYaw = this.headYaw
        }: {
            position: Vector3;
            type?: MovementType;
            pitch?: number;
            yaw?: number;
            headYaw?: number;
        },
        broadcast = true
    ) {
        await super.setPosition({ position });
        this.pitch = pitch;
        this.yaw = yaw;
        this.headYaw = headYaw;

        if (!broadcast) return;
        await this.networkSession.broadcastMove(this, type);
    }
    /**
     * Send the position to all the players in the same world.
     * @returns {Promise<void>} A promise that resolves when the position is sent.
     */
    public async sendPosition(): Promise<void> {
        await super.sendPosition();
    }
}
