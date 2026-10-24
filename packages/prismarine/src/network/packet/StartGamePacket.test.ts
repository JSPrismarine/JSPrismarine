import { block_definitions } from '@jsprismarine/bedrock-data';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty } from '@jsprismarine/minecraft';
import { NetworkBinaryStream, StartGamePacket as ProtocolStartGamePacket } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import GameRuleManager from '../../world/GameRuleManager';
import StartGamePacket from './StartGamePacket';

// Packet id 11 as a varuint.
const HEADER = [0x0b];

/** A string as the wire carries it: a varuint byte length, then the UTF-8 bytes. */
const string = (value: string): number[] => {
    const bytes = Buffer.from(value, 'utf8');
    expect(bytes.length).toBeLessThan(0x80);
    return [bytes.length, ...bytes];
};

const NIL_UUID = new Array<number>(16).fill(0);

// Where Seed starts: the header, three one byte varints, five floats.
const SEED_OFFSET = HEADER.length + 3 + 5 * 4;

/**
 * The fields a server fills in. Everything else the packet writes is a fixed value, so the
 * bytes below spell those out by hand where the test pins them.
 */
const build = (seed = 258): StartGamePacket => {
    const packet = new StartGamePacket();
    packet.entityId = -2n;
    packet.runtimeEntityId = 7n;
    packet.gamemode = 1;
    packet.defaultGamemode = 2;
    packet.difficulty = Difficulty.HARD;
    packet.playerPos = new Vector3(0.5, 64, -2);
    packet.pitch = 1;
    packet.yaw = 180;
    packet.seed = seed;
    packet.worldSpawnPos = new Vector3(8, -60, -16);
    packet.time = 6000;
    packet.ticks = 1234;
    packet.levelId = 'level-id';
    packet.worldName = 'A world';
    packet.serverIdentifier = 'JSPrismarine';
    packet.scenarioIdentifier = 'scenario';
    packet.worldIdentifier = 'world-id';
    packet.gameRules = new GameRuleManager(stub<Server>());
    packet.encode();
    return packet;
};

const decode = (packet: StartGamePacket) => {
    const stream = new NetworkBinaryStream(packet.getBuffer());
    const data = new ProtocolStartGamePacket().deserialize(stream);
    return { data, stream };
};

// Little endian floats: Position 0.5, 64, -2 and Rotation 1, 180.
const POSITION = [0x00, 0x00, 0x00, 0x3f, 0x00, 0x00, 0x80, 0x42, 0x00, 0x00, 0x00, 0xc0];
const ROTATION = [0x00, 0x00, 0x80, 0x3f, 0x00, 0x00, 0x34, 0x43];

// Seed 258 as a little endian uint64.
const SEED = [0x02, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

// Default Spawn Block Position 8, -60, -16, zigzag encoded.
const SPAWN_POSITION = [0x10, 0x77, 0x1f];

// The header and the fields through Default Spawn Block Position, in docs order.
const HEAD = Buffer.from([
    ...HEADER,
    0x03, // Entity ID: -2 zigzag encoded
    0x07, // Runtime ID: 7
    0x02, // Game Type: 1 zigzag encoded
    ...POSITION,
    ...ROTATION,
    ...SEED,
    0x00, // Spawn Biome Type: Default as an int16
    0x00,
    ...string('plains'), // User Defined Biome Name
    0x00, // Dimension: 0
    0x02, // Generator Type: 1 zigzag encoded
    0x04, // Game Type (world default): 2 zigzag encoded
    0x00, // Is Hardcore
    0x06, // Game Difficulty: 3 zigzag encoded
    ...SPAWN_POSITION
]);

// Player Property Data: an empty network NBT compound. The compound type, an empty name, the end tag.
const EMPTY_COMPOUND = [0x0a, 0x00, 0x00];

// Server Block Type Registry Checksum: 0 as a little endian uint64.
const CHECKSUM = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

// Everything after the block properties, in docs order.
const TAIL = Buffer.from([
    ...string(''), // Multiplayer Correlation Id
    0x01, // Enable Item Stack Net Manager
    ...string('1.26.50'), // Server Version, the first entry of `Identifiers.MinecraftVersions`
    ...EMPTY_COMPOUND,
    ...CHECKSUM,
    ...NIL_UUID, // World Template ID
    0x00, // Server Enabled ClientSide Generation
    0x01, // BlockNetworkIds Are Hashes
    0x00, // NetworkPermissions: Server Auth Sound Enabled
    0x00, // Server Configuration Join Info: absent
    ...string('JSPrismarine'), // Server Telemetry Data: Server Id
    ...string('scenario'), // Scenario Id
    ...string('world-id'), // World Id
    ...string('') // Owner Id
]);

describe('StartGamePacket', () => {
    it('writes the header and the fields through the spawn position as 2193 lays them out', () => {
        const buffer = build().getBuffer();

        expect(buffer.subarray(0, HEAD.length)).toEqual(HEAD);
    });

    it('writes the fields after the block properties as 2193 lays them out', () => {
        const buffer = build().getBuffer();

        expect(buffer.subarray(buffer.length - TAIL.length)).toEqual(TAIL);
    });

    it('is read whole by the protocol package decoder, with nothing left over', () => {
        const { stream } = decode(build());

        expect(stream.feof()).toBe(true);
    });

    it('decodes to the values it was given', () => {
        const { data } = decode(build());

        expect(data.entityId).toBe(-2n);
        expect(data.runtimeEntityId).toBe(7n);
        expect(data.gamemode).toBe(1);
        expect(data.position).toEqual({ x: 0.5, y: 64, z: -2 });
        expect(data.pitch).toBe(1);
        expect(data.yaw).toBe(180);
        expect(data.seed).toBe(258n);
        expect(data.worldGamemode).toBe(2);
        expect(data.difficulty).toBe(Difficulty.HARD);
        expect(data.spawnPosition).toEqual({ x: 8, y: -60, z: -16 });
        expect(data.dayCycleStopTime).toBe(6000);
        expect(data.levelId).toBe('level-id');
        expect(data.levelName).toBe('A world');
        expect(data.currentTick).toBe(1234n);
        expect(data.serverVersion).toBe('1.26.50');
        expect(data.serverId).toBe('JSPrismarine');
        expect(data.scenarioId).toBe('scenario');
        expect(data.worldId).toBe('world-id');
        expect(data.ownerId).toBe('');
    });

    it('writes the movement settings as a rewind size and a flag, with no mode in front', () => {
        const { data } = decode(build());

        expect(data.rewindHistorySize).toBe(0);
        expect(data.serverAuthoritativeBlockBreaking).toBe(false);
        expect(data.enchantmentSeed).toBe(0);
    });

    it('declares hashed block ids, the item stack net manager, and no join information', () => {
        const { data } = decode(build());

        expect(data.blockNetworkIdsAreHashes).toBe(true);
        expect(data.enableItemStackNetManager).toBe(true);
        expect(data.clientSideGeneration).toBe(false);
        expect(data.serverAuthoritativeSound).toBe(false);
        expect(data.serverJoinInformation).toBeUndefined();
        expect(data.forceExperimentalGameplay).toBeUndefined();
        expect(data.playerPermissions).toBe(1);
        expect(data.worldTemplateId).toEqual({ mostSignificantBits: 0n, leastSignificantBits: 0n });
    });

    it('carries the game rules in a form the decoder reads back', () => {
        const { data } = decode(build());
        const names = data.gameRules.map((rule) => rule.name);

        expect(data.gameRules).toHaveLength(19);
        expect(names).toContain('randomtickspeed');
        expect(data.gameRules.find((rule) => rule.name === 'randomtickspeed')).toMatchObject({
            editable: true,
            value: 3
        });
        expect(data.gameRules.find((rule) => rule.name === 'keepinventory')).toMatchObject({
            editable: true,
            value: false
        });
    });

    it('declares the data driven vanilla blocks, each definition verbatim', () => {
        const { data } = decode(build());

        // No plugin registered a block, so the list is the shipped vanilla definitions.
        expect(data.blockProperties).toHaveLength(block_definitions.length);
        expect(data.blockProperties).toEqual(
            block_definitions.map((block) => ({ name: block.name, definition: block.definition }))
        );
    });

    it('writes a negative seed as its two 64 bit complement bytes', () => {
        const buffer = build(-1).getBuffer();
        const { data } = decode(build(-1));

        expect(buffer.subarray(SEED_OFFSET, SEED_OFFSET + 8)).toEqual(Buffer.alloc(8, 0xff));
        expect(data.seed).toBe(0xffff_ffff_ffff_ffffn);
    });
});
