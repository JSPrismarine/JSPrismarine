import { describe, expect, it } from 'vitest';

import { readContentArchive } from './archive';
import { writeZip } from './zip';

const encoder = new TextEncoder();
const files = (entries: Record<string, string>): Map<string, Uint8Array> =>
    new Map(Object.entries(entries).map(([name, text]) => [name, encoder.encode(text)]));
const namesOf = (archive: ReturnType<typeof readContentArchive>) =>
    archive.members.map(({ name, kind, files: members }) => [name, kind, [...members.keys()].sort()]);

describe('readContentArchive', () => {
    it('reads an .mcpack as one pack, at its root or inside its only folder', () => {
        expect(namesOf(readContentArchive(writeZip(files({ 'manifest.json': '{}', 'a.json': '{}' }))))).toEqual([
            ['', 'pack', ['a.json', 'manifest.json']]
        ]);
        expect(namesOf(readContentArchive(writeZip(files({ 'BP/manifest.json': '{}' }))))).toEqual([
            ['', 'pack', ['manifest.json']]
        ]);
    });

    it('reads an .mcworld as one world, a template with its manifest included', () => {
        const template = writeZip(files({ 'level.dat': '', 'manifest.json': '{}', 'db/CURRENT': '' }));

        expect(namesOf(readContentArchive(template))).toEqual([
            ['', 'world', ['db/CURRENT', 'level.dat', 'manifest.json']]
        ]);
    });

    it('reads every pack and world an .mcaddon holds, nested or in folders', () => {
        const addon = writeZip(
            new Map([
                ['behavior.mcpack', writeZip(files({ 'manifest.json': '{}' }))],
                ['map.mcworld', writeZip(files({ 'level.dat': '' }))],
                ...files({ 'RP/manifest.json': '{}', 'RP/textures/a.png': '', 'readme.txt': 'hi' })
            ])
        );

        expect(readContentArchive(addon).problems).toEqual([]);
        expect(namesOf(readContentArchive(addon))).toEqual([
            ['behavior.mcpack', 'pack', ['manifest.json']],
            ['map.mcworld', 'world', ['level.dat']],
            ['RP/', 'pack', ['manifest.json', 'textures/a.png']]
        ]);
    });

    it('lists a nested archive that is no pack as a problem and reads the rest', () => {
        const addon = writeZip(
            new Map([
                ['broken.mcpack', encoder.encode('not a zip')],
                ['empty.mcpack', writeZip(files({ 'readme.txt': '' }))],
                ['good.mcpack', writeZip(files({ 'manifest.json': '{}' }))]
            ])
        );

        const archive = readContentArchive(addon);

        expect(archive.problems.map(({ name }) => name)).toEqual(['broken.mcpack', 'empty.mcpack']);
        expect(archive.members.map(({ name }) => name)).toEqual(['good.mcpack']);
    });

    it('lists a nested archive with a broken central directory as a problem, keeping its siblings', () => {
        const good = writeZip(files({ 'manifest.json': '{}' }));
        // A zip's local header up front, so it looks like a zip, and its directory cut off.
        const broken = good.subarray(0, good.byteLength - 10);
        const addon = writeZip(
            new Map([
                ['broken.mcpack', broken],
                ['good.mcpack', good]
            ])
        );

        const archive = readContentArchive(addon);

        expect(archive.problems.map(({ name }) => name)).toEqual(['broken.mcpack']);
        expect(archive.members.map(({ name }) => name)).toEqual(['good.mcpack']);
    });

    it('lets the caller refuse the entries of a nested archive', () => {
        const addon = writeZip(new Map([['a.mcpack', writeZip(files({ 'manifest.json': '{}', '../x': '' }))]]));
        const seen: string[][] = [];

        expect(() =>
            readContentArchive(addon, {
                check: (entries) => {
                    seen.push([...entries.keys()]);
                    if (entries.has('../x')) throw new TypeError('unsafe');
                }
            })
        ).toThrow('unsafe');
        expect(seen).toEqual([['a.mcpack'], ['manifest.json', '../x']]);
    });
});
