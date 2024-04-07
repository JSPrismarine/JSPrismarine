import { describe, it, expect } from 'vitest';

import { ConfigBuilder } from './ConfigBuilder';
import path from 'node:path';

describe('config', () => {
    describe('ConfigBuilder', () => {
        it('should properly read from the config file', () => {
            const dirYaml: string = path.join(process.cwd(), '.test/', 'config_test.yaml');
            const dirJson: string = path.join(process.cwd(), '.test/', 'config_test.json');
            const configYaml = new ConfigBuilder(dirYaml);
            const configJson = new ConfigBuilder(dirJson);

            expect(configYaml.getType()).toStrictEqual('yaml');
            expect(configJson.getType()).toStrictEqual('json');
            expect(configYaml.getPath()).toStrictEqual(dirYaml);
            expect(configJson.getPath()).toStrictEqual(dirJson);

            expect(configYaml.get('string_var')).toStrictEqual('hello world');
            expect(configJson.get('string_var')).toStrictEqual('hello world');
            expect(configYaml.get('number_var')).toStrictEqual(1337);
            expect(configJson.get('number_var')).toStrictEqual(1337);
            expect(configYaml.get('list_var')).toStrictEqual(['test', 123]);
            expect(configJson.get('list_var')).toStrictEqual(['test', 123]);
            expect(configYaml.get('dump')).toBeUndefined();
            expect(configJson.get('dump')).toBeUndefined();

            expect(configYaml.has('string_var')).toBeTruthy();
            expect(configJson.has('string_var')).toBeTruthy();
            expect(configYaml.has('number_var')).toBeTruthy();
            expect(configJson.has('number_var')).toBeTruthy();
            expect(configYaml.has('list_var')).toBeTruthy();
            expect(configJson.has('list_var')).toBeTruthy();
            expect(configYaml.has('dump')).toBeFalsy();
            expect(configJson.has('dump')).toBeFalsy();
        });

        it('should properly handle invalid type', () => {
            try {
                void new ConfigBuilder(path.join(process.cwd(), '.test/', 'config_test.dummy'));

                // This should never occur
                expect(false).toBeTruthy();
            } catch (error: unknown) {
                expect((error as any).message.includes('Unsupported config type.')).toBeTruthy();
            }
        });

        it('should properly write to the config file', () => {
            const configYaml = new ConfigBuilder(path.join(process.cwd(), '.test/', 'config_test.yaml'));
            const configJson = new ConfigBuilder(path.join(process.cwd(), '.test/', 'config_test.json'));

            expect(configYaml.del('string_var')).toBeTruthy();
            expect(configJson.del('string_var')).toBeTruthy();
            expect(configYaml.del('number_var')).toBeTruthy();
            expect(configJson.del('number_var')).toBeTruthy();
            expect(configYaml.del('list_var')).toBeTruthy();
            expect(configJson.del('list_var')).toBeTruthy();

            expect(configYaml.set('string_var', 'hello world')).toBeTruthy();
            expect(configJson.set('string_var', 'hello world')).toBeTruthy();
            expect(configYaml.set('number_var', 1337)).toBeTruthy();
            expect(configJson.set('number_var', 1337)).toBeTruthy();
            expect(configYaml.set('list_var', ['test', 123])).toBeTruthy();
            expect(configJson.set('list_var', ['test', 123])).toBeTruthy();
        });
    });
});
