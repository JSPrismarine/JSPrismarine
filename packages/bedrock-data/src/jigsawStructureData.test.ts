import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import BinaryStream from '@jsprismarine/binaryutils';
import type { NBTTagCompound } from '@jsprismarine/nbt';
import { ByteOrder, NBTReader, NBTWriter } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

/** The golden itself, rather than the copy `utils/build.js` bakes into the package. */
const jigsaw_structure_data = readFileSync(join(import.meta.dirname, 'jsp/v2193/jigsaw_structure_data.nbt'));

/**
 * Guards the canonical form of the jigsaw golden.
 *
 * The engine writes `template_pools` out of an unordered container, so two captures of one
 * server carry the same pools in a different order. `packages/client/tools/capture-server-data.mjs`
 * sorts all four registries by identifier before writing, which is invisible to a client -
 * every entry names itself and every reference between the registries is by that name - and
 * makes a recapture of an unchanged server an empty diff. A golden that is not sorted came
 * from a capture that skipped the sort.
 */

const parse = (): NBTTagCompound => {
    const stream = new BinaryStream(jigsaw_structure_data);
    const reader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
    reader.setUseVarint(true);
    return reader.parse();
};

const registries = (root: NBTTagCompound): [string, Set<NBTTagCompound>][] =>
    [...root.entries()].filter((entry): entry is [string, Set<NBTTagCompound>] => entry[1] instanceof Set);

const identifierOf = (entry: NBTTagCompound): string =>
    entry.getCompound('description', false)?.getString('identifier', '') ?? '';

describe('bedrock-data', () => {
    describe('jigsaw_structure_data', () => {
        it('carries the four registries a 2193 client reads', () => {
            expect(registries(parse()).map(([name]) => name)).toEqual([
                'jigsaws',
                'processors',
                'structure_sets',
                'template_pools'
            ]);
        });

        it('names every entry, so nothing in it is found by position', () => {
            for (const [name, registry] of registries(parse())) {
                for (const entry of registry) expect(identifierOf(entry), `an entry of ${name}`).not.toBe('');
            }
        });

        it('lists every registry in identifier order', () => {
            for (const [name, registry] of registries(parse())) {
                const identifiers = [...registry].map(identifierOf);
                expect(identifiers, name).toEqual([...identifiers].sort((a, b) => a.localeCompare(b)));
            }
        });

        it('re-encodes to the bytes it was read from', () => {
            // What lets the capture sort the registries at all: the parse keeps everything the
            // payload says, so writing it back is the same payload rather than a near miss.
            const out = new BinaryStream();
            const writer = new NBTWriter(out, ByteOrder.LITTLE_ENDIAN);
            writer.setUseVarint(true);
            writer.writeCompound(parse());

            expect(out.getBuffer().equals(jigsaw_structure_data)).toBe(true);
        });
    });
});
