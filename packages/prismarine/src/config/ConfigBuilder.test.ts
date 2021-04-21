import ConfigBuilder from './ConfigBuilder';
import path from 'path';

describe('config', () => {
    describe('ConfigBuilder', () => {
        it('should properly read from the config file', () => {
            const config = new ConfigBuilder(path.join(process.cwd(), '.test/', 'config.yaml'));

            expect(config.get('string_var')).toStrictEqual('hello world');
            expect(config.get('number_var')).toStrictEqual(1337);
            expect(config.get('list_var')).toStrictEqual(['test', 123]);
            expect(config.get('dump')).toBeUndefined();
        });
    });
});
