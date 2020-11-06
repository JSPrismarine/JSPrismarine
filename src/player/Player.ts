import Prismarine from '../Prismarine';
import Entity from '../entity/entity';
import World from '../world/world';
import Gamemode from '../world/gamemode';
import PlayerConnection from './PlayerConnection';
import PlayerInventory from '../inventory/PlayerInventory';
import Inventory from '../inventory/Inventory';
import Skin from '../utils/skin/skin';
import Device from '../utils/Device';
import Chunk from '../world/chunk/Chunk';

export enum PlayerPermission {
    Visitor,
    Member,
    Operator,
    Custom
}

export default class Player extends Entity {
    private server: Prismarine;
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
    constructor(
        connection: any,
        address: any,
        world: World,
        server: Prismarine
    ) {
        super(world);
        this.address = address;
        this.server = server;
        this.playerConnection = new PlayerConnection(server, connection, this);

        // TODO: only set to default gamemode if there doesn't exist any save data for the user
        this.gamemode = Gamemode.getGamemodeId(
            server.getConfig().getGamemode()
        );

        // Handle chat messages
        server.getEventManager().on('chat', (evt) => {
            if (evt.cancelled) return;

            // TODO: proper channel system
            if (
                evt.getChat().getChannel() === '*.everyone' ||
                (evt.getChat().getChannel() === '*.ops' &&
                    this.server.getPermissionManager().isOp(this))
            )
                this.sendMessage(evt.getChat().getMessage());
        });
    }

    public async update(tick: number) {
        // Update movement for every player
        for (const player of this.server.getOnlinePlayers()) {
            if (player === this) continue;
            player.getPlayerConnection().broadcastMove(this);
            this.playerConnection.broadcastMove(player);
        }

        await this.playerConnection.update(tick);
    }

    public async kick(reason = 'unknown reason') {
        this.playerConnection.kick(reason);
    }

    // Return all the players in the same chunk
    // TODO: move to world
    public getPlayersInChunk() {
        return this.server
            .getOnlinePlayers()
            .filter((player) => player.currentChunk === this.currentChunk);
    }

    public sendMessage(message: string) {
        this.playerConnection.sendMessage(message);
    }

    public isPlayer() {
        return true;
    }

    public getServer() {
        return this.server;
    }

    public getPlayerConnection() {
        return this.playerConnection;
    }

    public getAddress() {
        return this.address;
    }

    public getUsername() {
        return this.username.name;
    }
    public getFormattedUsername() {
        return `${this.username.prefix}${this.username.name}${this.username.suffix}`;
    }

    public getUUID(): string {
        return this.uuid || '';
    }
}
