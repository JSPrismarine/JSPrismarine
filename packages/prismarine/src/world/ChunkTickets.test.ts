import { describe, expect, it } from 'vitest';

import Chunk from './chunk/Chunk';
import { ChunkTickets, chunksOfBlockBox } from './ChunkTickets';

/** A host whose chunks load only when the test says so, counting each load it is asked to start. */
const hostOf = () => {
    const loaded = new Set<number>();
    const loading = new Set<number>();
    const starts: string[] = [];
    return {
        loaded,
        starts,
        arrive: (x: number, z: number) => {
            loading.delete(Chunk.packXZ(x, z));
            loaded.add(Chunk.packXZ(x, z));
        },
        host: {
            isLoaded: (x: number, z: number) => loaded.has(Chunk.packXZ(x, z)),
            load: (x: number, z: number) => {
                if (loading.has(Chunk.packXZ(x, z))) return false;
                loading.add(Chunk.packXZ(x, z));
                starts.push(`${x},${z}`);
                return true;
            }
        }
    };
};

describe('ChunkTickets', () => {
    it('answers at once and starts one load per missing chunk, however often it is asked', () => {
        const { host, starts, arrive } = hostOf();
        const tickets = new ChunkTickets(host);
        const chunks = [
            { x: 0, z: 0 },
            { x: 1, z: 0 }
        ];

        expect(tickets.request('fight', chunks)).toBe(false);
        expect(tickets.request('fight', chunks)).toBe(false);
        expect(tickets.request('fight', chunks)).toBe(false);
        expect(starts).toEqual(['0,0', '1,0']);
        expect(tickets.loadsStarted).toBe(2);

        arrive(1, 0);
        expect(tickets.request('fight', chunks)).toBe(false);
        arrive(0, 0);
        expect(tickets.request('fight', chunks)).toBe(true);
        expect(tickets.loadsStarted).toBe(2);
    });

    it('holds a chunk while any ticket names it, and lets it go when the last is released', () => {
        const { host } = hostOf();
        const tickets = new ChunkTickets(host);

        tickets.request('arena', [{ x: 0, z: 0 }]);
        tickets.request('death', [
            { x: 0, z: 0 },
            { x: 5, z: 3 }
        ]);
        expect(tickets.holds(0, 0)).toBe(true);
        expect(tickets.holds(5, 3)).toBe(true);

        tickets.release('death');
        expect(tickets.holds(0, 0)).toBe(true);
        expect(tickets.holds(5, 3)).toBe(false);
        expect(tickets.has('death')).toBe(false);

        tickets.release('arena');
        tickets.release('arena');
        expect(tickets.holds(0, 0)).toBe(false);
    });

    it('replaces an owner ticket on a second request', () => {
        const { host } = hostOf();
        const tickets = new ChunkTickets(host);

        tickets.request('pillar', [{ x: 2, z: 2 }]);
        tickets.request('pillar', [{ x: -3, z: 1 }]);
        expect(tickets.holds(2, 2)).toBe(false);
        expect(tickets.holds(-3, 1)).toBe(true);
    });

    it('lists the chunks of a block box, edges included', () => {
        expect(chunksOfBlockBox(-8, -8, 8, 8)).toEqual([
            { x: -1, z: -1 },
            { x: -1, z: 0 },
            { x: 0, z: -1 },
            { x: 0, z: 0 }
        ]);
        expect(chunksOfBlockBox(-79, 55, -77, 57)).toEqual([{ x: -5, z: 3 }]);
    });
});
