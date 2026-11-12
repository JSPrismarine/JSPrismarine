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

        /** A player whose kick takes it off as a real connection's does, by leaving. */
        const leavingOnKick = () => {
            const fake = fakePlayer();
            fake.connection.disconnect = async () => fake.session.leave();
            return fake;
        };

        it('takes the player off once a unit that kicked it is undone, and the undo brings no entity back', () => {
            // The goodbye is queued and the connection hangs up whatever the unit does, so the
            // leave stands. Inside the unit, the undo restored the entity with no session behind it.
            const { session, player, live, roster } = leavingOnKick();
            const { store } = live.runtime;

            store.beginTick();
            const outcome = store.unit(() => {
                void session.kick('Too much lag');
                throw new Error('the rest of the unit failed');
            });
            store.sealTick();

            expect(outcome.failed).toBe(true);
            expect(roster).toEqual(['save', 'remove']);
            expect(store.get(player.id)).toBeUndefined();
            expect(session.isConnected()).toBe(false);
        });

        it('takes the player off after the unit that kicked it, not inside it', () => {
            const { session, player, live, roster } = leavingOnKick();
            const { store } = live.runtime;
            let inside: string[] = [];

            store.beginTick();
            store.unit(() => {
                void session.kick('Too much lag');
                inside = [...roster];
            });
            store.sealTick();

            expect(inside).toEqual([]);
            expect(roster).toEqual(['save', 'remove']);
            expect(store.get(player.id)).toBeUndefined();
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

        it('lets go of every claim when an early step of the leave throws, and passes the first on', async () => {
            const { session, world, roster, server } = fakePlayer({ name: 'Leaver' });
            await session.join();
            vi.spyOn(session, 'stopMining').mockImplementation(() => {
                throw new Error('cracks unavailable');
            });
            vi.spyOn(world, 'removePlayer').mockImplementation(() => {
                roster.push('remove');
                throw new Error('world unavailable');
            });

            expect(() => session.leave()).toThrow('cracks unavailable');

            expect(roster).toEqual(['save', 'remove']);
            expect(server.getChatManager().hasJoined('Leaver')).toBe(false);
            expect(session.isConnected()).toBe(false);
        });
    });
});
