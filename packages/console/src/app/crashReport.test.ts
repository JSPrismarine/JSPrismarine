import { describe, expect, it } from 'vitest';

import { parseCrash } from './crashReport';

describe('parseCrash', () => {
    it('takes the last trace: its error line, its frames and where each frame points', () => {
        const crash = parseCrash([
            'Error: an earlier, handled one',
            '    at Old.place (file:///repo/packages/old/dist/Old.js:1:1)',
            'some unrelated output',
            'RangeError: The chunk at 12, -4 has no reference left to release.',
            '    at ChunkHolder.release (file:///repo/packages/chunkgen/dist/ChunkHolder.js:133:19)',
            '    at async Promise.all (index 0)',
            ''
        ]);

        expect(crash.error).toMatch(/^RangeError/);
        expect(crash.frames).toHaveLength(2);
        expect(crash.frames[0]?.location).toEqual({
            path: '/repo/packages/chunkgen/dist/ChunkHolder.js',
            line: 133,
            column: 19
        });
        expect(crash.frames[1]?.location).toBeUndefined();
        expect(crash.trace.split('\n')).toHaveLength(3);
    });

    it('falls back to the last line printed when there is no trace', () => {
        const crash = parseCrash(['starting', 'listen EADDRINUSE: address already in use :::19132', '  ']);
        expect(crash.error).toMatch(/EADDRINUSE/);
        expect(crash.frames).toHaveLength(0);
    });

    it('reports nothing for a crash that printed nothing', () => {
        expect(parseCrash([])).toEqual({ error: undefined, frames: [], trace: '' });
    });
});
