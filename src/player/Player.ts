import CommandExecuter from '../command/CommandExecuter';
import Human from '../entity/Human';
import ChatEvent from '../events/chat/ChatEvent';
import PlayerSetGamemodeEvent from '../events/player/PlayerSetGamemodeEvent';
import PlayerToggleFlightEvent from '../events/player/PlayerToggleFlightEvent';
import PlayerToggleSprintEvent from '../events/player/PlayerToggleSprintEvent';
import ContainerEntry from '../inventory/ContainerEntry';
import WindowManager from '../inventory/WindowManager';
import Connection from '../network/raknet/Connection';
import InetAddress from '../network/raknet/utils/InetAddress';
import Server from '../Server';
import Device from '../utils/Device';
import Skin from '../utils/skin/Skin';
import Chunk from '../world/chunk/Chunk';
import Gamemode from '../world/Gamemode';
import World from '../world/World';
import PlayerConnection from './PlayerConnection';

export default class Player extends Human implements CommandExecuter {
    private readonly server: Server;
    private readonly address: InetAddress;
    private readonly playerConnection: PlayerConnection;

    // TODO: finish implementation
    private readonly windows: WindowManager;

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

    /**
     * Player's constructor.
     */
    constructor(connection: Connection, world: World, server: Server) {
        super(world);
        this.address = connection.getAddress();
        this.server = server;
        this.playerConnection = new PlayerConnection(server, connection, this);
        this.windows = new WindowManager();

        // Handle chat messages
        server.getEventManager().on('chat', async (evt: ChatEvent) => {
            if (evt.cancelled) return;

            // TODO: proper channel system
            if (
                evt.getChat().getChannel() === '*.everyone' ||
                (evt.getChat().getChannel() === '*.ops' && this.isOp()) ||
                evt.getChat().getChannel() === `*.player.${this.getUsername()}`
            )
                await this.sendMessage(evt.getChat().getMessage());
        });
    }

    public async onEnable() {
        const playerData = await this.getWorld().getPlayerData(this);

        void this.setGamemode(Gamemode.getGamemodeId(playerData.gamemode));
        this.setX(playerData.position.x);
        this.setY(playerData.position.y);
        this.setZ(playerData.position.z);
        this.pitch = playerData.position.pitch;
        this.yaw = playerData.position.yaw;

        playerData.inventory.forEach((item) => {
            const entry =
                this.server.getItemManager().getItem(item.id) ||
                this.server.getBlockManager().getBlock(item.id);

            if (!entry) {
                this.getServer()
                    .getLogger()
                    .debug(
                        `Item/block with id ${item.id} is invalid`,
                        'Player/onEnable'
                    );
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
    }

    public async onDisable() {
        await this.getWorld().savePlayerData(this);
    }

    public async update(tick: number): Promise<void> {
        await this.playerConnection.update(tick);
    }

    public async kick(reason = 'unknown reason'): Promise<void> {
        this.getServer()
            .getLogger()
            .debug(
                `Player with id §b${this.runtimeId}§r was kicked: ${reason}`,
                'Player/kick'
            );
        await this.playerConnection.kick(reason);
    }

    public async sendSettings(): Promise<void> {
        await Promise.all(
            this.getServer()
                .getOnlinePlayers()
                .map(async (target) => {
                    await target.getConnection().sendSettings(this);
                })
        );
    }

    // Return all the players in the same chunk
    // TODO: move to world
    public getPlayersInChunk(): Player[] {
        return this.server
            .getOnlinePlayers()
            .filter((player) => player.currentChunk === this.currentChunk);
    }

    public async sendMessage(message: string): Promise<void> {
        await this.playerConnection.sendMessage(message);
    }

    public async setGamemode(mode: number): Promise<void> {
        const event = new PlayerSetGamemodeEvent(this, mode);
        this.server.getEventManager().post(['playerSetGamemodeEvent', event]);
        if (event.cancelled) return;

        this.gamemode = event.getGamemode();
        await this.playerConnection.sendGamemode(this.gamemode);

        if (
            this.gamemode === Gamemode.Creative ||
            this.gamemode === Gamemode.Spectator
        )
            this.allowFight = true;
        else {
            this.allowFight = false;
            await this.setFlying(false);
        }

        await this.sendSettings();
    }

    public getServer(): Server {
        return this.server;
    }

    public getConnection(): PlayerConnection {
        return this.playerConnection;
    }

    public getAddress() {
        return this.address;
    }

    public getUsername(): string {
        return this.username.name;
    }

    public getFormattedUsername(): string {
        return `${this.username.prefix}${this.username.name}${this.username.suffix}`;
    }

    public getUUID(): string {
        if (!this.uuid) throw new Error('uuid is missing!');

        return this.uuid;
    }

    public getXUID(): string {
        if (!this.xuid) throw new Error('xuid is missing!');

        return this.xuid;
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
        return this.getServer().getPermissionManager().isOp(this.getUsername());
    }

    public isSprinting() {
        return this.sprinting;
    }
    public async setSprinting(sprinting: boolean) {
        if (sprinting === this.isSprinting()) return;

        const event = new PlayerToggleSprintEvent(this, sprinting);
        this.server.getEventManager().post(['playerToggleSprint', event]);
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
        this.server.getEventManager().post(['playerToggleFlight', event]);
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
        this.onGround = val;
        await this.sendSettings();
    }
}
