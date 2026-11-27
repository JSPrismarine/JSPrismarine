import { describe, expect, it } from 'vitest';

import type { JavaPacketDefinition, JavaPayload } from './JavaPacket';
import { decodeJavaPacket, encodeJavaPacket, readJavaPacketId, javaPacketId } from './JavaPacket';
import { NEWEST_JAVA_RELEASE } from '../versions/javaReleases';
import {
    BlockChangedAck,
    ClientCommand,
    ClientCommandAction,
    BlockUpdate,
    BossEvent,
    JavaBossBarColor,
    JavaBossBarFlag,
    JavaBossBarOverlay,
    JavaBossEventOperation,
    ChunkBatchFinished,
    ContainerSetContent,
    ContainerSetSlot,
    GameEvent,
    PlayerAction,
    PlayerActionStatus,
    PlayerCombatKill,
    PlayerCommand,
    PlayerCommandAction,
    PlayerInput,
    PlayerInputFlag,
    PlayLogin,
    Respawn,
    SectionBlocksUpdate,
    SetCreativeModeSlot,
    SetEntityData,
    SetEquipment,
    SetHealth,
    UseItemOn,
    SetCenterChunk,
    START_WAITING_FOR_LEVEL_CHUNKS,
    SynchronizePlayerPosition
} from './play';

/** What the vanilla 26.3 server sent an offline player joining its flat world, without packet ids. */
const VANILLA = {
    login: '0000001f0003136d696e6563726166743a6f766572776f726c64116d696e6563726166743a7468655f656e64146d696e6563726166743a7468655f6e6574686572140a0a00010000136d696e6563726166743a6f766572776f726c64fa088e06aedc5c04000000010000c1ffffff0f0000',
    position:
        '014025000000000000c04e000000000000bfe0000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    gameEvent: '0d00000000',
    center: '00ffffffff0f',
    batchFinished: '09'
};

/** Reads `hex` as `definition`, and checks that writing the result gives the same bytes. */
const readBack = <D extends JavaPacketDefinition>(definition: D, hex: string): JavaPayload<D> => {
    const frame = Buffer.concat([idOf(definition), Buffer.from(hex, 'hex')]);
    const value = decodeJavaPacket(NEWEST_JAVA_RELEASE, definition, readJavaPacketId(frame).body);
    expect(encodeJavaPacket(NEWEST_JAVA_RELEASE, definition, value)).toEqual(frame);
    return value;
};

/** A packet id as the VarInt that starts a frame. */
const idOf = (definition: JavaPacketDefinition): Buffer => {
    const bytes: number[] = [];
    let id = javaPacketId(NEWEST_JAVA_RELEASE, definition);
    do {
        bytes.push((id & 0x7f) | (id > 0x7f ? 0x80 : 0));
        id >>>= 7;
    } while (id !== 0);
    return Buffer.from(bytes);
};

describe('play packets against vanilla 26.3', () => {
    it('reads the login vanilla sends a survival player in its flat overworld, and writes it back', () => {
        expect(readBack(PlayLogin, VANILLA.login)).toMatchObject({
            entityId: 31,
            dimensions: ['minecraft:overworld', 'minecraft:the_end', 'minecraft:the_nether'],
            maxPlayers: 20,
            viewDistance: 10,
            dimensionType: 0,
            dimension: 'minecraft:overworld',
            gameMode: 0,
            previousGameMode: null,
            isFlat: true,
            deathLocation: null,
            seaLevel: -63,
            onlineMode: false,
            enforcesSecureChat: false
        });
    });

    it('reads the spawn position and the chunk the view centers on', () => {
        expect(readBack(SynchronizePlayerPosition, VANILLA.position)).toMatchObject({
            teleportId: 1,
            x: 10.5,
            y: -60,
            z: -0.5,
            flags: 0
        });
        expect(readBack(SetCenterChunk, VANILLA.center)).toEqual({ x: 0, z: -1 });
        expect(readBack(GameEvent, VANILLA.gameEvent)).toEqual({ event: START_WAITING_FOR_LEVEL_CHUNKS, value: 0 });
        expect(readBack(ChunkBatchFinished, VANILLA.batchFinished)).toEqual({ batchSize: 9 });
    });
});

describe('block packets', () => {
    /** Writes a packet and reads it back. */
    const roundTrip = <D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>): JavaPayload<D> =>
        decodeJavaPacket(
            NEWEST_JAVA_RELEASE,
            definition,
            readJavaPacketId(encodeJavaPacket(NEWEST_JAVA_RELEASE, definition, value)).body
        );

    it('carries one block by its packed position and its state id', () => {
        const update = { position: { x: -30_000_000, y: -64, z: 29_999_999 }, state: 27_000 };

        expect(roundTrip(BlockUpdate, update)).toEqual(update);
    });

    it("carries a section's blocks as state ids above their place in the section", () => {
        const update = {
            section: { x: -2, y: -4, z: 1_875_000 },
            blocks: [
                { state: 1, x: 15, y: 0, z: 3 },
                { state: 29_000, x: 0, y: 15, z: 15 }
            ]
        };
        const body = encodeJavaPacket(NEWEST_JAVA_RELEASE, SectionBlocksUpdate, update).subarray(
            idOf(SectionBlocksUpdate).length
        );

        // After the section's long: the count, then 1 << 12 | 15 << 8 | 3 << 4 as a VarLong.
        expect([...body.subarray(8, 11)]).toEqual([0x02, 0xb0, 0x3e]);
        expect(roundTrip(SectionBlocksUpdate, update)).toEqual(update);
    });

    it('reads a dig as status, position, face byte and sequence, and acknowledges the sequence', () => {
        // Stop digging at (1, -60, -2) on the top face, prediction 7.
        const body = Buffer.concat([Buffer.from([0x03]), Buffer.alloc(8), Buffer.from([0x01, 0x07])]);
        body.writeBigInt64BE((1n << 38n) | (BigInt.asUintN(26, -2n) << 12n) | BigInt.asUintN(12, -60n), 1);

        const frame = Buffer.concat([idOf(PlayerAction), body]);

        expect(decodeJavaPacket(NEWEST_JAVA_RELEASE, PlayerAction, readJavaPacketId(frame).body)).toEqual({
            status: PlayerActionStatus.StopDestroyBlock,
            position: { x: 1, y: -60, z: -2 },
            face: 1,
            sequence: 7
        });
        expect(roundTrip(BlockChangedAck, { sequence: 300 })).toEqual({ sequence: 300 });
    });
});

describe('inventory packets', () => {
    /** A frame of `definition` with `body` after its id. */
    const frameOf = (definition: JavaPacketDefinition, body: number[]) =>
        readJavaPacketId(Buffer.concat([idOf(definition), Buffer.from(body)])).body;

    it('writes a window as plain stacks, empty slots as a zero count, and reads it back', () => {
        const content = {
            window: 0,
            stateId: 1,
            items: [null, { item: 1, count: 64 }, null],
            carried: null
        };
        const body = encodeJavaPacket(NEWEST_JAVA_RELEASE, ContainerSetContent, content).subarray(
            idOf(ContainerSetContent).length
        );

        // Window, state, three slots: empty, then 64 of item 1 with no components, then empty; no cursor.
        expect([...body]).toEqual([0, 1, 3, 0, 64, 1, 0, 0, 0, 0]);
        expect(
            decodeJavaPacket(NEWEST_JAVA_RELEASE, ContainerSetContent, frameOf(ContainerSetContent, [...body]))
        ).toEqual(content);
    });

    it('reads past the components of a creative stack, each behind its length', () => {
        // Slot 36, 1 of item 900, one added component (type 5, three bytes), one removed (type 7).
        const body = [0x00, 0x24, 0x01, 0x84, 0x07, 0x01, 0x01, 0x05, 0x03, 0xaa, 0xbb, 0xcc, 0x07];

        expect(decodeJavaPacket(NEWEST_JAVA_RELEASE, SetCreativeModeSlot, frameOf(SetCreativeModeSlot, body))).toEqual({
            slot: 36,
            item: { item: 900, count: 1 }
        });
    });

    it('refuses a stack from a server that carries components, rather than misread what follows', () => {
        const body = [0x00, 0x01, 0x00, 0x24, 0x01, 0x05, 0x01, 0x00, 0x01, 0x00];

        expect(() => decodeJavaPacket(NEWEST_JAVA_RELEASE, ContainerSetSlot, frameOf(ContainerSetSlot, body))).toThrow(
            'An item stack carries 1 data components'
        );
    });
});

describe('Use Item On', () => {
    it('reads the hand, the block, the face as a VarInt, the cursor, both flags and the sequence', () => {
        const body = Buffer.concat([
            Buffer.from([0x00]),
            Buffer.alloc(8),
            Buffer.from([0x01]),
            Buffer.alloc(12),
            Buffer.from([0x00, 0x00, 0x09])
        ]);
        body.writeBigInt64BE((1n << 38n) | (BigInt.asUintN(26, -2n) << 12n) | BigInt.asUintN(12, -61n), 1);
        body.writeFloatBE(0.5, 10);
        body.writeFloatBE(1, 14);
        body.writeFloatBE(0.25, 18);
        const frame = Buffer.concat([idOf(UseItemOn), body]);

        expect(decodeJavaPacket(NEWEST_JAVA_RELEASE, UseItemOn, readJavaPacketId(frame).body)).toEqual({
            hand: 0,
            position: { x: 1, y: -61, z: -2 },
            face: 1,
            cursorX: 0.5,
            cursorY: 1,
            cursorZ: 0.25,
            inside: false,
            worldBorderHit: false,
            sequence: 9
        });
    });
});

describe('health and respawn packets', () => {
    const roundTrip = <D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>): JavaPayload<D> =>
        decodeJavaPacket(
            NEWEST_JAVA_RELEASE,
            definition,
            readJavaPacketId(encodeJavaPacket(NEWEST_JAVA_RELEASE, definition, value)).body
        );

    it('writes health and saturation as floats around a VarInt food level', () => {
        const body = encodeJavaPacket(NEWEST_JAVA_RELEASE, SetHealth, { health: 20, food: 18, saturation: 5 }).subarray(
            idOf(SetHealth).length
        );

        expect([...body]).toEqual([0x41, 0xa0, 0, 0, 18, 0x40, 0xa0, 0, 0]);
    });

    it('carries a death message and the respawn button, and reads them back', () => {
        const death = { playerId: 7, message: { translate: 'death.attack.generic', with: ['Steve'] } };

        expect(roundTrip(PlayerCombatKill, death)).toEqual(death);
        expect(roundTrip(ClientCommand, { action: ClientCommandAction.PerformRespawn })).toEqual({ action: 0 });
    });

    it("writes a respawn as the login's spawn fields, then what the client keeps", () => {
        const spawn = {
            dimensionType: 0,
            dimension: 'minecraft:overworld',
            hashedSeed: 0n,
            gameMode: 0,
            previousGameMode: null,
            isDebug: false,
            isFlat: false,
            deathLocation: null,
            portalCooldown: 0,
            seaLevel: 63
        };
        const respawn = encodeJavaPacket(NEWEST_JAVA_RELEASE, Respawn, { ...spawn, dataToKeep: 3 }).subarray(
            idOf(Respawn).length
        );
        const login = encodeJavaPacket(NEWEST_JAVA_RELEASE, PlayLogin, {
            entityId: 1,
            hardcore: false,
            dimensions: [],
            maxPlayers: 20,
            viewDistance: 10,
            simulationDistance: 10,
            reducedDebugInfo: false,
            showDeathScreen: true,
            doLimitedCrafting: false,
            ...spawn,
            onlineMode: false,
            enforcesSecureChat: false
        });

        // The login's spawn fields start after its first nine fields (12 bytes here) and run to its last two.
        expect(respawn.subarray(0, -1)).toEqual(login.subarray(idOf(PlayLogin).length + 12, -2));
        expect(respawn.at(-1)).toBe(3);
    });
});

describe('Set Equipment', () => {
    it('marks every slot but the last as followed by more, and reads the list back', () => {
        const equipment = {
            entityId: 9,
            equipment: [
                { slot: 0, item: { item: 1, count: 1 } },
                { slot: 5, item: null }
            ]
        };
        const body = encodeJavaPacket(NEWEST_JAVA_RELEASE, SetEquipment, equipment).subarray(idOf(SetEquipment).length);

        // Entity 9; main hand (0x80 | 0) with one of item 1; head (5), last, empty.
        expect([...body]).toEqual([9, 0x80, 1, 1, 0, 0, 5, 0]);
        expect(
            decodeJavaPacket(
                NEWEST_JAVA_RELEASE,
                SetEquipment,
                readJavaPacketId(encodeJavaPacket(NEWEST_JAVA_RELEASE, SetEquipment, equipment)).body
            )
        ).toEqual(equipment);
    });
});

describe('Set Entity Metadata', () => {
    it('writes each entry as index, serializer and value, the flags a byte and the pose a VarInt, then the end', () => {
        const data = {
            entityId: 3,
            entries: [
                { index: 0, serializer: 0, value: 0x02 },
                { index: 6, serializer: 20, value: 5 }
            ]
        };
        const body = encodeJavaPacket(NEWEST_JAVA_RELEASE, SetEntityData, data).subarray(idOf(SetEntityData).length);

        expect([...body]).toEqual([3, 0, 0, 0x02, 6, 20, 5, 0xff]);
        expect(
            decodeJavaPacket(
                NEWEST_JAVA_RELEASE,
                SetEntityData,
                readJavaPacketId(encodeJavaPacket(NEWEST_JAVA_RELEASE, SetEntityData, data)).body
            )
        ).toEqual(data);
    });
});

describe('Player Command and Player Input', () => {
    const roundTrip = <D extends JavaPacketDefinition>(definition: D, value: JavaPayload<D>): JavaPayload<D> =>
        decodeJavaPacket(
            NEWEST_JAVA_RELEASE,
            definition,
            readJavaPacketId(encodeJavaPacket(NEWEST_JAVA_RELEASE, definition, value)).body
        );

    it('reads a sprint start as vanilla writes it: the entity, the action, then its data', () => {
        const body = encodeJavaPacket(NEWEST_JAVA_RELEASE, PlayerCommand, {
            entityId: 7,
            action: PlayerCommandAction.StartSprinting,
            data: 0
        }).subarray(idOf(PlayerCommand).length);

        expect([...body]).toEqual([7, 1, 0]);
        expect(roundTrip(PlayerCommand, { entityId: 7, action: PlayerCommandAction.StopSleeping, data: 0 })).toEqual({
            entityId: 7,
            action: 0,
            data: 0
        });
    });

    it('reads the held keys as one byte of flags', () => {
        const flags = PlayerInputFlag.Jump | PlayerInputFlag.Shift;

        expect([
            ...encodeJavaPacket(NEWEST_JAVA_RELEASE, PlayerInput, { flags }).subarray(idOf(PlayerInput).length)
        ]).toEqual([0x30]);
        expect(roundTrip(PlayerInput, { flags })).toEqual({ flags });
    });
});

describe('Boss Event', () => {
    const uuid = '00000000-0000-0000-0000-00000000002a';
    const bodyOf = (value: JavaPayload<typeof BossEvent>) =>
        encodeJavaPacket(NEWEST_JAVA_RELEASE, BossEvent, value).subarray(idOf(BossEvent).length);
    const roundTrip = (value: JavaPayload<typeof BossEvent>) =>
        decodeJavaPacket(
            NEWEST_JAVA_RELEASE,
            BossEvent,
            readJavaPacketId(encodeJavaPacket(NEWEST_JAVA_RELEASE, BossEvent, value)).body
        );

    it('writes an add as the UUID, the operation, the title, the progress, the color, the overlay and the flags', () => {
        const add = {
            uuid,
            operation: {
                type: JavaBossEventOperation.Add,
                title: 'TPS',
                progress: 0.5,
                color: JavaBossBarColor.Green,
                overlay: JavaBossBarOverlay.Notched10,
                flags: JavaBossBarFlag.DarkenScreen | JavaBossBarFlag.CreateWorldFog
            }
        } as const;

        expect([...bodyOf(add)]).toEqual([
            ...Buffer.from(uuid.replaceAll('-', ''), 'hex'),
            0,
            // The title as an NBT string tag: its id, its length, then its bytes.
            8,
            0,
            3,
            ...Buffer.from('TPS'),
            0x3f,
            0,
            0,
            0,
            3,
            2,
            0x05
        ]);
        expect(roundTrip(add)).toEqual(add);
    });

    it('reads back every other operation as it wrote it', () => {
        const operations = [
            { type: JavaBossEventOperation.Remove },
            { type: JavaBossEventOperation.UpdateProgress, progress: 0.25 },
            { type: JavaBossEventOperation.UpdateName, title: { translate: 'entity.minecraft.ender_dragon' } },
            {
                type: JavaBossEventOperation.UpdateStyle,
                color: JavaBossBarColor.White,
                overlay: JavaBossBarOverlay.Notched20
            },
            { type: JavaBossEventOperation.UpdateProperties, flags: JavaBossBarFlag.PlayMusic }
        ] as const;

        for (const operation of operations) expect(roundTrip({ uuid, operation })).toEqual({ uuid, operation });
        expect([...bodyOf({ uuid, operation: { type: JavaBossEventOperation.Remove } })]).toHaveLength(17);
    });

    it('refuses an operation 26.3 does not define', () => {
        const frame = Buffer.concat([idOf(BossEvent), Buffer.from(uuid.replaceAll('-', ''), 'hex'), Buffer.from([6])]);

        expect(() => decodeJavaPacket(NEWEST_JAVA_RELEASE, BossEvent, readJavaPacketId(frame).body)).toThrow(
            /operation 6/
        );
    });
});
