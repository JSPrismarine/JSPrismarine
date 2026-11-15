/**
 * The seven packets the Minecraft Preview protocol 2259 (1.26.70.24) added.
 *
 * Every layout is read off Mojang's v1.26.70-preview.24 `metadata.zip` with the conventions
 * `added2225.ts` documents: `Compression` on an integer is a varint, and a property the schema
 * leaves out of `required` travels behind a presence byte. Mojang's changelog agrees with each.
 *
 * @see `docs/research/protocol-2259-delta.md`
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';
import { itemStackDescriptor } from '../structureTypes';
import { signedAudioContent } from './added2225';

import type { PayloadOf } from '../define';

/** `MusicPlaybackState`, the uint8 the music playback packets carry. */
export enum MusicPlaybackState {
    Local = 0,
    Online = 1,
    NotFound = 2,
    Pending = 3
}

/** `VirtualContainerClosePacket::Kind`: which side of the close handshake this is. */
export enum VirtualContainerCloseKind {
    Request = 0,
    Closed = 1,
    Confirmed = 2
}

/** `VirtualContainerClosePacket::Cause`: why the container closed. */
export enum VirtualContainerCloseCause {
    Unknown = 0,
    UserClosed = 1,
    ServerRequested = 2,
    UserBusy = 3,
    ClientNotReady = 4,
    InvalidContents = 5,
    UiCreationFailed = 6,
    UiCancelled = 7
}

/** `SignedChat`: a chat message as Mojang's chat service signed it, every field required. */
const signedChat = t.record({
    /** [0] `Key Id`. */
    keyId: t.string,
    /** [1] `Sender Id`. */
    senderId: t.string,
    /** [2] `Message Id`. */
    messageId: t.string,
    /** [3] `Scan Text`. */
    scanText: t.string,
    /** [4] `Redacted Text`. */
    redactedText: t.string,
    /** [5] `Author Name`. */
    authorName: t.string,
    /** [6] `Signature`. */
    signature: t.string
});

/** `ChatFormatting`: text wrapped around the author's name and the message, each part optional. */
const chatFormatting = t.record({
    /** [0] `Name Prefix`. */
    namePrefix: t.optional(t.string),
    /** [1] `Name Postfix`. */
    namePostfix: t.optional(t.string),
    /** [2] `Message Prefix`. */
    messagePrefix: t.optional(t.string),
    /** [3] `Message Postfix`. */
    messagePostfix: t.optional(t.string)
});

/** The `ChatPacket` field list: a signed chat message, with its room and formatting when sent. */
export const chatPacket = definePacket('ChatPacket', {
    /** [0] `Signed Chat`. */
    signedChat,
    /** [1] `Room Id`, optional. */
    roomId: t.optional(t.string),
    /** [2] `Formatting`, optional. */
    formatting: t.optional(chatFormatting)
});

/** The `ServerboundRequestOnlineMusicPlaybackPacket` field list. */
export const serverboundRequestOnlineMusicPlaybackPacket = definePacket('ServerboundRequestOnlineMusicPlaybackPacket', {
    /** [0] `Request ID`, a little-endian uint32 the response echoes. */
    requestId: t.lu32,
    /** [1] `Sound Event Name`: the music disc's sound event. */
    soundEventName: t.string
});

/** The `ClientboundOnlineMusicPlaybackResponsePacket` field list. */
export const clientboundOnlineMusicPlaybackResponsePacket = definePacket(
    'ClientboundOnlineMusicPlaybackResponsePacket',
    {
        /** [0] `Request ID`, the request this answers. */
        requestId: t.lu32,
        /** [1] `State`; see {@link MusicPlaybackState}. */
        state: t.uint8,
        /** [2] `Shared Metadata`. */
        sharedMetadata: signedAudioContent,
        /** [3] `Playback Content`. */
        playbackContent: signedAudioContent
    }
);

/** The `PlayerToggleArmorVisibilityRequestPacket` field list. */
export const playerToggleArmorVisibilityRequestPacket = definePacket('PlayerToggleArmorVisibilityRequestPacket', {
    /** [0] `Hide Armor`: whether the player asks to hide their equipped armor. */
    hideArmor: t.bool
});

/** The `ClientboundMusicPlaybackFailurePacket` field list: one entry per disc that failed. */
export const clientboundMusicPlaybackFailurePacket = definePacket('ClientboundMusicPlaybackFailurePacket', {
    /** [0] `Failures`. */
    failures: t.list(
        t.record({
            /** [0] `State`; see {@link MusicPlaybackState}. */
            state: t.uint8,
            /** [1] `Description`: the song's description. */
            description: t.string
        })
    )
});

/** The `VirtualContainerOpenPacket` field list: a container UI with no block or entity behind it. */
export const virtualContainerOpenPacket = definePacket('VirtualContainerOpenPacket', {
    /** [0] `Container Id`. */
    containerId: t.uint8,
    /** [1] `Session Id`, a varuint64 the close handshake names. */
    sessionId: t.varuint64,
    /** [2] `Title`. */
    title: t.string,
    /** [3] `Slots`: the container's contents, one to 54 stacks. */
    slots: t.list(itemStackDescriptor)
});

/** The `VirtualContainerClosePacket` field list. */
export const virtualContainerClosePacket = definePacket('VirtualContainerClosePacket', {
    /** [0] `Session Id`, from the `VirtualContainerOpenPacket` that opened it. */
    sessionId: t.varuint64,
    /** [1] `Kind`; see {@link VirtualContainerCloseKind}. */
    kind: t.uint8,
    /** [2] `Cause`; see {@link VirtualContainerCloseCause}. */
    cause: t.uint8
});

/** Payload of `ChatPacket`. */
export type ChatPayload = PayloadOf<typeof chatPacket>;
/** Payload of `ServerboundRequestOnlineMusicPlaybackPacket`. */
export type ServerboundRequestOnlineMusicPlaybackPayload = PayloadOf<
    typeof serverboundRequestOnlineMusicPlaybackPacket
>;
/** Payload of `ClientboundOnlineMusicPlaybackResponsePacket`. */
export type ClientboundOnlineMusicPlaybackResponsePayload = PayloadOf<
    typeof clientboundOnlineMusicPlaybackResponsePacket
>;
/** Payload of `PlayerToggleArmorVisibilityRequestPacket`. */
export type PlayerToggleArmorVisibilityRequestPayload = PayloadOf<typeof playerToggleArmorVisibilityRequestPacket>;
/** Payload of `ClientboundMusicPlaybackFailurePacket`. */
export type ClientboundMusicPlaybackFailurePayload = PayloadOf<typeof clientboundMusicPlaybackFailurePacket>;
/** Payload of `VirtualContainerOpenPacket`. */
export type VirtualContainerOpenPayload = PayloadOf<typeof virtualContainerOpenPacket>;
/** Payload of `VirtualContainerClosePacket`. */
export type VirtualContainerClosePayload = PayloadOf<typeof virtualContainerClosePacket>;
