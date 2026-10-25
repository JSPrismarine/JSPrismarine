import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { textFiles, writeBrarchive, writeZip } from '../fixtures/writers';
import type { Diagnostic } from './diagnostics';
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

/**
 * A `behavior_packs` folder the way BDS ships one: two packs' layers side by
 * side, each pack's layers sharing one header UUID.
 */
const VANILLA = '0c000000-0000-4000-8000-000000000001';
const CHEMISTRY = '0d000000-0000-4000-8000-000000000001';

const layerFolder = (): string => {
    const root = temporaryDir();
    for (const [folder, uuid] of [
        ['vanilla', VANILLA],
        ['vanilla_1.14', VANILLA],
        ['vanilla_1.26.50', VANILLA],
        ['chemistry', CHEMISTRY],
        ['chemistry_1.26.40', CHEMISTRY]
    ] as const) {
        mkdirSync(join(root, folder));
        writeFileSync(
            join(root, folder, 'manifest.json'),
            JSON.stringify({ format_version: 2, header: { uuid }, modules: [{ type: 'data' }] })
        );
    }
    mkdirSync(join(root, 'unreadable'));
    writeFileSync(join(root, 'unreadable', 'manifest.json'), '{ not json');
    return root;
};

const origins = (packs: readonly { origin: string }[]): string[] => packs.map((pack) => basename(pack.origin));

describe('expandSource over a folder of brarchive layers', () => {
    it('composes every pack in the folder when the caller names none', () => {
        expect(origins(expandSource({ kind: 'brarchiveLayers', path: layerFolder() }, [])).sort()).toEqual([
            'chemistry',
            'chemistry_1.26.40',
            'unreadable',
            'vanilla',
            'vanilla_1.14',
            'vanilla_1.26.50'
        ]);
    });

    it('keeps only the layers of the packs the caller named, in version order', () => {
        const diagnostics: Diagnostic[] = [];
        const packs = expandSource({ kind: 'brarchiveLayers', path: layerFolder(), uuids: [VANILLA] }, diagnostics);

        expect(origins(packs)).toEqual(['vanilla', 'vanilla_1.14', 'vanilla_1.26.50']);
        expect(diagnostics).toEqual([]);
    });

    it('composes two named packs together', () => {
        const packs = expandSource({ kind: 'brarchiveLayers', path: layerFolder(), uuids: [VANILLA, CHEMISTRY] }, []);

        expect(origins(packs).sort()).toEqual([
            'chemistry',
            'chemistry_1.26.40',
            'vanilla',
            'vanilla_1.14',
            'vanilla_1.26.50'
        ]);
    });

    it('reports a UUID no pack in the folder declares, rather than composing nothing in silence', () => {
        const unknown = '0f000000-0000-4000-8000-000000000001';
        const diagnostics: Diagnostic[] = [];
        const packs = expandSource(
            { kind: 'brarchiveLayers', path: layerFolder(), uuids: [VANILLA, unknown] },
            diagnostics
        );

        expect(origins(packs)).toEqual(['vanilla', 'vanilla_1.14', 'vanilla_1.26.50']);
        expect(diagnostics).toEqual([
            expect.objectContaining({
                severity: 'warning',
                code: 'source.unknown-pack',
                message: `no pack in the folder declares header UUID ${unknown}`
            })
        ]);
    });
});
