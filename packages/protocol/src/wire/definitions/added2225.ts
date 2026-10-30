/**
 * The eight packets protocol 2225 (Minecraft 1.26.60) added.
 *
 * Every layout here is read off Mojang's `bedrock-protocol-docs` v1.26.60 `metadata.zip`, the
 * release this repository pins in `packages/minecraft/datagen/manifest.json`: field order is
 * each property's `x-ordinal-index`, and the wire type is its `x-underlying-type` with its
 * `x-serialization-options`. Two conventions from those schemas decide what a reader would
 * otherwise guess at, and both are honored below:
 *
 * - `Compression` on an integer means a ZigZag varint, not a fixed-width little-endian value.
 *   `Recipe Index` is an `int32` *with* `Compression`, so it is a varint32.
 * - A property the schema leaves out of `required` is optional on the wire: a presence `bool`,
 *   then the value.
 *
 * None of these packets appears in the captured login fixtures, because a vanilla server sends
 * none of them during a join, and gophertunnel v1.63.0 predates 1.26.60 and carries none of
 * them either. The schemas are the single source, which is why each field records its ordinal.
 *
 * @see `docs/research/protocol-2225-added-packets.md` for the provenance and the full tables.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { passengerOfBlock } from '../structureTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/** `MatchmakingState`, the uint8 the matchmaking packet leads with. */
export enum MatchmakingState {
    Idle = 0,
    Matchmaking = 1,
    MatchFound = 2,
    Canceled = 3,
    PlayerLeftParty = 4,
    PlayerLeftServer = 5,
    ServerShutdown = 6,
    TimedOut = 7,
    RequeueAsParty = 8
}

/** `CursorItemDragState`: which end of a cursor split-drag this packet reports. */
export enum CursorItemDragState {
    Start = 0,
    Stop = 1
}

/** `AudioContentPlaybackType`: which mixer the audio content plays through. */
export enum AudioContentPlaybackType {
    Music = 0,
    Sound = 1
}

/** `SignedAudioContent`: one compact JWT describing a piece of audio content. */
export interface SignedAudioContent {
    /** `Compact JWT`. */
    compactJwt: string;
}

/** `SignedAudioContent` on the wire: its single string. */
const signedAudioContent: WireType<SignedAudioContent> = t.custom(
    'SignedAudioContent',
    (stream, value) => t.string.write(stream, value.compactJwt),
    (stream) => ({ compactJwt: t.string.read(stream) })
);

/** `MatchmakingStateOptions`: who triggered the matchmaking the state belongs to. */
export interface MatchmakingStateOptions {
    /** `Triggering Player Name`. */
    triggeringPlayerName: string;
    /** `Triggered By Local Player`. */
    triggeredByLocalPlayer: boolean;
}

const matchmakingStateOptions: WireType<MatchmakingStateOptions> = t.custom(
    'MatchmakingStateOptions',
    (stream, value) => {
        t.string.write(stream, value.triggeringPlayerName);
        t.bool.write(stream, value.triggeredByLocalPlayer);
    },
    (stream) => ({
        triggeringPlayerName: t.string.read(stream),
        triggeredByLocalPlayer: t.bool.read(stream)
    })
);

/** `AudioContentRegistrationEntry`: one piece of audio content a client registers. */
export interface AudioContentRegistrationEntry {
    /** `Audio Content ID`. */
    audioContentId: string;
    /** `Shared Metadata`. */
    sharedMetadata: SignedAudioContent;
    /** `Server Content`. */
    serverContent: SignedAudioContent;
    /** `Playback Content`. */
    playbackContent: SignedAudioContent;
}

const audioContentRegistrationEntry: WireType<AudioContentRegistrationEntry> = t.custom(
    'AudioContentRegistrationEntry',
    (stream, value) => {
        t.string.write(stream, value.audioContentId);
        signedAudioContent.write(stream, value.sharedMetadata);
        signedAudioContent.write(stream, value.serverContent);
        signedAudioContent.write(stream, value.playbackContent);
    },
    (stream) => ({
        audioContentId: t.string.read(stream),
        sharedMetadata: signedAudioContent.read(stream),
        serverContent: signedAudioContent.read(stream),
        playbackContent: signedAudioContent.read(stream)
    })
);

/**
 * `PlaySoundPacketPayload`, carried whole inside the audio content packet.
 *
 * The last two fields are absent from the schema's `required` list, so each travels behind a
 * presence byte. `Server Sound Handle` is a wrapper whose one field is a `uint64`.
 */
export interface PlaySoundPayload {
    /** `Name`. */
    name: string;
    /** `Position`. */
    position: t.Vec3Like;
    /** `Volume`. */
    volume: number;
    /** `Pitch`. */
    pitch: number;
    /** `Loop Count`, an `int32` with Compression. */
    loopCount: number;
    /** `Bypass Listener Range Check`. */
    bypassListenerRangeCheck: boolean;
    /** `Server Sound Handle`, or `null` when absent. */
    serverSoundHandle: bigint | null;
    /** `Playback Position Seconds`, or `null` when absent. */
    playbackPositionSeconds: number | null;
}

const playSound: WireType<PlaySoundPayload> = t.custom(
    'PlaySoundPacketPayload',
    (stream, value) => {
        t.string.write(stream, value.name);
        t.blockPos.write(stream, value.position);
        t.lf32.write(stream, value.volume);
        t.lf32.write(stream, value.pitch);
        t.varint32.write(stream, value.loopCount);
        t.bool.write(stream, value.bypassListenerRangeCheck);
        t.optional(t.lu64).write(stream, value.serverSoundHandle);
        t.optional(t.lf32).write(stream, value.playbackPositionSeconds);
    },
    (stream) => ({
        name: t.string.read(stream),
        position: t.blockPos.read(stream),
        volume: t.lf32.read(stream),
        pitch: t.lf32.read(stream),
        loopCount: t.varint32.read(stream),
        bypassListenerRangeCheck: t.bool.read(stream),
        serverSoundHandle: t.optional(t.lu64).read(stream),
        playbackPositionSeconds: t.optional(t.lf32).read(stream)
    })
);

/** The `ClientboundMatchmakingStatePacket` field list. */
export const clientboundMatchmakingStatePacket = definePacket('ClientboundMatchmakingStatePacket', {
    /** [0] `State`; see {@link MatchmakingState}. */
    state: t.uint8,
    /** [1] `Destination Name`. */
    destinationName: t.string,
    /** [2] `Options`, optional. */
    options: t.optional(matchmakingStateOptions)
});

/** The `ServerboundMatchmakingCancelPacket` field list: the schema declares no properties. */
export const serverboundMatchmakingCancelPacket = definePacket('ServerboundMatchmakingCancelPacket', {});

/** The `ServerboundStonecutterSetRecipePacket` field list. */
export const serverboundStonecutterSetRecipePacket = definePacket('ServerboundStonecutterSetRecipePacket', {
    /** [0] `Container Id`. */
    containerId: t.uint8,
    /** [1] `Recipe Index`, an `int32` with Compression. */
    recipeIndex: t.varint32
});

/** The `ClientboundStonecutterSetRecipePacket` field list. */
export const clientboundStonecutterSetRecipePacket = definePacket('ClientboundStonecutterSetRecipePacket', {
    /** [0] `Player Id`, an `ActorUniqueID`. */
    playerId: t.varint64,
    /** [1] `Container Id`. */
    containerId: t.uint8,
    /** [2] `Recipe Index`, an `int32` with Compression. */
    recipeIndex: t.varint32
});

/** The `SetPassengerOfBlockPacket` field list. */
export const setPassengerOfBlockPacket = definePacket('SetPassengerOfBlockPacket', {
    /** [0] `Passenger`, an `ActorUniqueID`. */
    passenger: t.varint64,
    /** [1] `PassengerOfBlockData`, optional. */
    passengerOfBlockData: passengerOfBlock
});

/** The `ServerboundCursorItemDragPacket` field list. */
export const serverboundCursorItemDragPacket = definePacket('ServerboundCursorItemDragPacket', {
    /** [0] `State`; see {@link CursorItemDragState}. */
    state: t.uint8
});

/** The `ClientboundPlayAudioContentPacket` field list. */
export const clientboundPlayAudioContentPacket = definePacket('ClientboundPlayAudioContentPacket', {
    /** [0] `Shared Metadata`. */
    sharedMetadata: signedAudioContent,
    /** [1] `Playback Content`. */
    playbackContent: signedAudioContent,
    /** [2] `Playback Type`; see {@link AudioContentPlaybackType}. */
    playbackType: t.uint8,
    /** [3] `Play Sound`, a whole `PlaySoundPacketPayload`. */
    playSound
});

/** The `ServerboundRegisterAudioContentPacket` field list. */
export const serverboundRegisterAudioContentPacket = definePacket('ServerboundRegisterAudioContentPacket', {
    /** [0] `Registrations`. */
    registrations: t.list(audioContentRegistrationEntry)
});

/** Reports matchmaking state, destination, and optional information about who triggered it. */
export type ClientboundMatchmakingStatePayload = PayloadOf<typeof clientboundMatchmakingStatePacket>;
/** Selects a recipe index in the serverbound stonecutter container. */
export type ServerboundStonecutterSetRecipePayload = PayloadOf<typeof serverboundStonecutterSetRecipePacket>;
/** Updates a player's selected stonecutter recipe for the specified container. */
export type ClientboundStonecutterSetRecipePayload = PayloadOf<typeof clientboundStonecutterSetRecipePacket>;
/** Sets or clears the block a passenger actor is riding. */
export type SetPassengerOfBlockPayload = PayloadOf<typeof setPassengerOfBlockPacket>;
/** Marks the start or stop of a cursor item split-drag. */
export type ServerboundCursorItemDragPayload = PayloadOf<typeof serverboundCursorItemDragPacket>;
/** Plays signed audio content with its playback type and sound parameters. */
export type ClientboundPlayAudioContentPayload = PayloadOf<typeof clientboundPlayAudioContentPacket>;
/** Registers audio content ids and their signed metadata and playback payloads. */
export type ServerboundRegisterAudioContentPayload = PayloadOf<typeof serverboundRegisterAudioContentPacket>;
