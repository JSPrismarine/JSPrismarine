import ConfigBuilder from './ConfigBuilder';
import path from 'path';

describe('config', () => {
    describe('ConfigBuilder', () => {
        it('should properly read from the config file', () => {
            const config = new ConfigBuilder(path.join(process.cwd(), '.test/', 'test.yaml'));

            expect(config.get('string_var')).toStrictEqual('hello world');
            expect(config.get('number_var')).toStrictEqual(1337);
            expect(config.get('list_var')).toStrictEqual(['test', 123]);
            expect(config.get('dump')).toBeUndefined();

            expect(config.has('string_var')).toBeTruthy();
            expect(config.has('number_var')).toBeTruthy();
            expect(config.has('list_var')).toBeTruthy();
            expect(config.has('dump')).toBeFalsy();
        });

        it('should properly write to the config file', () => {
            const config = new ConfigBuilder(path.join(process.cwd(), '.test/', 'test.yaml'));

            expect(config.del('string_var')).toBeTruthy();
            expect(config.del('number_var')).toBeTruthy();
            expect(config.del('list_var')).toBeTruthy();

            expect(config.get('string_var', 'hello world')).toBeTruthy();
            expect(config.get('number_var', 1337)).toBeTruthy();
            expect(config.get('list_var', ['test', 123])).toBeTruthy();
        });
    });
});
