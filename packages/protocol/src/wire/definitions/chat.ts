/**
 * The packets that put text on the screen: chat and the title overlay.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { TextPacketType } from '../../packet/TextPacket';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/** The three shapes of the Body variant, as the docs name them. The value is the variant index on the wire. */
const enum BodyVariant {
    MessageOnly = 0,
    AuthorAndMessage = 1,
    MessageAndParams = 2
}

/**
 * The body variant a message type is sent in.
 *
 * Derived rather than stored: it is a restatement of the type, and the two disagreeing is a
 * packet the client reads the wrong number of strings out of. Every type not listed here,
 * `TextObjectAnnouncement` included, is MessageOnly.
 */
const variantOf = (type: TextPacketType): BodyVariant => {
    switch (type) {
        case TextPacketType.Chat:
        case TextPacketType.Whisper:
        case TextPacketType.Announcement:
            return BodyVariant.AuthorAndMessage;

        case TextPacketType.Translate:
        case TextPacketType.Popup:
        case TextPacketType.JukeboxPopup:
            return BodyVariant.MessageAndParams;

        default:
            return BodyVariant.MessageOnly;
    }
};

/** The `Body` oneOf of a text packet: the variant index, the message type, and the variant's fields. */
export interface TextBody {
    /** `Message Type`: a global {@link TextPacketType} value, not an index within the variant. */
    type: TextPacketType;
    /** `Player Name`: carried only by the AuthorAndMessage types. Empty otherwise. */
    sourceName: string;
    /** `Message`: the text, or a translation key for the MessageAndParams types. */
    message: string;
    /** `Parameter List`: carried only by the MessageAndParams types. Empty otherwise. */
    parameters: string[];
}

/**
 * `Body`: the one part of a text packet that is not a flat field list.
 *
 * Which fields travel is decided by the message type, not by the protocol version, so this is
 * one wire type whose reader and writer switch rather than a gate: {@link `../wireGates.ts`}
 * is for version forks only. The variant index and the message type both go on the wire. The
 * docs draw each variant's members from zero (translate as 0 inside MessageAndParams), but
 * the byte carries the global `TextPacketType` number (translate as 2), which is what
 * gophertunnel's `text.go` writes after its category byte and what a 1.26 client reads.
 */
const textBody: WireType<TextBody> = t.custom(
    'TextPacket::Body',
    (stream, value) => {
        const variant = variantOf(value.type);
        t.uint8.write(stream, variant);
        t.uint8.write(stream, value.type);

        switch (variant) {
            case BodyVariant.MessageOnly:
                t.string.write(stream, value.message);
                break;

            case BodyVariant.AuthorAndMessage:
                t.string.write(stream, value.sourceName);
                t.string.write(stream, value.message);
                break;

            case BodyVariant.MessageAndParams:
                t.string.write(stream, value.message);
                t.list(t.string).write(stream, value.parameters);
                break;
        }
    },
    (stream) => {
        // The variant index says which shape follows. The type is read as sent and left to
        // the handler; it is the index, not the type, that decides what to read next.
        const variant = t.uint8.read(stream);
        const type: TextPacketType = t.uint8.read(stream);

        switch (variant) {
            case BodyVariant.MessageOnly:
                return { type, sourceName: '', message: t.string.read(stream), parameters: [] };

            case BodyVariant.AuthorAndMessage: {
                const sourceName = t.string.read(stream);
                return { type, sourceName, message: t.string.read(stream), parameters: [] };
            }

            case BodyVariant.MessageAndParams: {
                const message = t.string.read(stream);
                return { type, sourceName: '', message, parameters: t.list(t.string).read(stream) };
            }

            default:
                throw new Error(`Unknown TextPacket body variant ${variant}`);
        }
    }
);

/**
 * The `TextPacket` field list.
 *
 * Older protocols wrote the message type first, with no variant index, and the filtered
 * string unconditionally.
 */
export const textPacket = definePacket('TextPacket', {
    /** `Localize?`: whether the client should run the message through its translations. */
    needsTranslation: t.bool,
    /** `Body`: the message type and whichever of the text fields that type carries. */
    body: textBody,
    /** `Sender's XUID`. */
    xuid: t.string,
    /** `Platform Id`. */
    platformChatId: t.string,
    /** `Filtered Message`: absent rather than empty when there is nothing to filter to. */
    filtered: t.optional(t.string)
});

/** Sends chat, system text, or translated UI text with the fields required by its message type. */
export type TextPayload = PayloadOf<typeof textPacket>;

/**
 * The `SetTitlePacket` field list.
 *
 * The three trailing strings are the fields the packet gained after 1.16. Omitting them
 * leaves the client reading the next packet's bytes as `Xuid`.
 */
export const setTitlePacket = definePacket('SetTitlePacket', {
    /** `Title Type`: a `TitleType`, saying what `Title Text` means. */
    titleType: t.varint32,
    /** `Title Text`: the text, or JSON for the text object types. */
    titleText: t.string,
    /** `Fade In Time`, in ticks. */
    fadeInTime: t.varint32,
    /** `Stay Time`, in ticks. */
    stayTime: t.varint32,
    /** `Fade Out Time`, in ticks. */
    fadeOutTime: t.varint32,
    /** `Xuid`: empty when the player is not signed in. */
    xuid: t.string,
    /** `Platform Online Id`: a uint64 written as text, or empty. */
    platformOnlineId: t.string,
    /** `Filtered Title Message`: empty leaves `Title Text` in place. */
    filteredTitleMessage: t.string
});

/** Controls the title overlay text, timing, subtitle, and action bar shown to the player. */
export type SetTitlePayload = PayloadOf<typeof setTitlePacket>;
