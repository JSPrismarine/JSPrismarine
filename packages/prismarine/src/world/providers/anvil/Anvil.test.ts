import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type Server from '../../../Server';
import { stub } from '../../../testing/stub.test.helper';
import type { DimensionType } from '../../Dimension';
import { Dimensions } from '../../Dimension';
import Anvil from './Anvil';

const directories: string[] = [];

const scratch = (): string => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-anvil-'));
    directories.push(directory);
    return directory;
};

afterEach(() => {
    while (directories.length > 0) fs.rmSync(directories.pop()!, { recursive: true, force: true });
});

const provider = (worldPath = scratch()) => ({ worldPath, anvil: new Anvil(worldPath, stub<Server>()) });

/** A dimension that shares the Overworld's bounds under a custom id. */
const custom = (id: string): DimensionType => ({ ...Dimensions.Overworld, id, bedrockId: 1000 });

/**
 * Writes a region file whose 4 KiB location table marks `chunks` as present, with no bodies.
 *
 * The table holds one 4-byte entry per chunk, indexed `(x & 31) + (z & 31) * 32`; a nonzero
 * entry means the chunk has a record.
 */
const writeRegion = (directory: string, rx: number, rz: number, chunks: Array<[number, number]>) => {
    const header = Buffer.alloc(8192);
    for (const [x, z] of chunks) {
        const index = ((x & 31) + (z & 31) * 32) * 4;
        header.writeUInt32BE((2 << 8) | 1, index);
    }
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `r.${rx}.${rz}.mca`), header);
};

describe('Anvil', () => {
    describe('regionDirectory', () => {
        it('keeps the Overworld in the top-level region folder', () => {
            const { worldPath, anvil } = provider();

            expect(anvil.regionDirectory(Dimensions.Overworld)).toBe(path.join(worldPath, 'region'));
        });

        it('places the other vanilla dimensions under dimensions/<namespace>/<path>', () => {
            const { worldPath, anvil } = provider();

            expect(anvil.regionDirectory(Dimensions.Nether)).toBe(
                path.join(worldPath, 'dimensions', 'minecraft', 'the_nether', 'region')
            );
            expect(anvil.regionDirectory(Dimensions.TheEnd)).toBe(
                path.join(worldPath, 'dimensions', 'minecraft', 'the_end', 'region')
            );
        });

        it('splits a custom id into its namespace and path', () => {
            const { worldPath, anvil } = provider();

            expect(anvil.regionDirectory(custom('pack:sky_islands'))).toBe(
                path.join(worldPath, 'dimensions', 'pack', 'sky_islands', 'region')
            );
            expect(anvil.regionDirectory(custom('sky_islands'))).toBe(
                path.join(worldPath, 'dimensions', 'minecraft', 'sky_islands', 'region')
            );
        });

        it('falls back to DIM-1 and DIM1 when only the legacy folder exists', () => {
            const { worldPath, anvil } = provider();
            fs.mkdirSync(path.join(worldPath, 'DIM-1', 'region'), { recursive: true });
            fs.mkdirSync(path.join(worldPath, 'DIM1', 'region'), { recursive: true });

            expect(anvil.regionDirectory(Dimensions.Nether)).toBe(path.join(worldPath, 'DIM-1', 'region'));
            expect(anvil.regionDirectory(Dimensions.TheEnd)).toBe(path.join(worldPath, 'DIM1', 'region'));
        });

        it('prefers the dimensions folder when both layouts exist', () => {
            const { worldPath, anvil } = provider();
            const modern = path.join(worldPath, 'dimensions', 'minecraft', 'the_nether', 'region');
            fs.mkdirSync(path.join(worldPath, 'DIM-1', 'region'), { recursive: true });
            fs.mkdirSync(modern, { recursive: true });

            expect(anvil.regionDirectory(Dimensions.Nether)).toBe(modern);
        });

        it('has no legacy folder for a custom dimension', () => {
            const { worldPath, anvil } = provider();
            fs.mkdirSync(path.join(worldPath, 'DIM-1', 'region'), { recursive: true });

            expect(anvil.regionDirectory(custom('pack:sky_islands'))).toBe(
                path.join(worldPath, 'dimensions', 'pack', 'sky_islands', 'region')
            );
        });
    });

    describe('listChunks', () => {
        it('lists nothing for a dimension without a region folder', () => {
            const { anvil } = provider();

            expect([...anvil.listChunks(Dimensions.Nether)]).toEqual([]);
        });

        it('lists the chunks each region file marks present, offset by the region coordinates', () => {
            const { anvil } = provider();
            writeRegion(anvil.regionDirectory(Dimensions.Nether), 0, 0, [
                [0, 0],
                [5, 7]
            ]);
            writeRegion(anvil.regionDirectory(Dimensions.Nether), -1, 2, [[-1, 95]]);

            const chunks = [...anvil.listChunks(Dimensions.Nether)];

            expect(chunks).toHaveLength(3);
            expect(chunks).toEqual(
                expect.arrayContaining([
                    { x: 0, z: 0 },
                    { x: 5, z: 7 },
                    { x: -1, z: 95 }
                ])
            );
        });

        it('reads the legacy folder when that is where the region files are', () => {
            const { worldPath, anvil } = provider();
            writeRegion(path.join(worldPath, 'DIM1', 'region'), 1, 1, [[33, 40]]);

            expect([...anvil.listChunks(Dimensions.TheEnd)]).toEqual([{ x: 33, z: 40 }]);
        });

        it('skips files that are not region files and headers too short to read', () => {
            const { anvil } = provider();
            const directory = anvil.regionDirectory(Dimensions.Overworld);
            fs.mkdirSync(directory, { recursive: true });
            fs.writeFileSync(path.join(directory, 'r.0.0.mcr'), Buffer.alloc(8192, 1));
            fs.writeFileSync(path.join(directory, 'notes.txt'), '');
            fs.writeFileSync(path.join(directory, 'r.3.3.mca'), Buffer.alloc(100, 1));
            writeRegion(directory, 1, 0, [[32, 0]]);

            expect([...anvil.listChunks(Dimensions.Overworld)]).toEqual([{ x: 32, z: 0 }]);
        });
    });
});
