import ChatEvent from '../events/chat/ChatEvent';
import Chunk from '../world/chunk/Chunk';
import CommandExecuter from '../command/CommandExecuter';
import Device from '../utils/Device';
import Entity from '../entity/entity';
import Gamemode from '../world/Gamemode';
import Inventory from '../inventory/Inventory';
import PlayerConnection from './PlayerConnection';
import PlayerInventory from '../inventory/PlayerInventory';
import Server from '../Server';
import Skin from '../utils/skin/Skin';
import World from '../world/World';
import withDeprecated from '../hoc/withDeprecated';

export enum PlayerPermission {
    Visitor,
    Member,
    Operator,
    Custom
}

export default class Player extends Entity implements CommandExecuter {
    private server: Server;
    private address: any;
    private playerConnection: PlayerConnection;

    public inventory = new PlayerInventory();
    public windows: Map<number, Inventory> = new Map();

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

    public platformChatId: string = '';

    public device: Device | null = null;

    public cacheSupport: boolean = false;

    public currentChunk: Chunk | null = null;

    /**
     * Player's constructor.
     */
    constructor(connection: any, address: any, world: World, server: Server) {
        super(world);
        this.address = address;
        this.server = server;
        this.playerConnection = new PlayerConnection(server, connection, this);

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

    public async kick(reason = 'unknown reason'): Promise<void> {
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

    public isPlayer(): boolean {
        return true;
    }
}
