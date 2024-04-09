import { FlagType, MetadataFlag } from './entity/Metadata';
import ChatEvent from './events/chat/ChatEvent';
import type Chunk from './world/chunk/Chunk';
import type ClientConnection from './network/ClientConnection';
import ContainerEntry from './inventory/ContainerEntry';
import CoordinateUtils from './world/CoordinateUtils';
import type Device from './utils/Device';
import FormManager from './form/FormManager';
import Human from './entity/Human';
import type { InetAddress } from '@jsprismarine/raknet';
import PlayerSession from './network/PlayerSession';
import PlayerSetGamemodeEvent from './events/player/PlayerSetGamemodeEvent';
import PlayerToggleFlightEvent from './events/player/PlayerToggleFlightEvent';
import PlayerToggleSprintEvent from './events/player/PlayerToggleSprintEvent';
import type Skin from './utils/skin/Skin';
import Timer from './utils/Timer';
import type Vector3 from './math/Vector3';
import WindowManager from './inventory/WindowManager';
import type World from './world/World';

import type Server from './Server';
import { Gamemode, PlayerPositionMode } from '@jsprismarine/minecraft';
import Chat, { ChatType } from './chat/Chat';
import { ChunkPos, MessageType } from '@jsprismarine/protocol';

// Default spawn view distance used in vanilla
export const VANILLA_DEFAULT_SPAWN_RADIUS = 4;

export default class Player extends Human {
    public static MOB_ID = 'minecraft:player';

    private readonly address: InetAddress;
    private readonly networkSession: PlayerSession;
    private permissions: string[];

    // Only used for metrics
    private joinTimer = new Timer();

    // TODO: finish implementation
    private readonly windows: WindowManager;

    private connected = false;
    public username = {
        prefix: '<',
        suffix: '>',
        name: ''
    };

    public locale = '';
    public randomId = 0;

    public uuid = '';
    public xuid = '';
    public skin: Skin | null = null;

    public viewDistance = 0;
    public gamemode = 0;

    public pitch = 0;

    private onGround = false;
    private sprinting = false;
    private flying = false;
    private sneaking = false;
    private allowFight = false;

    public platformChatId = '';

    public device: Device | null = null;

    public cacheSupport = false;

    public readonly chunkSendQueue = new Set<Chunk>();
    public currentChunk: bigint | null = null;

    private readonly forms: FormManager;

    private chatHandler: (event: ChatEvent) => void;

    /**
     * Player's constructor.
     */
    public constructor(connection: ClientConnection, world: World, server: Server) {
        super(world, server);
        this.address = connection.getRakNetSession().getAddress();
        this.networkSession = new PlayerSession(server, connection, this);
        this.windows = new WindowManager();
        this.forms = new FormManager();
        this.permissions = [];
        this.joinTimer.reset();

        // TODO: remove this mess :/
        this.chatHandler = async (evt: ChatEvent) => {
            if (evt.isCancelled()) return;

            // TODO: proper channel system
            if (
                evt.getChat().getChannel() === '*.everyone' ||
                (evt.getChat().getChannel() === '*.ops' && this.isOp()) ||
                evt.getChat().getChannel() === `*.player.${this.getName()}`
            )
                this.sendMessage(
                    evt.getChat().getMessage(),
                    evt.getChat().getType() as number as MessageType,
                    evt.getChat().getParameters(),
                    evt.getChat().isNeedsTranslation()
                );
        };

        server.getEventManager().on('chat', this.chatHandler);
    }

    public async onEnable() {
        this.permissions = await this.getServer().getPermissionManager().getPermissions(this);

        const playerData = await this.getWorld().getPlayerData(this);

        // void this.setGamemode(Gamemode.getGamemodeId(playerData.gamemode));
        // TODO: calling this before the player is spawning will create an undefined behavior
        // this function will send a SetPlayerGameType packet breaking the login sequence
        // i'll keep this comment while it's broken
        await this.setX(playerData.position.x);
        await this.setY(playerData.position.y);
        await this.setZ(playerData.position.z);
        this.pitch = playerData.position.pitch ?? 0;
        this.bodyYaw = playerData.position.yaw ?? 0;

        playerData.inventory.forEach((item) => {
            const entry =
                this.getServer().getItemManager().getItem(item.id) ||
                this.getServer().getBlockManager().getBlock(item.id);

            if (!entry) {
                this.getServer().getLogger()?.warn(`Item/block with id ${item.id} is invalid`, 'Player/onEnable');
                return;
            }

            this.getInventory().setItem(
                item.position,
                new ContainerEntry({
                    item: entry,
                    count: item.count
                })
            );
        });

        if (!this.connected)
            this.getServer()
                .getLogger()
                ?.debug(`(Complete player creation took ${this.joinTimer.stop()} ms)`, 'Player/onEnable');
        this.connected = true;
    }

    public async onDisable() {
        if (this.connected && this.xuid) await this.getWorld().savePlayerData(this);
        this.getWorld().removeEntity(this); // this method needs to be refactored as well

        // despawn the player to all online players
        await this.getNetworkSession().removeFromPlayerList();
        for (const onlinePlayer of this.server.getPlayerManager().getOnlinePlayers()) {
            await this.getNetworkSession().sendDespawn(onlinePlayer);
        }

        const eventManager = this.server.getEventManager();

        // TODO: use the method `sendMessage`
        // and rewrite this mess :(
        // Announce disconnection
        const event = new ChatEvent(
            new Chat(
                this.server.getConsole(),
                `§e%multiplayer.player.left`,
                [this.getName()],
                true,
                '*.everyone',
                ChatType.TRANSLATION
            )
        );
        await eventManager.emit('chat', event);

        eventManager.removeListener('chat', this.chatHandler);
        this.connected = false;
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

        const savedChunks: ChunkPos[] = [];
        const sendQueue: Array<Promise<Chunk>> = [];
        for (let chunkX = minX; chunkX <= maxX; ++chunkX) {
            for (let chunkZ = minZ; chunkZ <= maxZ; ++chunkZ) {
                // TODO: vanilla does not send all of them, but in a range
                // for example it does send them from x => [-3; 3] and z => [-3; 2]
                savedChunks.push(new ChunkPos(chunkX, chunkZ));
                sendQueue.push(this.getWorld().getChunk(chunkX, chunkZ));
            }
        }

        this.networkSession.sendNetworkChunkPublisher(VANILLA_DEFAULT_SPAWN_RADIUS, savedChunks);

        const getUniqueChunks = (sendList: ChunkPos[]) => {
            const xSet = new Set<number>();
            const zSet = new Set<number>();

            for (const coord of sendList) {
                xSet.add(coord.cx);
                zSet.add(coord.cz);
            }

            return Math.floor((xSet.size + zSet.size) / 2);
        };

        for (let i = 0; i < getUniqueChunks(savedChunks); ++i) {
            this.networkSession.sendNetworkChunkPublisher(VANILLA_DEFAULT_SPAWN_RADIUS, []);
        }

        for await (const chunk of sendQueue) {
            this.networkSession.sendChunk(chunk);
        }
    }

    /**
     * Change the player's current world.
     * TODO: remove!!! NO NETWORK CODE IN THIS CLASS.
     *
     * @param world - the new world
     */
    public async setWorld(world: World) {
        /* const dim0 = new ChangeDimensionPacket();
        dim0.dimension = 0;
        dim0.position = this;
        dim0.respawn = false;

        const dim1 = new ChangeDimensionPacket();
        dim1.dimension = 1;
        dim1.position = new Vector3(0, 0, 0); // TODO: load this properly
        dim1.respawn = false;

        await this.networkSession.getConnection().sendDataPacket(dim0);
        await this.networkSession.sendPlayStatus(PlayStatus.PLAYER_SPAWN);
        await this.networkSession.getConnection().sendDataPacket(dim1);
        await this.networkSession.sendPlayStatus(PlayStatus.PLAYER_SPAWN);

        await this.getWorld().removeEntity(this);
        await world.addEntity(this);
        await super.setWorld.bind(this)(world);

        await this.setPosition(new Vector3(0, 0, 0));
        for (let x = -3; x < 3; x++) {
            for (let z = -3; z < 3; z++) {
                const pk = new LevelChunkPacket();
                pk.clientSubChunkRequestsEnabled = false;
                pk.chunkX = x; // TODO
                pk.chunkZ = z; // TODO
                pk.data = Buffer.from('');
                pk.subChunkCount = 0;
                await this.networkSession.getConnection().sendDataPacket(pk);
            }
        }

        await this.networkSession.getConnection().sendDataPacket(dim1);
        await this.networkSession.sendPlayStatus(PlayStatus.PLAYER_SPAWN);
        await this.networkSession.getConnection().sendDataPacket(dim0);
        await this.networkSession.sendPlayStatus(PlayStatus.PLAYER_SPAWN);

        this.currentChunk = null;
        await this.networkSession.clearChunks();
        await this.networkSession.needNewChunks();
        await this.onEnable();
        await this.networkSession.sendPlayStatus(PlayStatus.PLAYER_SPAWN); */
    }

    public isOnline() {
        return this.connected;
    }

    public async update(tick: number): Promise<void> {
        // Call super method
        await super.update.bind(this)(tick);
        await this.networkSession.update(tick);

        // TODO: get documentation about timings from vanilla
        // 1 second / 20 = 1 tick, 20 * 5 = 1 second
        // 1 second * 60 = 1 minute
        if (tick % (20 * 5 * 60 * 1) === 0) {
            this.networkSession.sendTime(tick);
        }

        for (const chunk of this.chunkSendQueue) {
            this.networkSession.sendNetworkChunkPublisher(this.viewDistance ?? VANILLA_DEFAULT_SPAWN_RADIUS, []);
            this.networkSession.sendChunk(chunk);
            this.chunkSendQueue.delete(chunk);
        }
    }

    public async kick(reason = 'unknown reason'): Promise<void> {
        this.getServer()
            .getLogger()
            ?.verbose(`Player with id §b${this.getRuntimeId()}§r was kicked: ${reason}`, 'Player/kick');
        this.networkSession.kick(reason);
    }

    public async sendSettings(): Promise<void> {
        /* 
            TODO
            await Promise.all(
            this.getServer()
                .getSessionManager()
                .getAllPlayers()
                .map(async (target) => {
                    await target.getNetworkSession().sendSettings(this);
                })
        ); */
    }

    // Return all the players in the same chunk,.
    // TODO: move to world
    public getPlayersInChunk(): Player[] {
        return this.getServer()
            .getPlayerManager()
            .getOnlinePlayers()
            .filter((player) => player.getCurrentChunk() === this.getCurrentChunk());
    }

    // TODO: these
    public async sendSpawn() {}
    public async sendDespawn() {}

    /**
     * Send a chat message to the client.
     * @param message - the message
     */
    public sendMessage(
        message: string,
        type: MessageType = MessageType.RAW,
        parameters: string[] = [],
        needsTranslation = false
    ): void {
        // TODO: Do this properly like java edition,
        // in other words, the message should be JSON formatted.
        this.networkSession.sendMessage(message, '', parameters, needsTranslation, type);
    }

    /**
     * Send a toast notification (like Xbox Live notifications)
     * @param title - the toast title
     * @param body - the toast body
     */
    public async sendToast(title: string, body: string): Promise<void> {
        await this.networkSession.sendToast(title, body);
    }

    public setGamemode(mode: number): void {
        const event = new PlayerSetGamemodeEvent(this, mode);
        this.getServer().getEventManager().post(['playerSetGamemode', event]);
        if (event.isCancelled()) return;

        this.gamemode = event.getGamemode();
        this.networkSession.sendGamemode(this.gamemode);

        if (this.gamemode === Gamemode.Gametype.CREATIVE || this.gamemode === Gamemode.Gametype.SPECTATOR) {
            this.allowFight = true;
        } else {
            this.allowFight = false;
            this.setFlying(false);
        }

        this.sendSettings();
    }

    public getGamemode(): string {
        return Gamemode.getGametypeName(this.gamemode).toLowerCase();
    }

    public getNetworkSession(): PlayerSession {
        return this.networkSession;
    }

    public getAddress() {
        return this.address;
    }

    public getName(): string {
        return this.username.name;
    }

    public getFormattedUsername(): string {
        return `${this.username.prefix}${this.username.name}${this.username.suffix}`;
    }

    public getPermissions(): string[] {
        return this.permissions;
    }

    public getUUID(): string {
        return this.uuid;
    }

    public getXUID(): string {
        return this.xuid;
    }

    public getFormManager(): FormManager {
        return this.forms;
    }

    public getWindows(): WindowManager {
        return this.windows;
    }

    public getAllowFlight(): boolean {
        return this.allowFight;
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
        return this.getServer().getPermissionManager().isOp(this.getName());
    }

    /**
     * Check if the `Player` is sprinting.
     *
     * @returns `true` if this player is sprinting otherwise `false`.
     */
    public isSprinting() {
        return this.sprinting;
    }

    public async setSprinting(sprinting: boolean) {
        if (sprinting === this.isSprinting()) return;

        const event = new PlayerToggleSprintEvent(this, sprinting);
        this.getServer().getEventManager().post(['playerToggleSprint', event]);
        if (event.isCancelled()) return;

        this.sprinting = event.getIsSprinting();

        // TODO: find a better way to put this
        this.setDataFlag(MetadataFlag.INDEX, MetadataFlag.SPRINTING, this.isSprinting(), FlagType.BYTE);

        await this.networkSession.sendMetadata();
    }

    public isFlying() {
        return this.flying;
    }

    public async setFlying(flying: boolean) {
        if (flying === this.isFlying()) return;
        if (!this.getAllowFlight()) {
            this.flying = false;
            return;
        }

        const event = new PlayerToggleFlightEvent(this, flying);
        this.getServer().getEventManager().post(['playerToggleFlight', event]);
        if (event.isCancelled()) return;

        this.flying = event.getIsFlying();
        await this.sendSettings();
    }

    public isSneaking() {
        return this.sneaking;
    }

    public async setSneaking(val: boolean) {
        this.sneaking = val;
        await this.sendSettings();
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
     *
     * @remarks
     * This will notify the player's client about the position change.
     *
     * @param position - The position
     * @param type - The movement type
     */
    public async setPosition(position: Vector3, type: PlayerPositionMode = PlayerPositionMode.NORMAL) {
        await this.setX(position.getX());
        await this.setY(position.getY());
        await this.setZ(position.getZ());
        await this.networkSession.broadcastMove(this, type);
    }

    public setCurrentChunk(chunk: bigint) {
        if (this.currentChunk === chunk) return;
        this.currentChunk = chunk;
    }

    public getCurrentChunk() {
        return this.currentChunk!;
    }
}
