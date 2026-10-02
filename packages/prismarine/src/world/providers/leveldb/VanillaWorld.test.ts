import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { UNKNOWN_RUNTIME_ID } from '../../../block/state/BlockRuntimeIds';
import { ChunkTag, decodeChunkKey } from './LevelDBKeys';
import { Database, WriteBatch } from '@jsprismarine/leveldb';
import { decodeData3D, encodeData3D } from './BiomeCodec';
import { decodeLevelDat, encodeLevelDat } from './LevelDat';
import { decodeSubChunk, encodeSubChunk } from './SubChunkCodec';
import { Dimensions } from '../../Dimension';

/**
 * Byte-exact round trip against a world Minecraft actually wrote.
 *
 * Every other test in this directory checks our reader against our writer, which cannot catch a
 * misreading the two share. This one reads what the game produced and asserts that re-encoding it
 * yields the same bytes back.
 *
 * The fixture is not in the repository - it has to come from a real copy of the game. Drop one at
 * `.test/worlds/vanilla-1.21.40/`, or point `JSP_VANILLA_WORLD` at any world folder, and this runs.
 * Without it the suite skips rather than pretending to have checked.
 *
 * **The fixture must be 1.21.40**, the version whose block states this server ships. Byte
 * exactness is only meaningful against a matching version: a palette entry carries the state
 * version it was written at, and an older world's states are normalised to ours on the way in -
 * which is the right thing to do, and is not byte-identical. Checked against a 1.16 world, the
 * packed block data matches exactly and only the palette differs: `version` is rewritten, a
 * property that version no longer has is dropped, and a block since renamed (`minecraft:grass`,
 * now `minecraft:grass_block`) does not resolve at all. Reading worlds older than the shipped
 * block states needs an upgrade table, which is not implemented.
 *
 * To make one: launch Minecraft Bedrock 1.21.40, create a **flat creative** world called
 * `JSPRoundTrip` (flat keeps it small and deterministic), place a chest with something in it and a
 * sign with text on it, spawn a cow and an armour stand, put a block at roughly y=-60 and another
 * at roughly y=300, then save and quit. Copy the folder out of `minecraftWorlds`, and trim it to
 * `db/CURRENT`, `db/MANIFEST-*`, `db/*.ldb`, `level.dat` and `levelname.txt` - the `.log` and
 * `LOCK` files are not wanted and the whole thing should come in under a megabyte.
 */

const FIXTURE = process.env.JSP_VANILLA_WORLD ?? path.resolve(process.cwd(), '.test', 'worlds', 'vanilla-1.21.40');

const available = fs.existsSync(path.join(FIXTURE, 'db', 'CURRENT'));

/** Always on a copy: never open the fixture in place, and never a world the game may have open. */
const openCopy = async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-vanilla-'));
    fs.cpSync(FIXTURE, directory, { recursive: true });

    for (const stale of ['LOCK', 'LOG', 'LOG.old']) {
        fs.rmSync(path.join(directory, 'db', stale), { force: true });
    }

    return { directory, database: await Database.open(path.join(directory, 'db'), { readOnly: true }) };
};

describe.skipIf(!available)('world', () => {
    describe('a world Minecraft wrote', () => {
        it('opens, and holds chunk records', async () => {
            const { directory, database } = await openCopy();
            const keys = [...database.keys()];
            const chunkKeys = keys.map(decodeChunkKey).filter((key) => key !== null);

            expect(keys.length).toBeGreaterThan(0);
            expect(chunkKeys.length).toBeGreaterThan(0);

            await database.close();
            fs.rmSync(directory, { recursive: true, force: true });
        });

        it('re-encodes level.dat to the same bytes', async () => {
            const original = fs.readFileSync(path.join(FIXTURE, 'level.dat'));

            expect(encodeLevelDat(decodeLevelDat(original))).toEqual(original);
        });

        it('re-encodes every sub chunk to the same bytes', async () => {
            const { directory, database } = await openCopy();
            let checked = 0;

            for (const [key, value] of database.entries()) {
                const decoded = decodeChunkKey(key);
                if (decoded?.tag !== ChunkTag.SubChunkPrefix) continue;

                const { subChunk, index } = decodeSubChunk(value);
                const reencoded = encodeSubChunk(subChunk, index ?? decoded.subChunk ?? 0, subChunk.sourceVersion);

                expect(reencoded).toEqual(value);
                checked++;
            }

            expect(checked).toBeGreaterThan(0);
            await database.close();
            fs.rmSync(directory, { recursive: true, force: true });
        });

        it('re-encodes every biome record to the same bytes', async () => {
            const { directory, database } = await openCopy();
            let checked = 0;

            for (const [key, value] of database.entries()) {
                if (decodeChunkKey(key)?.tag !== ChunkTag.Data3D) continue;

                expect(encodeData3D(decodeData3D(value, Dimensions.Overworld), Dimensions.Overworld)).toEqual(value);
                checked++;
            }

            expect(checked).toBeGreaterThan(0);
            await database.close();
            fs.rmSync(directory, { recursive: true, force: true });
        });

        it('resolves every block to one this server knows', async () => {
            // A single unknown id means the palette decoder disagrees with the game about what a
            // block is, which would show up in play as a hole or as the wrong texture.
            const { directory, database } = await openCopy();
            const unknown = new Set<string>();

            for (const [key, value] of database.entries()) {
                const decoded = decodeChunkKey(key);
                if (decoded?.tag !== ChunkTag.SubChunkPrefix) continue;

                for (const storage of decodeSubChunk(value).subChunk.getStorages()) {
                    for (const runtimeId of storage.getPalette()) {
                        if (runtimeId === UNKNOWN_RUNTIME_ID) unknown.add(String(runtimeId));
                    }
                }
            }

            expect([...unknown]).toEqual([]);
            await database.close();
            fs.rmSync(directory, { recursive: true, force: true });
        });

        it('copies whole into a database of our own', async () => {
            // The end-to-end check: everything the game wrote, written out again by our table
            // builder, manifest and log, then read back. This is what exercises the writer at a
            // real world's volume rather than a test fixture's.
            const source = await openCopy();
            const original = new Map(
                [...source.database.entries()].map(([key, value]) => [key.toString('hex'), value])
            );

            const target = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-vanilla-copy-'));
            const written = await Database.open(target);

            const batch = new WriteBatch();
            for (const [key, value] of source.database.entries()) batch.put(key, value);
            written.write(batch);
            await written.close();

            const reopened = await Database.open(target, { readOnly: true });
            const restored = new Map([...reopened.entries()].map(([key, value]) => [key.toString('hex'), value]));

            expect(restored.size).toBe(original.size);
            for (const [key, value] of original) expect(restored.get(key)).toEqual(value);

            await reopened.close();
            await source.database.close();
            fs.rmSync(source.directory, { recursive: true, force: true });
            fs.rmSync(target, { recursive: true, force: true });
        });
    });
});

describe.skipIf(available)('world', () => {
    describe('a world Minecraft wrote', () => {
        it.skip(`needs a fixture at ${FIXTURE} - see the comment at the top of this file`, () => {});
    });
});
