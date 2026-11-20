import { describe, expect, it } from 'vitest';

import type { ScenarioCoverageMap } from './scenario-coverage-map.mts';
import { mergeScenarioCoverageMaps, parseHunks, scenariosReaching } from './scenario-coverage-map.mts';

/**
 * `Furnace.ts`: its module runs at boot. `smelt` (lines 10 to 30) ran in `furnace` and holds
 * `fuel` (15 to 20), which ran in `lit-furnace`. `unused` (40 to 45) never ran.
 */
const map: ScenarioCoverageMap = {
    version: 1,
    scenarios: ['furnace', 'lit-furnace'],
    files: {
        'packages/prismarine/src/Furnace.ts': {
            module: [-1],
            functions: [
                [10, 30, 0],
                [15, 20, 1],
                [40, 45]
            ]
        },
        'packages/prismarine/src/Lazy.ts': { module: [1], functions: [] }
    }
};

describe('parseHunks', () => {
    it('reads the base side of each hunk header', () => {
        const patch = '@@ -12,3 +12,4 @@ class Furnace\n context\n-old\n+new\n@@ -40 +41,0 @@\n-gone';
        expect(parseHunks(patch)).toEqual([
            { start: 12, count: 3 },
            { start: 40, count: 1 }
        ]);
    });
});

describe('scenariosReaching', () => {
    const reach = (start: number, count: number, file = 'packages/prismarine/src/Furnace.ts') =>
        scenariosReaching(map, file, [{ start, count }]);

    it('gives a changed line to the innermost function around it', () => {
        expect(reach(12, 1)).toEqual(['furnace']);
        expect(reach(16, 2)).toEqual(['lit-furnace']);
        expect(reach(19, 4)).toEqual(['lit-furnace', 'furnace']);
    });

    it('reaches nothing through a function nobody ran, or a file nobody ran', () => {
        expect(reach(41, 1)).toEqual([]);
        expect(reach(1, 1, 'packages/prismarine/src/Never.ts')).toEqual([]);
    });

    it('reaches everything through top-level code that ran outside every scenario', () => {
        expect(reach(2, 1)).toBe('all');
    });

    it('gives top-level code to whoever loaded the module', () => {
        expect(reach(1, 1, 'packages/prismarine/src/Lazy.ts')).toEqual(['lit-furnace']);
    });

    it('gives lines added between two others to both of them', () => {
        expect(reach(30, 0)).toBe('all');
        expect(reach(14, 0)).toEqual(['furnace', 'lit-furnace']);
    });
});

describe('mergeScenarioCoverageMaps', () => {
    it('merges owners by scenario name', () => {
        const other: ScenarioCoverageMap = {
            version: 1,
            scenarios: ['chat', 'furnace'],
            files: { 'packages/prismarine/src/Furnace.ts': { module: [-1], functions: [[40, 45, 0]] } }
        };
        const merged = mergeScenarioCoverageMaps([map, other]);

        expect(merged.scenarios).toEqual(['furnace', 'lit-furnace', 'chat']);
        expect(merged.files['packages/prismarine/src/Furnace.ts']?.functions).toEqual([
            [10, 30, 0],
            [15, 20, 1],
            [40, 45, 2]
        ]);
    });
});
