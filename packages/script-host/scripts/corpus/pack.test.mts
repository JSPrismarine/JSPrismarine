import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SCRIPT_MODULE_HISTORIES } from '../../src/generated/scriptModules.ts';
import { countPack, shapeVersionFor } from './pack.mts';

const server = SCRIPT_MODULE_HISTORIES['@minecraft/server'];
if (server === undefined) throw new Error('No generated @minecraft/server history');

describe('shapeVersionFor', () => {
    it('gives a stable version what BDS serves: the newest minor of its major version', () => {
        expect(shapeVersionFor(server, '2.0.0')).toBe(server.resolves['2']);
        expect(shapeVersionFor(server, '1.3.0')).toBe(server.resolves['1']);
    });

    it('gives a beta version of the major version the shipped beta has that beta', () => {
        expect(shapeVersionFor(server, '2.12.0-beta')).toBe('2.11.0-beta');
        expect(shapeVersionFor(server, '2.8.0-beta')).toBe('2.11.0-beta');
        expect(shapeVersionFor(server, 'beta')).toBe('2.11.0-beta');
    });

    it('gives a beta version of another major version the newest stable minor of that major', () => {
        expect(shapeVersionFor(server, '1.17.0-beta')).toBe(server.resolves['1']);
    });

    it('gives an undeclared module the newest stable version', () => {
        expect(shapeVersionFor(server, undefined)).toBe(server.resolves['2']);
    });
});

describe('countPack', () => {
    let root: string;

    afterEach(() => rmSync(root, { recursive: true, force: true }));

    const write = (path: string, content: string): void => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), content);
    };

    it('reads the manifest and every script under the sources, but not tests, declarations or exclusions', () => {
        root = mkdtempSync(join(tmpdir(), 'jsp-corpus-'));
        write(
            'BP/manifest.json',
            JSON.stringify({
                dependencies: [
                    { module_name: '@minecraft/server', version: '2.8.0-beta' },
                    { module_name: '@minecraft/server-net', version: '1.0.0-beta' },
                    { uuid: '00000000-0000-0000-0000-000000000000', version: [1, 0, 0] }
                ]
            })
        );
        const use = (member: string) => `import { world } from '@minecraft/server'; world.${member}('x');`;
        write('src/main.ts', use('sendMessage'));
        write('src/lib/util.js', use('getDimension'));
        write('src/main.test.ts', use('getPlayers'));
        write('src/types.d.ts', `declare const x: number;`);
        write('src/vendor/lib.js', use('getAllPlayers'));
        write('src/node_modules/dep/index.js', use('getEntity'));

        const usage = countPack(
            { id: 'fixture', manifest: 'BP/manifest.json', sources: ['src'], exclude: ['src/vendor'] },
            root,
            SCRIPT_MODULE_HISTORIES
        );

        expect(usage.files).toEqual({ javascript: 1, typescript: 1 });
        expect([...usage.modules.keys()]).toEqual(['@minecraft/server', '@minecraft/server-net']);
        const serverUse = usage.modules.get('@minecraft/server');
        expect(serverUse).toMatchObject({ declared: '2.8.0-beta', stability: 'beta', shape: '2.11.0-beta' });
        expect([...(serverUse?.uses.keys() ?? [])].sort()).toEqual([
            'World.getDimension',
            'World.sendMessage',
            'world'
        ]);
        expect(usage.modules.get('@minecraft/server-net')).toMatchObject({ declared: '1.0.0-beta', stability: 'beta' });
        expect(usage.modules.get('@minecraft/server-net')?.shape).toBe('1.0.0-beta');
    });

    it('names the pack when a source directory is missing', () => {
        root = mkdtempSync(join(tmpdir(), 'jsp-corpus-'));
        write('manifest.json', '{}');
        expect(() =>
            countPack({ id: 'fixture', manifest: 'manifest.json', sources: ['scripts'], exclude: [] }, root, {})
        ).toThrow('Corpus pack fixture has no scripts at its pinned commit');
    });
});
