import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../../.test/reportProgress';
import { IN_TICK_CHUNK_LOADS } from './inTickChunkLoads';

const SOURCE_ROOT = path.resolve(import.meta.dirname, '..');

describe('chunk loads inside a tick', () => {
    it.each(IN_TICK_CHUNK_LOADS)('$path still loads a chunk at its listed call', ({ file, call }) => {
        // An entry whose call is gone has been fixed: remove it, so the count below drops.
        expect(readFileSync(path.join(SOURCE_ROOT, file), 'utf8')).toContain(call);
    });

    it('reports how many paths still admit a chunk in the middle of a tick', () => {
        const bySlice = new Map<number, number>();
        for (const { slice } of IN_TICK_CHUNK_LOADS) bySlice.set(slice, (bySlice.get(slice) ?? 0) + 1);
        const slices = [...bySlice]
            .sort(([left], [right]) => left - right)
            .map(([slice, count]) => `slice ${slice}: ${count}`)
            .join(', ');
        reportProgress(
            `${IN_TICK_CHUNK_LOADS.length} paths still load a chunk from inside a tick (${slices})`,
            'In-tick chunk loads'
        );
    });
});
