import { describe, expect, it } from 'vitest';

import { deferred, ManualTransport, manualAddress, settle } from '../../testing/manualTransport.test.helper';
import MultiTransport from './MultiTransport';
import type { Transport } from './Transport';

/** Two manual children built by the composite, so they share its allocator. */
const pair = () => {
    let raknet!: ManualTransport;
    let nethernet!: ManualTransport;
    const transport = new MultiTransport((ids) => {
        raknet = new ManualTransport(ids);
        nethernet = new ManualTransport(ids);
        return [raknet, nethernet];
    });
    return { transport, raknet, nethernet };
};

describe('network/transport/MultiTransport', () => {
    it('numbers every child connection from one sequence, so IDs never collide', () => {
        const { raknet, nethernet } = pair();

        // The same wire key on two transports is two different clients.
        expect([raknet.connect('peer'), nethernet.connect('peer'), raknet.connect('other')]).toStrictEqual([1, 2, 3]);
    });

    it("forwards every child's connects, frames and disconnects to one set of listeners", async () => {
        const { transport, raknet, nethernet } = pair();
        const seen: string[] = [];
        transport.onConnect((connection) => void seen.push(`connect ${connection.id}`));
        transport.onFrame((payload, id) => void seen.push(`frame ${id} ${payload.toString()}`));
        transport.onDisconnect(
            (id, address, reason) => void seen.push(`disconnect ${id} ${address.toString()} ${reason}`)
        );

        raknet.connect('10.0.0.2:19132');
        nethernet.connect('7');
        nethernet.frame('7', 'batch');
        raknet.disconnect('10.0.0.2:19132', 'timeout');
        await settle();

        // Sorted: different connections are not ordered against each other.
        expect([...seen].sort()).toStrictEqual(
            ['connect 1', 'connect 2', 'frame 2 batch', `disconnect 1 ${manualAddress.toString()} timeout`].sort()
        );
    });

    it("keeps a child's ordering while a forwarded listener awaits", async () => {
        const { transport, raknet } = pair();
        const seen: string[] = [];
        const slowConnect = deferred();
        transport.onConnect(async (connection) => {
            await slowConnect.promise;
            seen.push(`connect ${connection.id}`);
        });
        transport.onFrame((payload) => void seen.push(`frame ${payload.toString()}`));

        raknet.connect('a');
        raknet.frame('a', 'first');
        await settle();
        expect(seen).toStrictEqual([]);

        slowConnect.resolve();
        await settle();
        expect(seen).toStrictEqual(['connect 1', 'frame first']);
    });

    it('forwards raw datagrams only from children that carry them', async () => {
        let withRaw!: ManualTransport;
        const withoutRaw: Transport = {
            onConnect: () => {},
            onDisconnect: () => {},
            onFrame: () => {},
            close: () => {}
        };
        const transport = new MultiTransport((ids) => {
            withRaw = new ManualTransport(ids);
            return [withoutRaw, withRaw];
        });
        const raw: string[] = [];
        transport.onRaw((payload, address) => void raw.push(`${payload.toString()} from ${address.toString()}`));

        await withRaw.sendRaw('query');

        expect(raw).toStrictEqual([`query from ${manualAddress.toString()}`]);
    });

    it('closes every child, even after one throws', () => {
        const children: ManualTransport[] = [];
        const transport = new MultiTransport((ids) => {
            children.push(new ManualTransport(ids), new ManualTransport(ids), new ManualTransport(ids));
            children[1]!.close = () => {
                throw new Error('socket already gone');
            };
            return children;
        });

        expect(() => transport.close()).toThrow('socket already gone');
        expect(children[0]!.closes).toBe(1);
        expect(children[2]!.closes).toBe(1);
    });
});
