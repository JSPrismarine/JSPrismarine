import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import StartGamePacket, { EditorLevelMigrationVersion, EMPTY_COMPOUND, GameRuleType } from './StartGamePacket';

import type { StartGame } from './StartGamePacket';

/**
 * The packet a Bedrock Dedicated Server 1.26.51.1 (protocol 2193) sent to a joining client,
 * header byte included. Captured with `packages/client/tools/dump-packets.mjs`. It is the
 * authority on the layout: Mojang's documentation describes the fields, only a real server
 * says what bytes they make.
 */
const CAPTURED = fs.readFileSync(new URL('./__fixtures__/start-game-bds-1.26.51.1.bin', import.meta.url));

const decode = (buffer: Buffer, protocolVersion = 2193): StartGame =>
    new StartGamePacket().deserialize(new NetworkBinaryStream(buffer), { protocolVersion });
const encode = (data: StartGame, protocolVersion = 2193): Buffer =>
    new StartGamePacket(data).serialize(new NetworkBinaryStream(), { protocolVersion });

describe('StartGamePacket', () => {
    describe('against a real server', () => {
        const data = decode(CAPTURED);

        it('reads the whole packet and nothing past it', () => {
            const stream = new NetworkBinaryStream(CAPTURED);
            new StartGamePacket().deserialize(stream);

            expect(stream.feof()).toBe(true);
        });

        it('reads the fields a client cannot function without', () => {
            expect(data.runtimeEntityId).toBe(7n);
            expect(data.entityId).toBe(-8589934585n);
            expect(data.position.y).toBeCloseTo(32769.62, 1);
            expect(data.serverVersion).toBe('1.26.51');
            expect(data.levelName).toBe('capture');
        });

        it('reads the movement settings as a rewind size and a flag, with no mode in front', () => {
            // BDS keeps forty ticks of history and breaks blocks authoritatively. A reader
            // that still expects the retired movement mode first takes the 40 for it.
            expect(data.rewindHistorySize).toBe(40);
            expect(data.serverAuthoritativeBlockBreaking).toBe(true);
            expect(data.currentTick).toBe(19629n);
        });

        it('reads an integer game rule as four bytes', () => {
            const rule = data.gameRules.find((r) => r.name === 'playersSleepingPercentage');

            expect(rule).toMatchObject({ type: GameRuleType.INT, value: 100, editable: true });
            expect(data.gameRules).toHaveLength(39);
        });

        it('carries the data driven vanilla blocks as definitions', () => {
            const blocks = data.blockProperties ?? [];
            expect(blocks).toHaveLength(98);
            expect(blocks.map((b) => b.name)).toContain('minecraft:black_wool_stairs');

            // Network NBT: a compound tag with an empty name, and nothing before it.
            for (const block of blocks) expect(block.definition.subarray(0, 2)).toEqual(Buffer.from([0x0a, 0x00]));
        });

        it('reads the join information a real server sends: present, with nothing inside', () => {
            expect(data.serverJoinInformation).toEqual({});
            expect(data.playerPropertyData).toEqual(EMPTY_COMPOUND);
            expect(data.blockNetworkIdsAreHashes).toBe(true);
        });

        it('writes the packet back byte for byte', () => {
            expect(encode(data)).toEqual(CAPTURED);
        });
    });

    describe('optional fields', () => {
        const base = decode(CAPTURED);

        it('round trips a forced experimental gameplay flag', () => {
            const data = { ...base, forceExperimentalGameplay: true };

            expect(decode(encode(data))).toEqual(data);
        });

        it('round trips join information with every part filled in', () => {
            const data: StartGame = {
                ...base,
                serverJoinInformation: {
                    gathering: {
                        experienceId: { mostSignificantBits: 1n, leastSignificantBits: 2n },
                        experienceName: 'an experience',
                        creatorId: 'creator',
                        serverId: 'server'
                    },
                    storeEntryPoint: { storeId: 'store', storeName: 'A store' },
                    presence: { richPresenceId: 'presence' }
                }
            };

            expect(decode(encode(data))).toEqual(data);
        });

        it('writes a single byte for absent join information', () => {
            const { serverJoinInformation: _present, ...data } = base;

            // Three bytes shorter than the captured packet: the outer flag stays, now false,
            // and the three inner ones it introduced are gone.
            expect(encode(data).byteLength).toBe(CAPTURED.byteLength - 3);
            expect(decode(encode(data)).serverJoinInformation).toBeUndefined();
        });
    });

    describe('protocol 2225 layout', () => {
        const data2193 = decode(CAPTURED);

        it('writes and reads Editor Level Migration Version through the stamped layout', () => {
            const data: StartGame = {
                ...data2193,
                editorLevelMigrationVersion: EditorLevelMigrationVersion.EditorAchievements
            };
            const buffer = encode(data, 2225);
            const stream = new NetworkBinaryStream(buffer);

            expect(new StartGamePacket().deserialize(stream, { protocolVersion: 2225 })).toEqual(data);
            expect(stream.feof()).toBe(true);
        });

        it('inserts one byte at 2225 and omits the field from the 2193 payload', () => {
            const withMigration = encode(
                { ...data2193, editorLevelMigrationVersion: EditorLevelMigrationVersion.Legacy },
                2225
            );
            const withoutMigration = encode(data2193, 2193);

            expect(withMigration.byteLength).toBe(withoutMigration.byteLength + 1);
            expect(decode(withoutMigration, 2193).editorLevelMigrationVersion).toBeUndefined();
        });
    });
});
