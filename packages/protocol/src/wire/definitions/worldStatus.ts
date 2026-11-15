/**
 * Primitive world-state updates for time, health, difficulty, commands, spawn positions, and
 * respawn progress. Field names and order follow each packet's docs page.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { vector3 } from '../structureTypes';
import { SINCE_2259 } from '../wireGates';

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
    /** `Dimension type`: the dimension the position is in, a `DimensionType`. */
    dimension: t.varint32,
    /** `Spawn Block Pos`: the block that caused the spawn point, e.g. the bed. */
    blockPosition: t.blockPos
});

/** The `RespawnPacket` field list. */
export const respawnPacket = definePacket('RespawnPacket', {
    /** `Position`: where to respawn. */
    position: t.vec3,
    /** `State`: the respawn handshake state byte. */
    state: t.uint8,
    /** `Player Runtime Id`: whose respawn this is. */
    runtimeEntityId: t.varuint64
});

/**
 * The `ChangeDimensionPacket` field list.
 *
 * The 1.26.50 page draws `Loading Screen Id` as a plain uint32 and the 1.26.60 page as optional,
 * with the changelog row "Loading Screen Id is now optional". That row sits in the preview.21
 * section whose Mojang note says the docs were updated "to accurately reflect optionality of
 * specific fields", so it corrects the documentation and is not a wire change
 * (`docs/research/protocol-2225-delta.md`). The field's own description, "Leave empty if there is
 * no loading screen expected", needs the presence byte, and gophertunnel at protocol 2193 writes
 * it, so the one `optional` field serves both versions.
 */
export const changeDimensionPacket = definePacket('ChangeDimensionPacket', {
    /** `Dimension ID`: a `DimensionType`, 0 the Overworld, 1 the Nether, 2 the End. */
    dimension: t.varint32,
    /** `Position`: where in the new dimension the player arrives. */
    position: vector3,
    /** `Respawn`: whether the change followed a death rather than a portal. */
    respawn: t.bool,
    /** `Loading Screen Id`: what `ServerboundLoadingScreenPacket` reports progress against. */
    loadingScreenId: t.optional(t.lu32)
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
    /** `CompressionAlgorithm`: 0 ZLib, 1 Snappy, 0xffff None (the 1.26.50 page's 2 is a docs error). */
    compressionAlgorithm: t.lu16,
    /** `Client Throttle Enabled`. */
    clientThrottlingEnabled: t.bool,
    /** `Client Throttle Threshold`. */
    clientThrottleThreshold: t.uint8,
    /** `Client Throttle Scalar`. */
    clientThrottleScalar: t.lf32,
    /**
     * `SCTP Recovery Profile` from protocol 2259: how quickly NetherNet's SCTP layer
     * retransmits. A client rejects the packet without it, or with a value it does not know.
     */
    sctpRecoveryProfile: gated<SctpRecoveryProfile>(SINCE_2259, t.uint8, 0)
});

/** `SctpRecoveryProfile`, the uint8 `NetworkSettingsPacket` carries from protocol 2259. */
export enum SctpRecoveryProfile {
    Default = 0,
    Fast = 1,
    Balanced = 2
}

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
    /** `Fog Stack`: the fog effect strings created by the `/fog` command. */
    fogStack: t.list(t.string)
});
