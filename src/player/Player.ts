import ChatEvent from '../events/chat/ChatEvent';
import Chunk from '../world/chunk/Chunk';
import CommandExecuter from '../command/CommandExecuter';
import Connection from '../network/raknet/Connection';
import Device from '../utils/Device';
import Gamemode from '../world/Gamemode';
import Human from '../entity/Human';
import InetAddress from '../network/raknet/utils/InetAddress';
import PlayerConnection from './PlayerConnection';
import Server from '../Server';
import Skin from '../utils/skin/Skin';
import WindowManager from '../inventory/WindowManager';
import World from '../world/World';
import withDeprecated from '../hoc/withDeprecated';

export enum PlayerPermission {
    Visitor,
    Member,
    Operator,
    Custom
}

export default class Player extends Human implements CommandExecuter {
    private server: Server;
    private address: InetAddress;
    private playerConnection: PlayerConnection;

    // TODO: finish implementation
    private windows: WindowManager;

    public username = {
        prefix: '<',
        suffix: '>',
        name: ''
    };
    public locale: string = '';
    public randomId: number = 0;

    public uuid: string = '';
    public xuid: string = '';
    public skin: Skin | null = null;

    public viewDistance: any;
    public gamemode: number = 0;

    public pitch: number = 0;
    public yaw: number = 0;
    public headYaw: number = 0;

    public onGround: boolean = false;
    public isSprinting: boolean = false;

    public platformChatId: string = '';

    public device: Device | null = null;

    public cacheSupport: boolean = false;

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

        // TODO: only set to default gamemode if there doesn't exist any save data for the user
        this.gamemode = Gamemode.getGamemodeId(
            server.getConfig().getGamemode()
        );

        // Handle chat messages
        server.getEventManager().on('chat', (evt: ChatEvent) => {
            if (evt.cancelled) return;

            // TODO: proper channel system
            if (
                evt.getChat().getChannel() === '*.everyone' ??
                (evt.getChat().getChannel() === '*.ops' &&
                    this.server
                        .getPermissionManager()
                        .isOp(this.getUsername())) ??
                evt.getChat().getChannel() === `*.player.${this.getUsername()}`
            )
                this.sendMessage(evt.getChat().getMessage());
        });
    }

    public async update(tick: number): Promise<void> {
        await this.playerConnection.update(tick);
    }

    public kick(reason = 'unknown reason'): void {
        this.getServer()
            .getLogger()
            .debug(`Player with id ${this.runtimeId} was kicked: ${reason}`);
        this.playerConnection.kick(reason);
    }

    // Return all the players in the same chunk
    // TODO: move to world
    public getPlayersInChunk(): Array<Player> {
        return this.server
            .getOnlinePlayers()
            .filter((player) => player.currentChunk === this.currentChunk);
    }

    public sendMessage(message: string): void {
        this.playerConnection.sendMessage(message);
    }

    public setGamemode(mode: number): void {
        this.gamemode = mode;
        this.playerConnection.sendGamemode(this.gamemode);
    }

    public setTime(tick: number): void {
        this.getConnection().sendTime(tick);
    }

    public getServer(): Server {
        return this.server;
    }

    public getConnection(): PlayerConnection {
        return this.playerConnection;
    }

    @withDeprecated(new Date('12/11/2020'), 'getConnection')
    public getPlayerConnection(): PlayerConnection {
        return this.getConnection();
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
        return this.uuid ?? '';
    }

    public getWindows(): WindowManager {
        return this.windows;
    }

    public isPlayer(): boolean {
        return true;
    }
}
