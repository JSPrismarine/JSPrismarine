import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import pkg from '../../package.json' with { type: 'json' };
import { ConfigBuilder } from './ConfigBuilder';

const YAML_FILE = [
    '# Hand written.',
    'string_var: hello world',
    'number_var: 1337 # a leet number',
    'list_var:',
    '    - test',
    '    - 123',
    ''
].join('\n');

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
        let yamlPath: string;
        let jsonPath: string;

        beforeEach(() => {
            directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-config-builder-'));
            yamlPath = path.join(directory, 'config_test.yaml');
            jsonPath = path.join(directory, 'config_test.json');
            writeFileSync(yamlPath, YAML_FILE);
            writeFileSync(jsonPath, JSON_FILE);
        });

        afterEach(() => {
            rmSync(directory, { recursive: true, force: true });
        });

        const both = () => [new ConfigBuilder(yamlPath), new ConfigBuilder(jsonPath)];

        it('should properly read from the config file', () => {
            const [configYaml, configJson] = both();

            expect(configYaml.getType()).toStrictEqual('yaml');
            expect(configJson.getType()).toStrictEqual('json');
            expect(configYaml.getPath()).toStrictEqual(yamlPath);
            expect(configJson.getPath()).toStrictEqual(jsonPath);

            for (const config of [configYaml, configJson]) {
                expect(config.get('string_var')).toStrictEqual('hello world');
                expect(config.get('number_var')).toStrictEqual(1337);
                expect(config.get('list_var')).toStrictEqual(['test', 123]);
                expect(config.get('list_var.0')).toStrictEqual('test');
                expect(config.get('dump')).toBeUndefined();

                expect(config.has('string_var')).toBeTruthy();
                expect(config.has('list_var')).toBeTruthy();
                expect(config.has('dump')).toBeFalsy();
            }
        });

        it('should properly handle invalid type', () => {
            expect(() => new ConfigBuilder(path.join(directory, 'config_test.dummy'))).toThrow(
                'Unsupported config type.'
            );
        });

        it('should create a missing file and its directory', () => {
            const nested = path.join(directory, 'deeper', 'still', 'fresh.yaml');
            const config = new ConfigBuilder(nested);

            expect(config.get('port', 19132)).toBe(19132);
            expect(readFileSync(nested, 'utf8')).toBe('port: 19132\n');
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

        it('should fall back to the default when the stored value is of another kind', () => {
            for (const config of both()) {
                expect(config.get('number_var', 'text')).toStrictEqual('text');
                expect(config.get('list_var', {})).toStrictEqual({});

                // The file keeps what it had.
                expect(config.get('number_var')).toStrictEqual(1337);
                expect(config.get('list_var')).toStrictEqual(['test', 123]);
            }
        });

        it('should write a missing default with its comment and keep the rest of the file', () => {
            for (const config of both()) {
                expect(config.get('view-distance', 10, 'How far players see, in chunks.')).toBe(10);

                const text = readFileSync(config.getPath(), 'utf8');
                expect(text).toContain('Hand written.');
                expect(text).toContain('a leet number');
                expect(text).toContain('How far players see, in chunks.');
                expect(config.get('view-distance')).toBe(10);
            }
        });

        it('should keep comments when a value changes or goes away', () => {
            for (const config of both()) {
                expect(config.set('number_var', 42)).toBeTruthy();
                expect(config.del('string_var')).toBeTruthy();
                expect(config.del('string_var')).toBeFalsy();

                const text = readFileSync(config.getPath(), 'utf8');
                expect(text).toContain('Hand written.');
                expect(text).toContain('a leet number');
                expect(text).not.toContain('hello world');
                expect(config.get('number_var')).toBe(42);
            }
        });

        it('should set nested keys through dotted paths and read dotted names literally', () => {
            for (const config of both()) {
                expect(config.set('worlds.world.seed', 7, 'The seed.')).toBeTruthy();
                expect(config.get('worlds')).toStrictEqual({ world: { seed: 7 } });
                expect(config.has('worlds.world.seed')).toBeTruthy();

                expect(config.set('with.dots', 'literal')).toBeTruthy();
                // The literal top-level key does not exist, so the dotted form made a path.
                expect(config.get('with')).toStrictEqual({ dots: 'literal' });
            }
        });

        it('should refuse keys that reach into prototypes', () => {
            for (const config of both()) {
                expect(config.set('__proto__.polluted', true)).toBeFalsy();
                expect(config.get('constructor.prototype')).toBeUndefined();
                expect(config.has('__proto__')).toBeFalsy();
                expect(({} as Record<string, unknown>).polluted).toBeUndefined();
            }
        });

        it('should refuse a file that does not parse rather than overwrite it', () => {
            writeFileSync(yamlPath, 'string_var: [unclosed\n');
            const config = new ConfigBuilder(yamlPath);

            expect(() => config.get('string_var', 'default')).toThrow(
                /Cannot read .*config_test\.yaml: Not valid yaml/
            );
            expect(readFileSync(yamlPath, 'utf8')).toBe('string_var: [unclosed\n');
        });
    });
});
