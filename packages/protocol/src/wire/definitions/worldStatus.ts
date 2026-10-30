/**
 * The small world-state packets: one or a few primitive fields each, layouts unchanged since
 * protocol 2193. Field names and order follow each packet's docs page.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

/** The `SetTimePacket` field list: the world tick as one ZigZag varint. */
export const setTimePacket = definePacket('SetTimePacket', {
    /** `Time`: the world tick. */
    time: t.varint32
});

/** The `SetHealthPacket` field list. */
export const setHealthPacket = definePacket('SetHealthPacket', {
    /** `Health`: the player's health, as the server last computed it. */
    health: t.varint32
});

/** The `SetCommandsEnabledPacket` field list. */
export const setCommandsEnabledPacket = definePacket('SetCommandsEnabledPacket', {
    /** `Commands Enabled`: whether this client may run commands. */
    commandsEnabled: t.bool
});

/** The `SetDifficultyPacket` field list. */
export const setDifficultyPacket = definePacket('SetDifficultyPacket', {
    /** `Difficulty`: 0 peaceful through 3 hard. */
    difficulty: t.varuint32
});

/** The `SetSpawnPositionPacket` field list. */
export const setSpawnPositionPacket = definePacket('SetSpawnPositionPacket', {
    /** `Spawn Position Type`: 0 player spawn, 1 world spawn. */
    type: t.varint32,
    /** `Block Position`: where to spawn. */
    position: t.blockPos,
    /** `Dimension Type`: the dimension the position is in. */
    dimension: t.varint32,
    /** `Spawn Block Position`: the block that caused the spawn point, e.g. the bed. */
    blockPosition: t.blockPos
});

/** The `RespawnPacket` field list. */
export const respawnPacket = definePacket('RespawnPacket', {
    /** `Position`: where to respawn. */
    position: t.vec3,
    /** `State`: the respawn handshake state byte. */
    state: t.uint8,
    /** `Runtime Entity ID`: whose respawn this is. */
    runtimeEntityId: t.varuint64
});

/** The `PlayerHotbarPacket` field list. */
export const playerHotbarPacket = definePacket('PlayerHotbarPacket', {
    /** `Selected Slot`: which hotbar slot is held. */
    selectedSlot: t.varuint32,
    /** `Container ID`: the window the slot is in. */
    containerId: t.uint8,
    /** `Should Select Slot`: whether the client should move its selection. */
    shouldSelectSlot: t.bool
});

/** The `NetworkChunkPublisherUpdatePacket` field list. */
export const networkChunkPublisherUpdatePacket = definePacket('NetworkChunkPublisherUpdatePacket', {
    /** `Position`: the block position chunks are published around. */
    position: t.blockPos,
    /** `New Radius For View`: in blocks. */
    radius: t.varuint32,
    /** `Saved Chunks`: the chunks already saved, as coordinate pairs behind a `lu32` count. */
    savedChunks: t.listWith(t.lu32, t.pair('x', t.varint32, 'z', t.varint32))
});

/** The `NetworkSettingsPacket` field list. */
export const networkSettingsPacket = definePacket('NetworkSettingsPacket', {
    /** `Compression Threshold`: the smallest batch worth compressing. */
    compressionThreshold: t.lu16,
    /** `Compression Algorithm`: 0 zlib, 1 snappy, 0xffff none. */
    compressionAlgorithm: t.lu16,
    /** `Client Throttle Enabled`. */
    clientThrottlingEnabled: t.bool,
    /** `Client Throttle Threshold`. */
    clientThrottleThreshold: t.uint8,
    /** `Client Throttle Scalar`. */
    clientThrottleScalar: t.lf32
});

/** The `UpdateAdventureSettingsPacket` field list. */
export const updateAdventureSettingsPacket = definePacket('UpdateAdventureSettingsPacket', {
    /** `No PvM`. */
    noAttackingMobs: t.bool,
    /** `No MvP`. */
    noAttackingPlayers: t.bool,
    /** `Immutable World`. */
    worldImmutable: t.bool,
    /** `Show Name Tags`. */
    showNameTags: t.bool,
    /** `Auto Jump`. */
    autoJump: t.bool
});

/** The `PlayerFogPacket` field list. */
export const playerFogPacket = definePacket('PlayerFogPacket', {
    /** `Fog Stack`: fog setting identifiers, nearest last. */
    fogStack: t.list(t.string)
});
