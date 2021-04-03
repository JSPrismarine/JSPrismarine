import { ChangeDimensionPacket, LevelChunkPacket } from '../network/Packets';
import { Connection, InetAddress } from '@jsprismarine/raknet';

import ChatEvent from '../events/chat/ChatEvent';
import Chunk from '../world/chunk/Chunk';
import CommandExecuter from '../command/CommandExecuter';
import ContainerEntry from '../inventory/ContainerEntry';
import Device from '../utils/Device';
import FormManager from '../form/FormManager';
import Gamemode from '../world/Gamemode';
import Human from '../entity/Human';
import MovementType from '../network/type/MovementType';
import PlayStatusType from '../network/type/PlayStatusType';
import PlayerConnection from './PlayerConnection';
import PlayerSetGamemodeEvent from '../events/player/PlayerSetGamemodeEvent';
import PlayerToggleFlightEvent from '../events/player/PlayerToggleFlightEvent';
import PlayerToggleSprintEvent from '../events/player/PlayerToggleSprintEvent';
import Server from '../Server';
import Skin from '../utils/skin/Skin';
import Timer from '../utils/Timer';
import Vector3 from '../math/Vector3';
import WindowManager from '../inventory/WindowManager';
import World from '../world/World';

export default class Player extends Human implements CommandExecuter {
    private readonly address: InetAddress;
    private readonly playerConnection: PlayerConnection;
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

    /**
     * Player's constructor.
     */
    public constructor(connection: Connection, world: World, server: Server) {
        super(world, server);
        this.address = connection?.getAddress();
        this.playerConnection = new PlayerConnection(server, connection, this);
        this.windows = new WindowManager();
        this.forms = new FormManager();
        this.permissions = [];
        this.joinTimer.reset();

        // Handle chat messages
        server.getEventManager().on('chat', async (evt: ChatEvent) => {
            if (evt.cancelled) return;

            // TODO: proper channel system
            if (
                evt.getChat().getChannel() === '*.everyone' ||
                (evt.getChat().getChannel() === '*.ops' && this.isOp()) ||
                evt.getChat().getChannel() === `*.player.${this.getName()}`
            )
                await this.sendMessage(evt.getChat().getMessage());
        });
    }

    public async onEnable() {
        this.permissions = await this.getServer().getPermissionManager().getPermissions(this);

        const playerData = await this.getWorld().getPlayerData(this);

        void this.setGamemode(Gamemode.getGamemodeId(playerData.gamemode));
        await this.setX(playerData.position.x);
        await this.setY(playerData.position.y);
        await this.setZ(playerData.position.z);
        this.pitch = playerData.position.pitch;
        this.yaw = playerData.position.yaw;

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

        await this.getConnection().sendDataPacket(dim0);
        await this.getConnection().sendPlayStatus(PlayStatusType.PlayerSpawn);
        await this.getConnection().sendDataPacket(dim1);
        await this.getConnection().sendPlayStatus(PlayStatusType.PlayerSpawn);

        await this.getWorld().removeEntity(this);
        await world.addEntity(this);
        await super.setWorld.bind(this)(world);

        await this.setPosition(new Vector3(0, 0, 0));
        for (let x = -3; x < 3; x++) {
            for (let z = -3; z < 3; z++) {
                const pk = new LevelChunkPacket();
                pk.chunkX = x; // TODO
                pk.chunkZ = z; // TODO
                pk.data = Buffer.from('');
                pk.subChunkCount = 0;
                await this.getConnection().sendDataPacket(pk);
            }
        }

        await this.getConnection().sendDataPacket(dim1);
        await this.getConnection().sendPlayStatus(PlayStatusType.PlayerSpawn);
        await this.getConnection().sendDataPacket(dim0);
        await this.getConnection().sendPlayStatus(PlayStatusType.PlayerSpawn);

        this.currentChunk = null;
        await this.getConnection().clearChunks();
        await this.getConnection().needNewChunks();
        await this.onEnable();
        await this.getConnection().sendPlayStatus(PlayStatusType.PlayerSpawn);
    }

    public isOnline() {
        return this.connected;
    }

    public async update(tick: number): Promise<void> {
        // Call super method
        await super.update.bind(this)(tick);
        await this.playerConnection.update(tick);

        // TODO: get documentation about timings from vanilla
        // 1 second / 20 = 1 tick, 20 * 5 = 1 second
        // 1 second * 60 = 1 minute
        if (tick % (20 * 5 * 60 * 1) === 0) {
            await this.playerConnection.sendTime(tick);
        }
    }

    public async kick(reason = 'unknown reason'): Promise<void> {
        this.getServer()
            .getLogger()
            ?.verbose(`Player with id §b${this.getRuntimeId()}§r was kicked: ${reason}`, 'Player/kick');
        await this.playerConnection.kick(reason);
    }

    public async sendSettings(): Promise<void> {
        await Promise.all(
            this.getServer()
                .getPlayerManager()
                .getOnlinePlayers()
                .map(async (target) => {
                    await target.getConnection().sendSettings(this);
                })
        );
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

    public async sendMessage(message: string): Promise<void> {
        // TODO: Do this properly like java edition,
        // in other words, the message should be JSON formatted.
        await this.playerConnection.sendMessage(message);
    }

    public async setGamemode(mode: number): Promise<void> {
        const event = new PlayerSetGamemodeEvent(this, mode);
        this.getServer().getEventManager().post(['playerSetGamemode', event]);
        if (event.cancelled) return;

        this.gamemode = event.getGamemode();
        await this.playerConnection.sendGamemode(this.gamemode);

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

    public getConnection(): PlayerConnection {
        return this.playerConnection;
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
    public isOp(): boolean {
        return this.getServer().getPermissionManager().isOp(this.getName());
    }

    public isSprinting() {
        return this.sprinting;
    }

    public async setSprinting(sprinting: boolean) {
        if (sprinting === this.isSprinting()) return;

        const event = new PlayerToggleSprintEvent(this, sprinting);
        this.getServer().getEventManager().post(['playerToggleSprint', event]);
        if (event.cancelled) return;

        this.sprinting = event.getIsSprinting();
        await this.sendSettings();
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
        if (event.cancelled) return;

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

    public async setPosition(position: Vector3, type: MovementType = MovementType.Normal) {
        await this.setX(position.getX());
        await this.setY(position.getY());
        await this.setZ(position.getZ());
        await this.getConnection().broadcastMove(this, type);
    }

    public setCurrentChunk(chunk: Chunk) {
        if (this.currentChunk === chunk) return;
        this.currentChunk = chunk;
    }

    public getCurrentChunk() {
        return this.currentChunk;
    }
}
