import { describe, expect, it } from 'vitest';

import { PortAllocator } from './PortAllocator';
import type { PortSelectionStrategy } from './PortAllocator';

describe('PortAllocator', () => {
    it('spreads peers over the range, lowest port first, and reuses ports once all are in use', () => {
        const allocator = new PortAllocator({ start: 19620, end: 19622 });

        expect(Array.from({ length: 7 }, () => allocator.acquire())).toStrictEqual([
            19620, 19621, 19622, 19620, 19621, 19622, 19620
        ]);
        expect(allocator.loads()).toStrictEqual([
            { port: 19620, peers: 3 },
            { port: 19621, peers: 2 },
            { port: 19622, peers: 2 }
        ]);
    });

    it('gives a released port to the next peer', () => {
        const allocator = new PortAllocator({ start: 19620, end: 19621 });
        allocator.acquire();
        allocator.acquire();

        allocator.release(19620);

        expect(allocator.acquire()).toBe(19620);
    });

    it('puts every peer on a single port', () => {
        const allocator = new PortAllocator({ start: 19620, end: 19620 });

        expect([allocator.acquire(), allocator.acquire(), allocator.acquire()]).toStrictEqual([19620, 19620, 19620]);
    });

    it('follows the strategy it is given', () => {
        const seen: number[][] = [];
        const highest: PortSelectionStrategy = {
            select: (ports) => {
                seen.push(ports.map((load) => load.peers));
                return ports.at(-1)!.port;
            }
        };
        const allocator = new PortAllocator({ start: 19620, end: 19622 }, highest);

        expect([allocator.acquire(), allocator.acquire()]).toStrictEqual([19622, 19622]);
        expect(seen).toStrictEqual([
            [0, 0, 0],
            [0, 0, 1]
        ]);
    });

    it('refuses a strategy that picks a port outside the range', () => {
        const allocator = new PortAllocator({ start: 19620, end: 19621 }, { select: () => 1 });

        expect(() => allocator.acquire()).toThrow(RangeError);
    });
});
