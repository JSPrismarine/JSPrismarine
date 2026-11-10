import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { fakePlayer } from '../../testing/fakePlayer.test.helper';
import PlayerDisconnectEvent from './PlayerDisconnectEvent';
import PlayerMoveEvent from './PlayerMoveEvent';
import PlayerSetGamemodeEvent from './PlayerSetGamemodeEvent';
import { InetAddress } from '@jsprismarine/raknet';

describe('player events', () => {
    it('name the player by its runtime id and login identity', () => {
        const { player } = fakePlayer({ name: 'EventTester' });
        const event = new PlayerSetGamemodeEvent(player, 1);

        expect(event.getRuntimeId()).toBe(player.getRuntimeId());
        expect(event.getIdentity()).toEqual({
            name: 'EventTester',
            xuid: player.getXUID() ?? '',
            uuid: player.getUUID().toString()
        });
        expect(event.getGamemode()).toBe(1);
    });

    it('still hand a listener the player, beside what each one reports', () => {
        const { player } = fakePlayer();
        const to = new Vector3(1, 2, 3);
        const move = new PlayerMoveEvent(player, to);
        const disconnect = new PlayerDisconnectEvent(player, new InetAddress('127.0.0.1', 19132));

        expect(move.getPlayer()).toBe(player);
        expect(move.getTo()).toBe(to);
        expect(disconnect.getPlayer()).toBe(player);
        expect(disconnect.getRuntimeId()).toBe(player.getRuntimeId());
        expect(disconnect.getInetAddr().getAddress()).toBe('127.0.0.1');
    });
});
