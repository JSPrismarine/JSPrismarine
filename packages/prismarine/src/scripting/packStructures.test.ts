import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { packStructuresOf } from './packStructures';

/** The pack the `pack-structures` parity scenario runs on BDS, with its three structure files. */
const SCENARIO_PACK = fileURLToPath(new URL('../../../parity/scenarios/pack-structures/structures', import.meta.url));

const directories: string[] = [];
afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A copy of the scenario pack, with `extra` files written over it. */
const packWith = (extra: Record<string, Uint8Array | string> = {}): string => {
    const directory = mkdtempSync(path.join(tmpdir(), 'jsp-pack-structures-'));
    directories.push(directory);
    cpSync(SCENARIO_PACK, directory, { recursive: true });
    for (const [file, content] of Object.entries(extra)) {
        mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
        writeFileSync(path.join(directory, file), content);
    }
    return directory;
};

/** Resolves nothing, so a structure keeps the states its file wrote. */
const unresolved = () => undefined;

describe('packStructuresOf', () => {
    it('names a file by its folder under structures/, and one at the top in the mystructure namespace', () => {
        const structures = packStructuresOf([packWith()], unresolved, () => {});

        expect([...structures.ids()].sort()).toEqual(['jsp:pad', 'jsp:pad2', 'mystructure:top']);
        expect(structures.get('jsp:top')).toBeUndefined();
    });

    it('reads a structure with its palette, and -1 where the file changes nothing', () => {
        const pad = packStructuresOf([packWith()], unresolved, () => {}).get('jsp:pad');

        expect(pad?.size).toEqual({ x: 2, y: 2, z: 1 });
        // x outermost, then y, then z: stone, air, the oak log, and the position left out.
        expect(pad?.blocks.map((index) => (index < 0 ? null : pad.palette[index]?.typeId))).toEqual([
            'minecraft:stone',
            'minecraft:air',
            'minecraft:oak_log',
            null
        ]);
        expect(pad?.palette[1]).toEqual({ typeId: 'minecraft:oak_log', states: { pillar_axis: 'x' } });
    });

    it('lets a later pack replace an earlier one’s file, and skips a file it cannot read', () => {
        const warnings: string[] = [];
        const broken = packWith({ 'structures/jsp/pad.mcstructure': 'not nbt' });
        const structures = packStructuresOf([packWith(), broken], unresolved, (message) => warnings.push(message));

        expect(structures.get('jsp:pad')).toBeUndefined();
        expect(warnings).toHaveLength(1);
        expect(structures.get('mystructure:top')?.palette[0]?.typeId).toBe('minecraft:glass');
    });
});
