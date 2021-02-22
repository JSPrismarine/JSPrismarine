import Player from './Player';
import { PlayerListEntry } from '../network/packet/PlayerListPacket';
import Server from '../Server';

export default class PlayerManager {
    private server: Server;
    private readonly players: Map<string, Player> = new Map();
    private readonly playerList: Map<string, PlayerListEntry> = new Map();

    public constructor(server: Server) {
        this.server = server;
    }

    public getPlayer(address: string): Player {
        const player = this.players.get(address);
        if (!player) throw new Error(`No player with with the key "${address}"`);

        return player;
    }
    public async addPlayer(address: string, player: Player) {
        if (!player) throw new Error('Invalid player');
        if (this.players.has(address)) throw new Error('Player already exists');

        this.players.set(address, player);
    }
    public async removePlayer(address: string) {
        this.players.delete(address);
    }

    public getPlayerList() {
        return this.playerList;
    }

    /**
     * Returns an array containing all online players.
     */
    public getOnlinePlayers(): Player[] {
        return Array.from(this.players.values()).filter((p) => p.isOnline());
    }

    /**
     * Returns an online player by its runtime ID,
     * if it is not found, null is returned.
     */
    public getPlayerById(id: bigint): Player {
        const player = this.getOnlinePlayers().find((player) => player.runtimeId === id);

        if (!player) throw new Error(`Can't find player with id ${id}`);

        return player;
    }

    /**
     * Returns an online player by its name,
     * if it is not found, null is returned.
     *
     * CASE INSENSITIVE.
     * MATCH IF STARTS WITH
     * Example getPlayerByName("John") may return
     * an user with username "John Doe"
     */
    public getPlayerByName(name: string): Player {
        const player = Array.from(this.players.values()).find((player) => {
            return player.getName().toLowerCase().startsWith(name.toLowerCase());
        });

        if (!player) throw new Error(`Can't find player ${name}`);

        return player;
    }

    /**
     * Returns an online player by its name,
     * if it is not found, null is returned.
     *
     * CASE SENSITIVE.
     */
    public getPlayerByExactName(name: string): Player {
        const player = this.getOnlinePlayers().find((player) => player.getName() === name);

        if (!player) throw new Error(`Can't find player ${name}`);

        return player;
    }
}
