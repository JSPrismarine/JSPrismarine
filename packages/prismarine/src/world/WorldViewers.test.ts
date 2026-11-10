import { describe, expect, it } from 'vitest';

import type Player from '../Player';
import type PlayerSession from '../network/PlayerSession';
import { stub } from '../testing/stub.test.helper';
import { World } from './World';

/** A player in the world, joined or still joining, with the session its client speaks through. */
const playerWith = (runtimeId: bigint, online: boolean) => {
    const session = stub<PlayerSession>({ runtimeId });
    const player = stub<Player>({
        getRuntimeId: () => runtimeId,
        getNetworkSession: () => session,
        isOnline: () => online
    });
    return { player, session };
};

/** A world holding these players in its player map, by entity id. */
const worldWith = (...players: Player[]): World =>
    Object.assign(Object.create(World.prototype), {
        players: new Map(players.map((player) => [Number(player.getRuntimeId()), player]))
    });

describe('World viewers', () => {
    it("lists the sessions of the world's online players", () => {
        const joined = playerWith(1n, true);
        const joining = playerWith(2n, false);

        expect(worldWith(joined.player, joining.player).getViewers()).toEqual([joined.session]);
    });

    it("finds a player's session by its entity id, whether or not it has joined", () => {
        const joined = playerWith(1n, true);
        const joining = playerWith(2n, false);
        const world = worldWith(joined.player, joining.player);

        expect(world.viewerOf(1n)).toBe(joined.session);
        expect(world.viewerOf(2n)).toBe(joining.session);
        expect(world.viewerOf(3n)).toBeUndefined();
    });
});
