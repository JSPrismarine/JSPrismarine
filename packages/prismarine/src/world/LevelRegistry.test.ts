import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LevelRegistry } from './LevelRegistry';

const ID = '6e714018-3251-45c9-9c56-9188446848ce';

let scratch: string;
beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-level-registry-'));
});
afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
});

describe('LevelRegistry', () => {
    it('reads a missing file as empty, and keeps only the entries that are levels', async () => {
        const file = path.join(scratch, 'levels.json');
        const registry = new LevelRegistry(file, { info: () => {} });
        await registry.load();
        expect(registry.all()).toEqual([]);

        const arena = {
            name: 'arena',
            folder: 'arena',
            state: 'attached',
            world: { seed: '1', preset: 'minecraft:flat' }
        };
        fs.writeFileSync(
            file,
            JSON.stringify({
                schemaVersion: 1,
                levels: {
                    [ID.toUpperCase()]: arena,
                    'not-a-uuid': arena,
                    'aa52733-889b-4c87-abcb-f064ea7735a2': arena,
                    '13f251b3-41c9-4271-b2d1-d4abde28890b': { ...arena, state: 'gone' },
                    '6f0d5d6a-0f5c-4a59-9c7b-0d2e9c0b1a11': { ...arena, world: { preset: 'minecraft:flat' } }
                }
            })
        );
        await registry.load();

        expect(registry.all()).toEqual([{ id: ID, ...arena }]);
        expect(registry.get(ID.toUpperCase())?.name).toBe('arena');
    });
});
