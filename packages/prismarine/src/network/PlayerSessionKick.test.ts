import { DisconnectReason } from '@jsprismarine/minecraft';
import { describe, expect, it, vi } from 'vitest';

import { fakePlayer } from '../testing/fakePlayer.test.helper';

describe('PlayerSession', () => {
    describe('kick', () => {
        it('disconnects the client with the reason and code, as a kick of the player does', async () => {
            const bySession = fakePlayer();
            const byPlayer = fakePlayer();

            await bySession.session.kick('Too much lag', DisconnectReason.SHUTDOWN);
            await byPlayer.session.kick('Too much lag', DisconnectReason.SHUTDOWN);

            expect(bySession.disconnects).toEqual([['Too much lag', false, DisconnectReason.SHUTDOWN]]);
            expect(bySession.disconnects).toEqual(byPlayer.disconnects);
        });

        it('says it was kicked for no reason in particular unless told one', async () => {
            const { session, disconnects } = fakePlayer();

            await session.kick();

            expect(disconnects).toEqual([['unknown reason', false, DisconnectReason.KICKED]]);
        });
    });

    describe('getWorld', () => {
        it("answers the world the session's player is in", () => {
            const { session, world } = fakePlayer();

            expect(session.getWorld()).toBe(world);
        });

        it('still answers the world once the session has forgotten its player', () => {
            const { session, world } = fakePlayer();

            session.disable();

            expect(session.getWorld()).toBe(world);
            expect(() => session.getPlayer()).toThrow(/has left/);
        });
    });

    describe('leave', () => {
        it('takes the player off the server and then disables itself', async () => {
            const { session, roster } = fakePlayer();
            await session.leave();

            expect(roster).toEqual(['save', 'remove']);
            expect(session.isConnected()).toBe(false);
            expect(() => session.getPlayer()).toThrow(/has left/);
        });

        it("disables itself even when the player's leave fails", async () => {
            const { session, world } = fakePlayer();
            vi.spyOn(world, 'removePlayer').mockImplementation(() => {
                throw new Error('world unavailable');
            });

            expect(() => session.leave()).toThrow('world unavailable');

            expect(() => session.getPlayer()).toThrow(/has left/);
        });
    });
});
