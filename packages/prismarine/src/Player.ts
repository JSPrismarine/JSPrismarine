import { ChangeDimensionPacket, LevelChunkPacket } from './network/Packets.js';

import ChatEvent from './events/chat/ChatEvent.js';
import Chunk from './world/chunk/Chunk.js';
import ClientConnection from './network/ClientConnection.js';
import ContainerEntry from './inventory/ContainerEntry.js';
import Device from './utils/Device.js';
import FormManager from './form/FormManager.js';
import Gamemode from './world/Gamemode.js';
import Human from './entity/Human.js';
import { InetAddress } from '@jsprismarine/raknet';
import MovementType from './network/type/MovementType.js';
import PlayStatusType from './network/type/PlayStatusType.js';
import PlayerSession from './network/PlayerSession.js';
import PlayerSetGamemodeEvent from './events/player/PlayerSetGamemodeEvent.js';
import PlayerToggleFlightEvent from './events/player/PlayerToggleFlightEvent.js';
import PlayerToggleSprintEvent from './events/player/PlayerToggleSprintEvent.js';
import Server from './Server.js';
import Skin from './utils/skin/Skin.js';
import TextType from './network/type/TextType.js';
import Timer from './utils/Timer.js';
import Vector3 from './math/Vector3.js';
import WindowManager from './inventory/WindowManager.js';
import World from './world/World.js';
import { MetadataFlag, FlagType } from './entity/Metadata.js';

export default class Player extends Human {
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

    public viewDistance: any;
    public gamemode = 0;

    public pitch = 0;
    public yaw = 0;
    public headYaw = 0;

    private onGround = false;
    private sprinting = false;
    private flying = false;
    private sneaking = false;
    private allowFight = false;

    public platformChatId = '';

    public device: Device | null = null;

    public cacheSupport = false;

    public currentChunk: Chunk | null = null;

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
                await this.sendMessage(
                    evt.getChat().getMessage(),
                    evt.getChat().getType() as number as TextType,
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
        this.yaw = playerData.position.yaw ?? 0;

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
        this.server.getEventManager().removeListener('chat', this.chatHandler);

        this.connected = false;
    }

    /**
     * Change the player's current world.
     *
     * @param world the new world
     */
    public async setWorld(world: World) {
        const dim0 = new ChangeDimensionPacket();
        dim0.dimension = 0;
        dim0.position = this;
        dim0.respawn = false;

        const dim1 = new ChangeDimensionPacket();
        dim1.dimension = 1;
        dim1.position = new Vector3(0, 0, 0); // TODO: load this properly
        dim1.respawn = false;

        await this.networkSession.getConnection().sendDataPacket(dim0);
        await this.networkSession.sendPlayStatus(PlayStatusType.PlayerSpawn);
        await this.networkSession.getConnection().sendDataPacket(dim1);
        await this.networkSession.sendPlayStatus(PlayStatusType.PlayerSpawn);

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
        await this.networkSession.sendPlayStatus(PlayStatusType.PlayerSpawn);
        await this.networkSession.getConnection().sendDataPacket(dim0);
        await this.networkSession.sendPlayStatus(PlayStatusType.PlayerSpawn);

        this.currentChunk = null;
        await this.networkSession.clearChunks();
        await this.networkSession.needNewChunks();
        await this.onEnable();
        await this.networkSession.sendPlayStatus(PlayStatusType.PlayerSpawn);
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
            await this.networkSession.sendTime(tick);
        }
    }

    public async kick(reason = 'unknown reason'): Promise<void> {
        this.getServer()
            .getLogger()
            ?.verbose(`Player with id §b${this.getRuntimeId()}§r was kicked: ${reason}`, 'Player/kick');
        await this.networkSession.kick(reason);
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
            .getSessionManager()
            .getAllPlayers()
            .filter((player) => player.getCurrentChunk() === this.getCurrentChunk());
    }

    // TODO: these
    public async sendSpawn() {}
    public async sendDespawn() {}

    /**
     * Send a chat message to the client.
     * @param message the message
     */
    public async sendMessage(
        message: string,
        type: TextType = TextType.Raw,
        parameters: string[] = [],
        needsTranslation = false
    ): Promise<void> {
        // TODO: Do this properly like java edition,
        // in other words, the message should be JSON formatted.
        await this.networkSession.sendMessage(message, '', parameters, needsTranslation, type);
    }

    public async setGamemode(mode: number): Promise<void> {
        const event = new PlayerSetGamemodeEvent(this, mode);
        this.getServer().getEventManager().post(['playerSetGamemode', event]);
        if (event.isCancelled()) return;

        this.gamemode = event.getGamemode();
        await this.networkSession.sendGamemode(this.gamemode);

        if (this.gamemode === Gamemode.Creative || this.gamemode === Gamemode.Spectator) this.allowFight = true;
        else {
            this.allowFight = false;
            await this.setFlying(false);
        }

        await this.sendSettings();
    }

    public getGamemode(): string {
        return Gamemode.getGamemodeName(this.gamemode).toLowerCase();
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
        if (!this.uuid) throw new Error('uuid is missing!');

        return this.uuid;
    }

    public getXUID(): string {
        if (!this.xuid) throw new Error('xuid is missing!');

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
     * @param position The position
     * @param type The movement type
     */
    public async setPosition(position: Vector3, type: MovementType = MovementType.Normal) {
        await this.setX(position.getX());
        await this.setY(position.getY());
        await this.setZ(position.getZ());
        await this.networkSession.broadcastMove(this, type);
    }

    public setCurrentChunk(chunk: Chunk) {
        if (this.currentChunk === chunk) return;
        this.currentChunk = chunk;
    }

    public getCurrentChunk() {
        return this.currentChunk!;
    }
}
