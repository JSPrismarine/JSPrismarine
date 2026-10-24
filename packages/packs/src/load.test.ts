import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { textFiles, writeBrarchive, writeZip } from '../fixtures/writers';
import { PackLoadError, load } from './load';

const fixtures = join(import.meta.dirname, '..', 'fixtures');
const basePack = join(fixtures, 'base');
const overridePack = join(fixtures, 'override');
const badManifestPack = join(fixtures, 'bad-manifest');

const temporaryDirs: string[] = [];
const temporaryDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'jsp-packs-'));
    temporaryDirs.push(dir);
    return dir;
};
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** Reads a fixture pack folder into the file map the zip writer takes. */
const packAsFiles = (root: string): Map<string, Uint8Array> => {
    const files = new Map<string, Uint8Array>();
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const absolute = join(entry.parentPath, entry.name);
        files.set(relative(root, absolute).split(sep).join('/'), readFileSync(absolute));
    }
    return files;
};

describe('load', () => {
    it('loads a directory pack, accepting comments, trailing commas and integer filters', () => {
        const { definitions, diagnostics } = load([{ kind: 'directory', path: basePack }]);

        const robot = definitions.entities.get('fixture:robot');
        expect(robot).toMatchObject({ pack: 'Base Pack', path: 'entities/robot.json', formatVersion: [1, 26, 0] });
        expect(definitions.blocks.get('fixture:marble')).toBeDefined();
        expect(definitions.tradeTables.get('trading/economy_trades/robot_trades.json')).toBeDefined();
        expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    });

    it('reports an unknown root key once per pack as a warning', () => {
        const { diagnostics } = load([{ kind: 'directory', path: basePack }]);
        const unknown = diagnostics.filter((diagnostic) => diagnostic.code === 'definition.unknown-key');
        expect(unknown).toHaveLength(1);
        expect(unknown[0]).toMatchObject({ severity: 'warning', pack: 'Base Pack' });
        expect(unknown[0]?.message).toContain('unknown_root_key');
    });

    it('lets the later pack win by identifier, replacing the definition whole', () => {
        const { definitions } = load([
            { kind: 'directory', path: basePack },
            { kind: 'directory', path: overridePack }
        ]);

        const robot = definitions.entities.get('fixture:robot');
        expect(robot?.pack).toBe('Override Pack');
        // The override has no damage_sensor; a replace that merged would keep it.
        expect(JSON.stringify(robot?.data)).not.toContain('damage_sensor');
    });

    it('loads an .mcaddon holding two .mcpack members in order', () => {
        const addonPath = join(temporaryDir(), 'two-packs.mcaddon');
        const addon = writeZip(
            new Map([
                ['base.mcpack', writeZip(packAsFiles(basePack))],
                ['override.mcpack', writeZip(packAsFiles(overridePack))]
            ])
        );
        writeFileSync(addonPath, addon);

        const { definitions, diagnostics } = load([{ kind: 'archive', path: addonPath }]);
        expect(definitions.entities.get('fixture:robot')?.pack).toBe('Override Pack');
        expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    });

    it('loads brarchive layers in version order, later layer winning', () => {
        const layers = temporaryDir();
        const manifest = (name: string, uuid: string): string =>
            JSON.stringify({
                format_version: 2,
                header: { name, uuid, version: [1, 0, 0], min_engine_version: [1, 26, 50] },
                modules: [{ type: 'data', uuid: uuid.replace('8000', '8001'), version: [1, 0, 0] }]
            });
        const entity = (health: number): string =>
            JSON.stringify({
                format_version: '1.26.0',
                'minecraft:entity': {
                    description: { identifier: 'fixture:layered' },
                    components: { 'minecraft:health': { value: health } }
                }
            });

        for (const [folder, name, uuid, health] of [
            ['vanilla', 'Vanilla', '0c000000-0000-4000-8000-000000000001', 1],
            ['vanilla_1.26.50', 'Vanilla 1.26.50', '0e000000-0000-4000-8000-000000000001', 3],
            ['vanilla_1.14', 'Vanilla 1.14', '0d000000-0000-4000-8000-000000000001', 2]
        ] as const) {
            mkdirSync(join(layers, folder, '__brarchive'), { recursive: true });
            writeFileSync(join(layers, folder, 'manifest.json'), manifest(name, uuid));
            writeFileSync(
                join(layers, folder, '__brarchive', 'entities.brarchive'),
                writeBrarchive(textFiles({ 'layered.json': entity(health) }))
            );
        }

        const { definitions, diagnostics } = load([{ kind: 'brarchiveLayers', path: layers }]);
        expect(definitions.entities.get('fixture:layered')?.pack).toBe('Vanilla 1.26.50');
        expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    });

    it('reports a bad manifest and skips the pack, keeping the rest of the stack', () => {
        const { definitions, diagnostics } = load([
            { kind: 'directory', path: badManifestPack },
            { kind: 'directory', path: overridePack }
        ]);
        expect(diagnostics.some((diagnostic) => diagnostic.code === 'manifest.invalid')).toBe(true);
        expect(definitions.entities.get('fixture:robot')?.pack).toBe('Override Pack');
    });

    it('reports a definition failing structural validation and keeps loading', () => {
        const pack = temporaryDir();
        statSync(basePack); // the fixture must exist for the copy below
        mkdirSync(join(pack, 'entities'), { recursive: true });
        writeFileSync(join(pack, 'manifest.json'), readFileSync(join(basePack, 'manifest.json')));
        writeFileSync(join(pack, 'entities', 'broken.json'), '{"format_version": "1.26.0"}');

        const { definitions, diagnostics } = load([{ kind: 'directory', path: pack }]);
        expect(definitions.entities.size).toBe(0);
        expect(diagnostics.some((diagnostic) => diagnostic.code === 'definition.missing-wrapper')).toBe(true);
    });

    it('accepts an injected validator in place of the structural one', () => {
        const { diagnostics } = load([{ kind: 'directory', path: basePack }], {
            validator: ({ path }) => [{ severity: 'warning', code: 'custom.flag', message: `saw ${path}` }]
        });
        expect(diagnostics.every((diagnostic) => diagnostic.code === 'custom.flag')).toBe(true);
        expect(diagnostics.length).toBeGreaterThan(0);
    });

    it('turns diagnostics into a load failure in strict mode', () => {
        expect(() => load([{ kind: 'directory', path: basePack }], { strict: true })).toThrow(PackLoadError);
        try {
            load([{ kind: 'directory', path: basePack }], { strict: true });
        } catch (error) {
            if (!(error instanceof PackLoadError)) throw error;
            expect(error.diagnostics.length).toBeGreaterThan(0);
        }
    });

    it('loads a clean stack in strict mode', () => {
        const { definitions } = load([{ kind: 'directory', path: overridePack }], { strict: true });
        expect(definitions.entities.get('fixture:robot')).toBeDefined();
    });
});
