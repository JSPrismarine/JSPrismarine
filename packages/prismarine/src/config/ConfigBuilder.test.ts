import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import pkg from '../../package.json' with { type: 'json' };
import { ConfigBuilder } from './ConfigBuilder';

const JSON_FILE = [
    '{',
    '    // Hand written.',
    '    "string_var": "hello world",',
    '    "number_var": 1337, // a leet number',
    '    "list_var": ["test", 123]',
    '}',
    ''
].join('\n');

describe('config', () => {
    describe('ConfigBuilder', () => {
        let directory: string;
        let jsonPath: string;

        beforeEach(() => {
            directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-config-builder-'));
            jsonPath = path.join(directory, 'config_test.json');
            writeFileSync(jsonPath, JSON_FILE);
        });

        afterEach(() => {
            rmSync(directory, { recursive: true, force: true });
        });

        it('should properly read from the config file', () => {
            const config = new ConfigBuilder(jsonPath);

            expect(config.getPath()).toStrictEqual(jsonPath);

            expect(config.get('string_var')).toStrictEqual('hello world');
            expect(config.get('number_var')).toStrictEqual(1337);
            expect(config.get('list_var')).toStrictEqual(['test', 123]);
            expect(config.get('list_var.0')).toStrictEqual('test');
            expect(config.get('dump')).toBeUndefined();

            expect(config.has('string_var')).toBeTruthy();
            expect(config.has('list_var')).toBeTruthy();
            expect(config.has('dump')).toBeFalsy();
        });

        it('should properly handle invalid type', () => {
            for (const name of ['config_test.dummy', 'config_test.yaml', 'config_test.yml']) {
                expect(() => new ConfigBuilder(path.join(directory, name))).toThrow('Unsupported config type.');
            }
        });

        it('should create a missing file and its directory', () => {
            const nested = path.join(directory, 'deeper', 'still', 'fresh.json');
            const config = new ConfigBuilder(nested);

            expect(config.get('port', 19132)).toBe(19132);
            expect(readFileSync(nested, 'utf8')).toBe('{\n    "port": 19132\n}\n');
        });

        it('should write the versioned schema when creating and updating config.json', () => {
            const jsonConfigPath = path.join(directory, 'config.json');
            const config = new ConfigBuilder(jsonConfigPath);
            const schemaUrl = `https://unpkg.com/@jsprismarine/prismarine@${pkg.version}/schemas/config.schema.json`;

            expect(readFileSync(jsonConfigPath, 'utf8')).toContain(schemaUrl);
            expect(config.get('port', 19132)).toBe(19132);

            const text = readFileSync(jsonConfigPath, 'utf8');
            expect(text.split(schemaUrl)).toHaveLength(2);
            expect(config.get('port')).toBe(19132);
        });

        it('should insert new keys where the key order says, leaving existing keys alone', () => {
            const config = new ConfigBuilder(jsonPath, ['first_var', 'number_var', 'string_var', 'last_var']);

            expect(config.get('first_var', 1)).toBe(1);
            expect(config.get('last_var', 9)).toBe(9);

            const keys = [...readFileSync(jsonPath, 'utf8').matchAll(/"([^"]+)":/g)].map(([, key]) => key);
            // The hand written keys keep their relative order; new ranked keys go above the
            // keys the order does not name, so the server's keys stay together at the top.
            expect(keys).toEqual(['first_var', 'string_var', 'number_var', 'last_var', 'list_var']);
        });

        it('should fall back to the default when the stored value is of another kind', () => {
            const config = new ConfigBuilder(jsonPath);

            expect(config.get('number_var', 'text')).toStrictEqual('text');
            expect(config.get('list_var', {})).toStrictEqual({});

            // The file keeps what it had.
            expect(config.get('number_var')).toStrictEqual(1337);
            expect(config.get('list_var')).toStrictEqual(['test', 123]);
        });

        it('should write a missing default with its comment and keep the rest of the file', () => {
            const config = new ConfigBuilder(jsonPath);

            expect(config.get('view-distance', 10, 'How far players see, in chunks.')).toBe(10);

            const text = readFileSync(config.getPath(), 'utf8');
            expect(text).toContain('Hand written.');
            expect(text).toContain('a leet number');
            expect(text).toContain('How far players see, in chunks.');
            expect(config.get('view-distance')).toBe(10);
        });

        it('should keep comments when a value changes or goes away', () => {
            const config = new ConfigBuilder(jsonPath);

            expect(config.set('number_var', 42)).toBeTruthy();
            expect(config.del('string_var')).toBeTruthy();
            expect(config.del('string_var')).toBeFalsy();

            const text = readFileSync(config.getPath(), 'utf8');
            expect(text).toContain('Hand written.');
            expect(text).toContain('a leet number');
            expect(text).not.toContain('hello world');
            expect(config.get('number_var')).toBe(42);
        });

        it('should set nested keys through dotted paths and read dotted names literally', () => {
            const config = new ConfigBuilder(jsonPath);

            expect(config.set('worlds.world.seed', 7, 'The seed.')).toBeTruthy();
            expect(config.get('worlds')).toStrictEqual({ world: { seed: 7 } });
            expect(config.has('worlds.world.seed')).toBeTruthy();

            expect(config.set('with.dots', 'literal')).toBeTruthy();
            // The literal top-level key does not exist, so the dotted form made a path.
            expect(config.get('with')).toStrictEqual({ dots: 'literal' });
        });

        it('should refuse keys that reach into prototypes', () => {
            const config = new ConfigBuilder(jsonPath);

            expect(config.set('__proto__.polluted', true)).toBeFalsy();
            expect(config.get('constructor.prototype')).toBeUndefined();
            expect(config.has('__proto__')).toBeFalsy();
            expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        });

        it('should refuse a file that does not parse rather than overwrite it', () => {
            writeFileSync(jsonPath, '{ "string_var": [unclosed\n');
            const config = new ConfigBuilder(jsonPath);

            expect(() => config.get('string_var', 'default')).toThrow(
                /Cannot read .*config_test\.json: Not valid json/
            );
            expect(readFileSync(jsonPath, 'utf8')).toBe('{ "string_var": [unclosed\n');
        });
    });
});
