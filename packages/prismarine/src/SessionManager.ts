import assert from 'node:assert';
import type Player from './Player';
import type ClientConnection from './network/ClientConnection';
import type { PlayerListEntry } from './network/packet/PlayerListPacket';

export default class SessionManager {
    private readonly connections: Map<string, ClientConnection> = new Map();
    private readonly playerList: Map<string, PlayerListEntry> = new Map();

    public add(token: string, connection: ClientConnection): void {
        this.connections.set(token, connection);
    }

    public has(token: string): boolean {
        return this.connections.has(token);
    }

    public get(token: string): ClientConnection | null {
        return this.connections.get(token) ?? null;
    }

    public remove(token: string): boolean {
        return this.connections.delete(token);
    }

    public getPlayerList(): Map<string, PlayerListEntry> {
        return this.playerList;
    }

    /**
     * Every player on the server, in any world.
     *
     * Online only, the same test `World.getPlayers` applies. A connection has a session from
     * the moment it authenticates, well before the client is ready to be sent anything, and
     * without this the login handshake was among the recipients of every broadcast.
     * @returns {Player[]} The online players.
     */
    public getAllPlayers(): Player[] {
        return Array.from(this.connections.values())
            .map((conn) => conn.getPlayerSession()?.getPlayer())
            .filter((player): player is Player => Boolean(player?.isOnline()));
    }

    /**
     * Kick all players.
     * @param {string} reason - The reason to kick the players.
     */
    public async kickAllPlayers(reason: string) {
        await Promise.all(this.getAllPlayers().map((player) => player.kick(reason)));
    }

    public findPlayer({ name, xuid }: { name?: string; xuid?: string }): Player | null {
        return this.getAllPlayers().find((p) => p.getName() === name || p.getXUID() === xuid) ?? null;
    }

    /**
     * Just a compatibility layer to not break everything for now
     *
     * @deprecated
     * @param name
     * @returns
     */
    public getPlayerByExactName(name: string): Player | null {
        const found = this.getAllPlayers().find((p) => p.getName() === name) ?? null;
        return found;
    }

    /**
     * Just a compatibility layer to not break everything for now
     *
     * @deprecated
     * @param id
     * @returns
     */
    public getPlayerById(id: bigint): Player | null {
        const found = this.getAllPlayers().find((p) => p.getRuntimeId() === id) ?? null;
        assert(found !== null, `Player with id ${id} cannot be found!`);
        return found;
    }
}
