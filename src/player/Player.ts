import Prismarine from "../Prismarine";
import Entity from "../entity/entity";
import World from "../world/world";
import Gamemode from "../world/gamemode";
import PlayerConnection from "./PlayerConnection";

const PlayerInventory = require('../inventory/player-inventory');

export enum PlayerPermission {
    Visitor,
    Member,
    Operator,
    Custom
};

export default class Player extends Entity {
    private server: Prismarine;
    private address: any;
    private playerConnection: PlayerConnection;

    /** @type {PlayerInventory} */
    inventory = new PlayerInventory()
    /** @type {Map<Number, Inventory>} */
    windows = new Map()

    username = {
        prefix: '<',
        suffix: '>',
        name: ''
    };
    locale: string = '';
    randomId: number = 0;

    /** @type {string} */
    uuid: string | null = null
    /** @type {string} */
    xuid: string | null = null
    /** @type {Skin} */
    skin: any

    /** @type {number} */
    viewDistance: any
    /** @type {number} */
    gamemode = 0

    /** @type {number} */
    pitch = 0
    /** @type {number} */
    yaw = 0
    /** @type {number} */
    headYaw = 0

    /** @type {boolean} */
    onGround = false

    /** @type {string} */
    platformChatId = ''

    /** @type {Device} */
    device: any

    /** @type {boolean} */
    cacheSupport: boolean | null = null

    /** @type {null|Chunk} */
    public currentChunk = null;

    /**
     * Player's constructor.
     * 
     * @param {Connection} connection - player's connection
     * @param {InetAddress} address - player's InternetAddress address
     * @param {World} world - a world to spawn the entity 
     * @param {Prismarine} server - the server instance
     */
    constructor(connection: any, address: any, world: World, server: Prismarine) {
        super(world);
        this.address = address;
        this.server = server;
        this.playerConnection = new PlayerConnection(server, connection, this);

        // TODO: only set to default gamemode if there doesn't exist any save data for the user
        this.gamemode = Gamemode.getGamemodeId(server.getConfig().getGamemode());

        // Handle chat messages
        server.getEventManager().on('chat', (evt) => {
            if (evt.cancelled)
                return;

            // TODO: proper channel system
            if (
                evt.getChat().getChannel() === '*.everyone' ||
                (evt.getChat().getChannel() === '*.ops' && this.server.getPermissionManager().isOp(this))
            )
                this.sendMessage(evt.getChat().getMessage());
        });
    }

    public async update(tick: number) {
        // Update movement for every player
        for (const player of this.server.getOnlinePlayers()) {
            if (player === this)
                continue;
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
        return this.server.getOnlinePlayers()
            .filter(player => player.currentChunk === this.currentChunk);
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
