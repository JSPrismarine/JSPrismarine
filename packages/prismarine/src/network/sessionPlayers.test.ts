import { describe, expect, it } from 'vitest';

import { fakePlayer } from '../testing/fakePlayer.test.helper';

describe('a session and the player it speaks for', () => {
    it('holds the entity id and the login identity, not the player', () => {
        const { session, player } = fakePlayer({ name: 'Alex' });

        expect(session.runtimeId).toBe(player.getRuntimeId());
        expect(session.identity).toEqual({ name: 'Alex', xuid: '', uuid: player.getUUID().toString() });
        expect(Object.values(session)).not.toContain(player);
    });

    it("finds the store player in the server's directory by that id", () => {
        const { session, player, server } = fakePlayer();
        const players = server.getStorePlayers();

        expect(players.of(Number(session.runtimeId))).toBe(player);
        expect(session.getPlayer()).toBe(player);
    });

    it('forgets the player when it is disabled, and is safe to disable again', () => {
        const { session, server } = fakePlayer();

        session.disable();
        session.disable();

        expect(server.getStorePlayers().of(Number(session.runtimeId))).toBeUndefined();
        expect(session.isConnected()).toBe(false);
        expect(() => session.getPlayer()).toThrow(/has left/);
    });

    it('keeps the id and the identity after the player has left', () => {
        const { session, player } = fakePlayer({ name: 'Sam' });

        session.disable();

        expect(session.runtimeId).toBe(player.getRuntimeId());
        expect(session.identity.name).toBe('Sam');
    });
});
