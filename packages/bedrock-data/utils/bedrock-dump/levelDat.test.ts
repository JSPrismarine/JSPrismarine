import { describe, expect, it } from 'vitest';

import { renderLevelDat } from './levelDat.ts';
import { SaveCursor } from './reader.ts';

describe('renderLevelDat', () => {
    it('writes the header and a compound with the experiments on and the generator', () => {
        const bytes = renderLevelDat({ experiments: ['gametest'], generator: 2 });

        expect(bytes.readInt32LE(0)).toBe(10);
        expect(bytes.readInt32LE(4)).toBe(bytes.byteLength - 8);
        expect(new SaveCursor(bytes.subarray(8)).compound()).toEqual({
            experiments: { gametest: 1, experiments_ever_used: 1, saved_with_toggled_experiments: 1 },
            Generator: 2
        });
    });
});
