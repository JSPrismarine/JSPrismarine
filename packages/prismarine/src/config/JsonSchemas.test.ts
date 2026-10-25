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
    'level.schema.json',
    'player-data.schema.json'
];

const readSchema = (file: string) =>
    JSON.parse(readFileSync(new URL(`../../schemas/${file}`, import.meta.url), 'utf8'));

describe('JSON schemas', () => {
    const ajv = new Ajv({ strict: false });

    beforeAll(() => {
        execFileSync(process.execPath, [fileURLToPath(new URL('../../utils/generate-schemas.cjs', import.meta.url))]);
    });

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
                worlds: { world: { seed: 0, provider: 'LevelDB', generator: 'Flat' } },
                'max-players': 20,
                gamemode: 'survival',
                difficulty: 'normal',
                motd: 'A server',
                'view-distance': 10,
                'preload-radius': 10,
                'chunk-send-budget-ms': 5,
                'proximity-broadcast': true,
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
            file: 'level.schema.json',
            valid: {
                spawn: { x: 0, y: 64, z: 0 },
                gameRules: [['keepInventory', [true, false]]],
                entities: [{ type: 'minecraft:pig', position: { x: 1, y: 64, z: 2, pitch: 0, yaw: 90, headYaw: 90 } }]
            },
            invalid: { gameRules: [['keepInventory', ['yes', false]]] }
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
});
