import type Player from './Player';
import assert from 'node:assert';

export default class PlayerManager {
    private readonly players = new Set<Player>();
    // [runtimeId -> PlayerListEntry]
    // private readonly playerList = new Map<bigint, PlayerListEntry>();

    public add(player: Player): boolean {
        if (this.players.has(player)) {
            return false;
        }
        this.players.add(player);
        // this.playerList.set(player.getRuntimeId(), new PlayerListEntry(player));
        return true;
    }

    public remove(player: Player): boolean {
        if (!this.players.has(player)) {
            return false;
        }
        // this.playerList.delete(player.getRuntimeId());
        this.players.delete(player);
        return true;
    }

    public getOnlinePlayers(): Player[] {
        return Array.from(this.players);
    }

    /* public getPlayerList(): PlayerListEntry[] {
        return Array.from(this.playerList.values());
    } */

    /**
     * Just a compatibility layer to not break everything for now
     *
     * @deprecated
     * @param name
     * @returns
     */
    public getPlayerByExactName(name: string): Player {
        const found = this.getOnlinePlayers().find((p) => p.getName() === name) ?? null;
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
        const found = this.getOnlinePlayers().find((p) => p.getRuntimeId() === id) ?? null;
        assert(found !== null, `Player with id ${id} cannot be found!`);
        return found;
    }
}
