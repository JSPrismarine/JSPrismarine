import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { textFiles, writeBrarchive, writeZip } from '../fixtures/writers';
import { expandSource } from './sources';

const temporaryDirs: string[] = [];
const temporaryDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'jsp-sources-'));
    temporaryDirs.push(dir);
    return dir;
};
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** A pack folder with a manifest, one definition, one structure and one brarchive. */
const packFolder = (): string => {
    const pack = temporaryDir();
    writeFileSync(join(pack, 'manifest.json'), '{"format_version": 2}');
    mkdirSync(join(pack, 'entities'));
    writeFileSync(join(pack, 'entities', 'robot.json'), '{}');
    mkdirSync(join(pack, 'structures'));
    writeFileSync(join(pack, 'structures', 'village.nbt'), 'not json');
    mkdirSync(join(pack, '__brarchive'));
    writeFileSync(
        join(pack, '__brarchive', 'loot_tables.brarchive'),
        writeBrarchive(textFiles({ 'loot_tables/stone.json': '{}', 'loot_tables/notes.txt': 'hi' }))
    );
    return pack;
};

describe('expandSource', () => {
    it('reads every file in a pack folder by default', () => {
        const [pack] = expandSource({ kind: 'directory', path: packFolder() }, []);

        expect([...pack!.files.keys()].sort()).toEqual([
            'entities/robot.json',
            'loot_tables/notes.txt',
            'loot_tables/stone.json',
            'manifest.json',
            'structures/village.nbt'
        ]);
    });

    it('drops the files a filter turns down, members of a brarchive included', () => {
        const [pack] = expandSource({ kind: 'directory', path: packFolder() }, [], (path) => path.endsWith('.json'));

        expect([...pack!.files.keys()].sort()).toEqual([
            'entities/robot.json',
            'loot_tables/stone.json',
            'manifest.json'
        ]);
    });

    it('reads the manifest whatever the filter says, since a pack has no name without it', () => {
        const [pack] = expandSource({ kind: 'directory', path: packFolder() }, [], () => false);

        expect([...pack!.files.keys()]).toEqual(['manifest.json']);
    });

    it('applies the filter to an archive too', () => {
        const archive = join(temporaryDir(), 'pack.mcpack');
        writeFileSync(
            archive,
            writeZip(
                textFiles({
                    'manifest.json': '{"format_version": 2}',
                    'entities/robot.json': '{}',
                    'texts/en_US.lang': 'robot=Robot'
                })
            )
        );

        const [pack] = expandSource({ kind: 'archive', path: archive }, [], (path) => path.endsWith('.json'));

        expect([...pack!.files.keys()].sort()).toEqual(['entities/robot.json', 'manifest.json']);
    });
});
