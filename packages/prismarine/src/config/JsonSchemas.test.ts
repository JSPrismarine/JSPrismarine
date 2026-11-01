import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { beforeAll, describe, expect, it } from 'vitest';

import pkg from '../../package.json' with { type: 'json' };

const schemaFiles = [
    'config.schema.json',
    'permissions.schema.json',
    'ops.schema.json',
    'banned-players.schema.json',
    'player-data.schema.json'
];

const readSchema = (file: string) =>
    JSON.parse(readFileSync(new URL(`../../schemas/${file}`, import.meta.url), 'utf8'));

describe('JSON schemas', () => {
    const ajv = new Ajv({ strict: false });

    // Generating the schemas walks the type graph behind `JsonConfigTypes`, which reaches
    // most of this package: about half a minute here, against vitest's ten second default.
    // The budget is generous rather than measured, because what it guards against is a
    // generator that hangs, not one that is slower on a busier machine than on this one.
    beforeAll(() => {
        execFileSync(process.execPath, [fileURLToPath(new URL('../../utils/generate-schemas.mjs', import.meta.url))]);
    }, 180_000);

    it.each(schemaFiles)('compiles the Draft 7 schema %s', (file) => {
        const schema = readSchema(file);
        expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
        expect(schema.allowComments).toBe(true);
        expect(schema.allowTrailingCommas).toBe(true);
        expect(ajv.compile(schema)).toBeTypeOf('function');
    });

    it.each([
        {
            file: 'config.schema.json',
            valid: {
                'log-level': 'info',
                port: 19132,
                'server-ip': '0.0.0.0',
                'level-name': 'world',
                worlds: {
                    world: {
                        seed: '0',
                        provider: 'LevelDB',
                        preset: 'minecraft:flat',
                        dimensions: {
                            'minecraft:overworld': {
                                type: 'minecraft:overworld',
                                generator: {
                                    type: 'minecraft:flat',
                                    settings: {
                                        biome: 'minecraft:plains',
                                        layers: [{ block: 'minecraft:stone', height: 1 }]
                                    }
                                }
                            },
                            'minecraft:the_end': { load: 'lazy' }
                        }
                    }
                },
                'max-players': 20,
                gamemode: 'survival',
                difficulty: 'normal',
                motd: 'A server',
                'view-distance': 10,
                'preload-radius': 10,
                'chunk-send-budget-ms': 5,
                'proximity-broadcast': true,
                'server-authoritative-block-breaking': true,
                'entity-tracking-hysteresis': 2,
                'entity-tracking-interval': 4,
                'online-mode': false,
                'packet-compression-level': 7,
                'enable-query': true,
                'enable-process-title': true,
                'enable-ticking': true,
                'log-excluded-packets': ['SetTimePacket'],
                'crafting-recipe-limit': -1
            },
            invalid: { port: '19132' }
        },
        {
            file: 'permissions.schema.json',
            valid: {
                $schema: `https://unpkg.com/@jsprismarine/prismarine@${pkg.version}/schemas/permissions.schema.json`,
                defaultPermissions: ['minecraft.command.help'],
                defaultOperatorPermissions: ['*'],
                players: [{ name: 'alice', uuid: 'fbf8646c-652c-38c4-96ff-a29d86cb5943', permissions: ['*'] }]
            },
            invalid: { players: [{ name: 'alice' }] }
        },
        {
            file: 'ops.schema.json',
            valid: [{ name: 'alice', uuid: 'fbf8646c-652c-38c4-96ff-a29d86cb5943', level: 4 }],
            invalid: [{ level: 4 }]
        },
        {
            file: 'banned-players.schema.json',
            valid: [{ name: 'alice', reason: 'griefing' }],
            invalid: [{ reason: 'griefing' }]
        },
        {
            file: 'player-data.schema.json',
            valid: {
                username: 'alice',
                gamemode: 'Survival',
                position: { x: 0, y: 64, z: 0, pitch: 0, yaw: 0, headYaw: 0 }
            },
            invalid: { position: { x: 0 } }
        }
    ])('validates examples against $file', ({ file, valid, invalid }) => {
        const validate = ajv.compile(readSchema(file));

        expect(validate(valid)).toBe(true);
        expect(validate(invalid)).toBe(false);
    });

    describe('config.schema.json worlds', () => {
        const validate = (world: unknown) => ajv.compile(readSchema('config.schema.json'))({ worlds: { world } });

        // The server still translates the old `generator` and `layers` keys on its first start
        // and writes the entry back without them; the schema describes the written shape only.
        it('describes a world by preset and dimensions, without the old generator and layers keys', () => {
            const { properties } = readSchema('config.schema.json').definitions.WorldData;

            expect(Object.keys(properties).sort()).toEqual(['dimensions', 'preset', 'provider', 'seed']);
            expect(properties.preset.default).toBe('minecraft:normal');
            expect(validate({ seed: 1, preset: 'minecraft:flat' })).toBe(true);
            expect(validate({ seed: 1, generator: 'Flat', layers: [{ block: 'stone', size: 1 }] })).toBe(false);
        });

        it('limits load to eager or lazy and requires a generator to name its type', () => {
            expect(validate({ seed: 1, dimensions: { 'minecraft:the_nether': { load: 'eager' } } })).toBe(true);
            expect(validate({ seed: 1, dimensions: { 'minecraft:the_nether': { load: 'now' } } })).toBe(false);
            expect(
                validate({
                    seed: 1,
                    dimensions: { 'minecraft:overworld': { generator: { settings: 'minecraft:overworld' } } }
                })
            ).toBe(false);
        });
    });
});
