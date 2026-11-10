import { describe, expect, it } from 'vitest';

import { ManualTransport, settle } from '../../testing/manualTransport.test.helper';
import { ConnectionIds } from './ConnectionId';

describe('network/transport/KeyedTransport', () => {
    it('numbers connections in the order they are accepted, starting at 1', () => {
        const transport = new ManualTransport();

        expect([transport.connect('a'), transport.connect('b'), transport.connect('c')]).toStrictEqual([1, 2, 3]);
    });

    it('gives a peer that reconnects under the same key a new ID', async () => {
        // RakNet frees an address the moment a session ends, and a client often comes back
        // from the same port. The old connection's late teardown must not reach the new one.
        const transport = new ManualTransport();
        const seen: string[] = [];
        transport.onDisconnect((id) => void seen.push(`disconnect ${id}`));
        transport.onFrame((payload, id) => void seen.push(`frame ${id} ${payload.toString()}`));

        const first = transport.connect('10.0.0.2:19132');
        transport.disconnect('10.0.0.2:19132', 'timeout');
        const second = transport.connect('10.0.0.2:19132');
        transport.frame('10.0.0.2:19132', 'hello');
        await settle();

        expect(first).toBe(1);
        expect(second).toBe(2);
        expect(seen).toStrictEqual(['disconnect 1', 'frame 2 hello']);
    });

    it('never gives two transports sharing an allocator the same ID, even for the same key', () => {
        const ids = new ConnectionIds();
        const raknet = new ManualTransport(ids);
        const nethernet = new ManualTransport(ids);

        expect([raknet.connect('peer'), nethernet.connect('peer'), raknet.connect('other')]).toStrictEqual([1, 2, 3]);
    });

    it('refuses a second live connection under a key and closes the newcomer', async () => {
        const transport = new ManualTransport();
        const connected: number[] = [];
        transport.onConnect((connection) => void connected.push(connection.id));

        expect(transport.connect('a')).toBe(1);
        expect(transport.connect('a')).toBeUndefined();
        await settle();

        expect(connected).toStrictEqual([1]);
        expect(transport.refused).toStrictEqual(['Duplicate connection']);
    });

    it('drops frames and disconnects for keys it never accepted', async () => {
        const transport = new ManualTransport();
        const seen: string[] = [];
        transport.onFrame(() => void seen.push('frame'));
        transport.onDisconnect(() => void seen.push('disconnect'));

        transport.frame('ghost', 'boo');
        transport.disconnect('ghost', 'gone');
        await settle();

        expect(seen).toStrictEqual([]);
    });
});
