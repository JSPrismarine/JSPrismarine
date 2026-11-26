import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cachesAddonScripts, findUncachedAddons } from './check-addon-turbo.mts';

let root: string;

beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'jsp-addon-turbo-')));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

const write = (file: string, contents: string): void => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), contents);
};

const addon = (name: string, turbo?: string, outDir = 'scripts'): void => {
    write(`addons/${name}/package.json`, JSON.stringify({ scripts: { build: 'tsc-ts -p tsconfig.json' } }));
    write(`addons/${name}/tsconfig.json`, JSON.stringify({ compilerOptions: { outDir } }));
    if (turbo !== undefined) write(`addons/${name}/turbo.json`, turbo);
};

describe('cachesAddonScripts', () => {
    const config = (outputs: string[]) => ({ extends: ['//'], tasks: { build: { outputs } } });

    it('accepts a package config that extends the root and lists the compiled scripts', () => {
        expect(cachesAddonScripts(config(['$TURBO_EXTENDS$', 'scripts/**']), 'scripts')).toBe(true);
    });

    it('reads the output directory from the addon', () => {
        expect(cachesAddonScripts(config(['build/**']), 'build')).toBe(true);
    });

    it('rejects a config that misses the root or the scripts output', () => {
        expect(cachesAddonScripts({ tasks: { build: { outputs: ['scripts/**'] } } }, 'scripts')).toBe(false);
        expect(cachesAddonScripts(config(['dist/**']), 'scripts')).toBe(false);
        expect(cachesAddonScripts(undefined, 'scripts')).toBe(false);
    });

    it('keeps the generator template in step', () => {
        const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
        const template: unknown = JSON.parse(
            fs.readFileSync(path.join(repository, 'turbo/generators/template/addon/turbo.json.hbs'), 'utf8')
        );

        expect(cachesAddonScripts(template, 'scripts')).toBe(true);
    });
});

describe('findUncachedAddons', () => {
    it('names only addons with a build whose outputs Turbo does not cache', () => {
        addon('good', JSON.stringify({ extends: ['//'], tasks: { build: { outputs: ['scripts/**'] } } }));
        addon('custom', JSON.stringify({ extends: ['//'], tasks: { build: { outputs: ['build/**'] } } }), 'build');
        addon('missing');
        addon('wrong', JSON.stringify({ extends: ['//'], tasks: { build: { outputs: ['dist/**'] } } }));
        write('addons/not-a-package/README.md', 'Not a workspace.');

        expect(findUncachedAddons(root)).toEqual(['addons/missing', 'addons/wrong']);
    });

    it('accepts a repository with no addons', () => {
        expect(findUncachedAddons(root)).toEqual([]);
    });
});
