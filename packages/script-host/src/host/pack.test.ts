import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_ALLOWED_MODULES, packLabel, readPackFile, readScriptConfig, readScriptPack } from './pack';

const MODULE_UUID = '13f251b3-41c9-4271-b2d1-d4abde28890b';
const directories: string[] = [];
const temporary = (): string => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-script-pack-'));
    directories.push(directory);
    return directory;
};
afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const writeJson = (path: string, value: unknown): void => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(value));
};

describe('readScriptPack', () => {
    it('reads the header, the script module and the native module dependencies', () => {
        const directory = temporary();
        writeJson(join(directory, 'manifest.json'), {
            header: { name: 'probe', uuid: 'aac52733-889b-4c87-abcb-f064ea7735a2', version: [1, 2, 3] },
            modules: [
                { type: 'data', uuid: 'x' },
                { type: 'script', uuid: MODULE_UUID, entry: 'scripts/main.js' }
            ],
            dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }, { uuid: 'a pack dependency' }]
        });

        const pack = readScriptPack(directory);
        expect(pack).toMatchObject({
            name: 'probe',
            version: '1.2.3',
            moduleUuid: MODULE_UUID,
            entry: 'scripts/main.js',
            dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }]
        });
        if (pack !== undefined) expect(packLabel(pack)).toBe('probe - 1.2.3');
    });

    it('reads nothing for a pack without a script module', () => {
        const directory = temporary();
        writeJson(join(directory, 'manifest.json'), {
            header: { name: 'data', uuid: 'u', version: [1, 0, 0] },
            modules: []
        });
        expect(readScriptPack(directory)).toBeUndefined();
    });

    it('reads no file outside the pack', () => {
        const directory = temporary();
        writeJson(join(directory, 'pack', 'manifest.json'), {
            header: { name: 'p', uuid: 'u', version: [1, 0, 0] },
            modules: [{ type: 'script', uuid: MODULE_UUID, entry: 'main.js' }]
        });
        writeFileSync(join(directory, 'secret.txt'), 'outside');
        const pack = readScriptPack(join(directory, 'pack'));
        if (pack === undefined) throw new Error('the pack has a script module');
        expect(readPackFile(pack, '../secret.txt')).toBeUndefined();
    });
});

describe('readScriptConfig', () => {
    it('reads default/ for every module and lets a module folder replace a file of it', () => {
        const directory = temporary();
        writeJson(join(directory, 'default', 'permissions.json'), { allowed_modules: ['@minecraft/server'] });
        writeJson(join(directory, 'default', 'variables.json'), { greeting: 'hello' });
        writeJson(join(directory, MODULE_UUID, 'permissions.json'), { allowed_modules: ['@minecraft/server-ui'] });
        writeJson(join(directory, MODULE_UUID, 'secrets.json'), { token: 'secret', count: 3 });
        const config = readScriptConfig(directory);

        expect(config.module(MODULE_UUID)).toEqual({
            allowedModules: ['@minecraft/server-ui'],
            variables: { greeting: 'hello' },
            secrets: { token: 'secret' }
        });
        expect(config.module('aac52733-889b-4c87-abcb-f064ea7735a2').allowedModules).toEqual(['@minecraft/server']);
    });

    it('allows what the pinned BDS ships when there is no config folder', () => {
        expect(readScriptConfig(undefined).module(MODULE_UUID).allowedModules).toEqual(DEFAULT_ALLOWED_MODULES);
    });

    it('never reads a folder a manifest names with something other than a UUID', () => {
        const directory = temporary();
        writeJson(join(directory, 'default', 'permissions.json'), { allowed_modules: ['@minecraft/server'] });
        writeJson(join(directory, 'outside', 'permissions.json'), { allowed_modules: ['@minecraft/server-net'] });
        expect(readScriptConfig(directory).module('../outside').allowedModules).toEqual(['@minecraft/server']);
    });

    it('keeps the default list the pinned BDS archive ships, where the archive is fetched', () => {
        const repository = join(import.meta.dirname, '..', '..', '..', '..');
        const sources: unknown = JSON.parse(
            readFileSync(join(repository, 'packages/bedrock-data/sources.json'), 'utf8')
        );
        // sources.json is parsed JSON; only the one number this test needs is read from it.
        const protocol = (sources as { bds?: { defaultProtocolVersion?: number } }).bds?.defaultProtocolVersion;
        const file = join(
            repository,
            `node_modules/.cache/jsprismarine/bds/v${protocol}/unpacked/config/default/permissions.json`
        );
        if (!existsSync(file)) return;
        expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ allowed_modules: DEFAULT_ALLOWED_MODULES });
    });
});
