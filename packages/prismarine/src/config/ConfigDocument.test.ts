import { describe, expect, it } from 'vitest';

import { ConfigSyntaxError, parseConfigDocument } from './ConfigDocument';

const YAML_SOURCE = [
    '# Server settings.',
    'port: 19132 # the one players type in',
    '',
    '# Shown in the server list.',
    'motd: Another JSPrismarine server!',
    'worlds:',
    '    world:',
    '        generator: Flat',
    'log-excluded-packets:',
    '    - SetTimePacket',
    ''
].join('\n');

const JSON_SOURCE = [
    '{',
    '    // Server settings.',
    '    "port": 19132, // the one players type in',
    '',
    '    /* Shown in the server list. */',
    '    "motd": "Another JSPrismarine server!",',
    '    "worlds": {',
    '        "world": {',
    '            "generator": "Flat"',
    '        }',
    '    },',
    '    "log-excluded-packets": ["SetTimePacket"],',
    '}',
    ''
].join('\n');

describe('config', () => {
    describe.each([
        ['yaml', YAML_SOURCE],
        ['json', JSON_SOURCE]
    ] as const)('ConfigDocument (%s)', (format, source) => {
        it('reads plain values, nested maps, lists and the whole document', () => {
            const document = parseConfigDocument(format, source);

            expect(document.get(['port'])).toBe(19132);
            expect(document.get(['worlds', 'world', 'generator'])).toBe('Flat');
            expect(document.get(['worlds', 'world'])).toStrictEqual({ generator: 'Flat' });
            expect(document.get(['log-excluded-packets'])).toStrictEqual(['SetTimePacket']);
            expect(document.get(['log-excluded-packets', 0])).toBe('SetTimePacket');
            expect(document.get(['missing'])).toBeUndefined();
            expect(document.get(['missing', 'deeper'])).toBeUndefined();
            expect(document.get([])).toStrictEqual({
                port: 19132,
                motd: 'Another JSPrismarine server!',
                worlds: { world: { generator: 'Flat' } },
                'log-excluded-packets': ['SetTimePacket']
            });
        });

        it('answers has for present, nested and absent paths', () => {
            const document = parseConfigDocument(format, source);

            expect(document.has(['port'])).toBe(true);
            expect(document.has(['worlds', 'world', 'generator'])).toBe(true);
            expect(document.has(['worlds', 'nether'])).toBe(false);
            expect(document.has(['missing'])).toBe(false);
            expect(document.has([])).toBe(true);
        });

        it('gives the text back unchanged when nothing was edited', () => {
            expect(parseConfigDocument(format, source).toString()).toBe(source);
        });

        it('keeps every comment when a value changes', () => {
            const document = parseConfigDocument(format, source);
            document.set(['port'], 25565);

            const text = document.toString();
            expect(document.get(['port'])).toBe(25565);
            expect(text).toContain('Server settings.');
            expect(text).toContain('the one players type in');
            expect(text).toContain('Shown in the server list.');
            expect(text).not.toContain('19132');
        });

        it('writes a new key with its comment and leaves the rest alone', () => {
            const document = parseConfigDocument(format, source);
            document.set(['view-distance'], 10, 'How far players see, in chunks.');

            const text = document.toString();
            expect(document.get(['view-distance'])).toBe(10);
            expect(text).toContain('How far players see, in chunks.');
            expect(text).toContain('Shown in the server list.');
            expect(text.indexOf('How far players see')).toBeLessThan(text.indexOf('view-distance'));
            expect(parseConfigDocument(format, text).get(['view-distance'])).toBe(10);
        });

        it('does not stack a comment onto a key that already exists', () => {
            const document = parseConfigDocument(format, source);
            document.set(['motd'], 'Hello', 'Shown in the server list.');

            expect(document.toString().match(/Shown in the server list\./g)).toHaveLength(1);
        });

        it('creates the maps on the way to a nested key, with the comment', () => {
            const document = parseConfigDocument(format, source);
            document.set(['worlds', 'world', 'seed'], 42, 'The world seed.');
            document.set(['network', 'compression', 'level'], 7);

            const text = document.toString();
            expect(document.get(['worlds', 'world'])).toStrictEqual({ generator: 'Flat', seed: 42 });
            expect(document.get(['network'])).toStrictEqual({ compression: { level: 7 } });
            expect(text).toContain('The world seed.');
            expect(text.indexOf('The world seed.')).toBeLessThan(text.indexOf('seed'));
        });

        it('stores lists and maps as values', () => {
            const document = parseConfigDocument(format, source);
            document.set(['log-excluded-packets'], ['SetTimePacket', 'MovePlayerPacket']);
            document.set(['worlds'], { world: { generator: 'Flat', seed: 1 }, nether: { generator: 'Nether' } });

            const reread = parseConfigDocument(format, document.toString());
            expect(reread.get(['log-excluded-packets'])).toStrictEqual(['SetTimePacket', 'MovePlayerPacket']);
            expect(reread.get(['worlds'])).toStrictEqual({
                world: { generator: 'Flat', seed: 1 },
                nether: { generator: 'Nether' }
            });
        });

        it('deletes a key and reports whether it was there', () => {
            const document = parseConfigDocument(format, source);

            expect(document.delete(['motd'])).toBe(true);
            expect(document.delete(['motd'])).toBe(false);
            expect(document.has(['motd'])).toBe(false);

            const text = document.toString();
            expect(text).not.toContain('Another JSPrismarine server!');
            expect(text).toContain('the one players type in');
        });

        it('leaves the comment above a deleted key for whatever follows it', () => {
            const document = parseConfigDocument(format, source);

            expect(document.delete(['port'])).toBe(true);

            const text = document.toString();
            expect(text).toContain('Server settings.');
            expect(text).not.toContain('the one players type in');
            expect(text).not.toContain('19132');
            expect(text.indexOf('Server settings.')).toBeLessThan(text.indexOf('motd'));
            expect(parseConfigDocument(format, text).get([])).toStrictEqual({
                motd: 'Another JSPrismarine server!',
                worlds: { world: { generator: 'Flat' } },
                'log-excluded-packets': ['SetTimePacket']
            });
        });

        it('starts from an empty file', () => {
            const document = parseConfigDocument(format, '');
            expect(document.get([])).toBeUndefined();
            expect(document.has(['port'])).toBe(false);

            document.set(['port'], 19132, 'The port.');

            const text = document.toString();
            expect(text.endsWith('\n')).toBe(true);
            expect(text).toContain('The port.');
            expect(parseConfigDocument(format, text).get(['port'])).toBe(19132);
        });

        it('refuses a file that does not parse instead of treating it as empty', () => {
            const broken = format === 'yaml' ? 'port: [19132\n' : '{ "port": 19132\n';
            expect(() => parseConfigDocument(format, broken)).toThrow(ConfigSyntaxError);
        });

        it('refuses a file whose root is a single value', () => {
            expect(() => parseConfigDocument(format, format === 'yaml' ? 'just text\n' : '"just text"\n')).toThrow(
                ConfigSyntaxError
            );
        });
    });

    describe('ConfigDocument (yaml)', () => {
        it('keeps a comment-only file and adds the first key under it', () => {
            const document = parseConfigDocument('yaml', '# Nothing configured yet.\n');
            document.set(['port'], 19132);

            const text = document.toString();
            expect(text).toContain('# Nothing configured yet.');
            expect(parseConfigDocument('yaml', text).get(['port'])).toBe(19132);
        });

        it('indents with four spaces and does not fold long strings', () => {
            const document = parseConfigDocument('yaml', '');
            const motd =
                'A message of the day that runs on and on, well past the eighty columns a folder would break it at.';
            document.set(['worlds', 'world', 'generator'], 'Flat');
            document.set(['motd'], motd);

            const text = document.toString();
            expect(text).toContain('worlds:\n    world:\n        generator: Flat\n');
            expect(text).toContain(`motd: ${motd}\n`);
        });
    });

    describe('ConfigDocument (json)', () => {
        const LIST = '[\n    // The first entry.\n    {\n        "name": "a"\n    }\n]\n';

        it('appends to a list at the index past its end and keeps the comments', () => {
            const document = parseConfigDocument('json', LIST);
            document.set([1], { name: 'b' }, 'The second entry.');

            const text = document.toString();
            expect(document.get([])).toStrictEqual([{ name: 'a' }, { name: 'b' }]);
            expect(text).toContain('// The first entry.');
            expect(text).toContain('// The second entry.');
        });

        it('replaces and removes list items by index', () => {
            const document = parseConfigDocument('json', LIST);
            document.set([0, 'name'], 'renamed');
            expect(document.get([0])).toStrictEqual({ name: 'renamed' });
            expect(document.toString()).toContain('// The first entry.');

            expect(document.delete([0])).toBe(true);
            expect(document.get([])).toStrictEqual([]);
        });

        it('accepts trailing commas and both comment styles', () => {
            const document = parseConfigDocument('json', '{\n  /* a */ "a": 1, // b\n  "list": [1, 2,],\n}\n');
            expect(document.get([])).toStrictEqual({ a: 1, list: [1, 2] });
        });

        it('indents a new key like its neighbors', () => {
            const document = parseConfigDocument('json', '{\n  "a": 1\n}\n');
            document.set(['b'], 2, 'The second key.');

            expect(document.toString()).toBe('{\n  "a": 1,\n  // The second key.\n  "b": 2\n}\n');
        });
    });
});
