import { DisconnectReason } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import { fakePlayer } from '../testing/fakePlayer.test.helper';

describe('PlayerSession', () => {
    describe('kick', () => {
        it('disconnects the client with the reason and code, as a kick of the player does', async () => {
            const bySession = fakePlayer();
            const byPlayer = fakePlayer();

            await bySession.player.getNetworkSession().kick('Too much lag', DisconnectReason.SHUTDOWN);
            await byPlayer.player.kick('Too much lag', DisconnectReason.SHUTDOWN);

            expect(bySession.disconnects).toEqual([['Too much lag', false, DisconnectReason.SHUTDOWN]]);
            expect(bySession.disconnects).toEqual(byPlayer.disconnects);
        });

        it('says it was kicked for no reason in particular unless told one', async () => {
            const { player, disconnects } = fakePlayer();

            await player.getNetworkSession().kick();

            expect(disconnects).toEqual([['unknown reason', false, DisconnectReason.KICKED]]);
        });
    });

    describe('getWorld', () => {
        it("answers the world the session's player is in", () => {
            const { player, world } = fakePlayer();

            expect(player.getNetworkSession().getWorld()).toBe(world);
        });

        it('throws once the session has forgotten its player', () => {
            const { player } = fakePlayer();
            const session = player.getNetworkSession();

            session.disable();

            expect(() => session.getWorld()).toThrow(/has left/);
        });
    });
});
