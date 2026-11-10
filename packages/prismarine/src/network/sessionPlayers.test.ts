import { describe, expect, it } from 'vitest';

import { fakePlayer } from '../testing/fakePlayer.test.helper';
import { LegacyPlayers } from './sessionPlayers';

describe('a session and the player it speaks for', () => {
    it('holds the entity id and the login identity, not the player', () => {
        const { player } = fakePlayer({ name: 'Alex' });
        const session = player.getNetworkSession();

        expect(session.runtimeId).toBe(player.getRuntimeId());
        expect(session.identity).toEqual({ name: 'Alex', xuid: '', uuid: player.getUUID().toString() });
        expect(Object.values(session)).not.toContain(player);
    });

    it('finds the player in the server directory by that id', () => {
        const { player, server } = fakePlayer();
        const session = player.getNetworkSession();
        const players = server.getSessionManager().getLegacyPlayers();

        expect(players.of(Number(session.runtimeId))).toBe(player);
        expect(session.getPlayer()).toBe(player);
    });

    it('forgets the player when it is disabled, and is safe to disable again', () => {
        const { player, server } = fakePlayer();
        const session = player.getNetworkSession();

        session.disable();
        session.disable();

        expect(server.getSessionManager().getLegacyPlayers().of(Number(session.runtimeId))).toBeUndefined();
        expect(session.isConnected()).toBe(false);
        expect(() => session.getPlayer()).toThrow(/has left/);
    });

    it('keeps the id and the identity after the player has left', () => {
        const { player } = fakePlayer({ name: 'Sam' });
        const session = player.getNetworkSession();

        session.disable();

        expect(session.runtimeId).toBe(player.getRuntimeId());
        expect(session.identity.name).toBe('Sam');
    });
});

describe('LegacyPlayers', () => {
    it('files a player under its runtime id until it is deleted', () => {
        const { player } = fakePlayer();
        const players = new LegacyPlayers();
        const id = Number(player.getRuntimeId());

        players.add(player);
        expect(players.of(id)).toBe(player);
        expect(players.of(id + 1)).toBeUndefined();

        expect(players.delete(id)).toBe(true);
        expect(players.delete(id)).toBe(false);
        expect(players.of(id)).toBeUndefined();
    });
});
