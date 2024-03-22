import ClientConnection from './network/ClientConnection';
import Player from './Player';
import assert from 'node:assert';
import { PlayerListEntry } from './network/packet/PlayerListPacket';

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

    public getAllPlayers(): Player[] {
        const players = new Array();
        for (const conn of this.connections.values()) {
            const session = conn.getPlayerSession();
            if (session !== null) {
                players.push(session.getPlayer());
            }
        }
        return players;
    }

    /**
     * Just a compatibility layer to not break everything for now
     *
     * @deprecated
     * @param token
     */
    public getPlayer(token: string): Player {
        const conn = this.connections.get(token) ?? null;
        if (conn === null) {
            throw new Error(`Connection for player ${token} not found!`);
        }

        const session = conn.getPlayerSession();
        if (session === null) {
            throw new Error(`Player for session ${token} is not initialized!`);
        }

        return session.getPlayer();
    }

    /**
     * Just a compatibility layer to not break everything for now
     *
     * @deprecated
     * @param name
     * @returns
     */
    public getPlayerByExactName(name: string): Player {
        const found = this.getAllPlayers().find((p) => p.getName() === name) ?? null;
        assert(found !== null, `Player with name ${name} cannot be found!`);
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
