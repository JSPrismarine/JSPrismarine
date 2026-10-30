/**
 * What a player does that is not movement: an action on a block, a game type change, an emote.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/**
 * The `PlayerActionPacket` field list.
 *
 * Both positions are `BlockPos`, three ZigZag varints with a signed y. The y used to be
 * unsigned on the way up from the client, and has not been since 1.26.10: read unsigned, a
 * ZigZag y comes out doubled and anything below sea level as a number in the billions.
 */
export const playerActionPacket = definePacket('PlayerActionPacket', {
    /** `Player Runtime ID`: who acted. */
    runtimeEntityId: t.varuint64,
    /** `Action`: a `PlayerActionType`. */
    action: t.varint32,
    /** `Block Position`: the block acted on, zero for the actions that name no block. */
    blockPosition: t.blockPos,
    /** `Result Pos`: where the client ended up, for the actions that move it. */
    resultPosition: t.blockPos,
    /** `Face`: which side of the block, or zero. */
    blockFace: t.varint32
});

/** Reports a player action with its action code, affected blocks, and face. */
export type PlayerActionPayload = PayloadOf<typeof playerActionPacket>;

/**
 * The `SetPlayerGameTypePacket` field list.
 *
 * Sent both ways: the client when the player picks a game type, the server back so the client
 * shows the one the server holds.
 */
export const setPlayerGameTypePacket = definePacket('SetPlayerGameTypePacket', {
    /** `Player Game Type`: a `Gametype` value. */
    gametype: t.varint32
});

/** Sets the game type for the player sending or receiving the packet. */
export type SetPlayerGameTypePayload = PayloadOf<typeof setPlayerGameTypePacket>;

/**
 * The `UpdatePlayerGameTypePacket` field list.
 *
 * Every client keeps the game type of every player it knows about, so this goes to all of
 * them and not only to the player who changed.
 */
export const updatePlayerGameTypePacket = definePacket('UpdatePlayerGameTypePacket', {
    /** `Player Game Type`: the game type the target now has. */
    playerGameType: t.varint32,
    /** `Target player`: an `ActorUniqueID`. */
    targetPlayer: t.varint64,
    /** `Tick`: the `PlayerInputTick` the change belongs to; zero costs a little smoothness. */
    tick: t.varuint64
});

/** Announces a player's new game type and the tick associated with the change. */
export type UpdatePlayerGameTypePayload = PayloadOf<typeof updatePlayerGameTypePacket>;

/**
 * The `EmotePacket` field list.
 *
 * Sent by a client to play an emote and by the server to show one on another player. The
 * `Flags` byte carries the server-side and mute-chat bits.
 */
export const emotePacket = definePacket('EmotePacket', {
    /** `Actor Runtime Id`: who is emoting. */
    actorRuntimeId: t.varuint64,
    /** `Emote Id`: the emote piece UUID, as text. */
    emoteId: t.string,
    /** `Emote Length Ticks`: how long it plays. */
    emoteLengthTicks: t.varuint32,
    /** `Xuid`: empty when the player is not signed in. */
    xuid: t.string,
    /** `PlatformId`. */
    platformId: t.string,
    /** `Flags`. */
    flags: t.uint8
});

/** Plays a player's emote with its identity, duration, platform, and display flags. */
export type EmotePayload = PayloadOf<typeof emotePacket>;

/**
 * The `SetLocalPlayerAsInitializedPacket` field list.
 *
 * The last step of a join: until this arrives the server has a player nobody can see, and
 * chunk streaming and entity tracking are both keyed off it.
 */
export const setLocalPlayerAsInitializedPacket = definePacket('SetLocalPlayerAsInitializedPacket', {
    /** `Player ID`: an `ActorRuntimeID`, the runtime id the server gave the player in `StartGame`. */
    runtimeEntityId: t.varuint64
});

/** Marks the local player initialized so the server can begin tracking and streaming it. */
export type SetLocalPlayerAsInitializedPayload = PayloadOf<typeof setLocalPlayerAsInitializedPacket>;
