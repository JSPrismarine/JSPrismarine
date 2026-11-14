import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { TextPacketType, textBodyCarries, textPacket } from '../wire/definitions/chat';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export { TextPacketType };

/** The fields of a text packet. Which optional ones are written depends on `type`. */
export interface Text {
    type: TextPacketType;
    /** "Localize?": whether the client should run the message through its translations. */
    needsTranslation: boolean;
    /** "Player Name". Only written for Chat, Whisper and Announcement. */
    sourceName?: string;
    /** "Message": the text, or a translation key for the parameterized types. */
    message: string;
    /** "Parameter List". Only written for Translate, Popup and JukeboxPopup. */
    parameters?: string[];
    /** "Sender's XUID". */
    xuid: string;
    /** "Platform Id". */
    platformChatId: string;
    /** "Filtered Message". An empty string is sent as absent and read back from absent. */
    filtered: string;
}

/**
 * Chat, system messages, popups and translations (docs id 9).
 *
 * Layout at protocols 2193 and 2225, after the header: "Localize?" boolean (`needsTranslation`), then the
 * "Body" oneOf as a one-byte variant index followed by the one-byte "Message Type" (`type`)
 * and the variant's fields. MessageOnly (0) carries "Message"; AuthorAndMessage (1) carries
 * "Player Name" (`sourceName`) then "Message"; MessageAndParams (2) carries "Message" then a
 * "Parameter List" of varuint count and strings. Then "Sender's XUID", "Platform Id", and
 * "Filtered Message" as an optional: a presence boolean, then the string only when present.
 * The variant index and the "Message Type" are both on the wire: the docs draw each variant's
 * members from zero (translate as 0 inside MessageAndParams), but the byte carries the global
 * `TextPacketType` number (translate as 2), which is what gophertunnel's `text.go` writes
 * after its category byte and what a 1.26 client reads. Older protocols wrote the type first,
 * no variant index, and the filtered string unconditionally.
 *
 * The 1.26.50 page numbers each variant's "Message Type" members from zero, and the 1.26.60
 * page and its changelog "correct" eleven of them to the global values. That is a docs fix,
 * not a wire change: Mojang's pinned `TextPacketType` dump numbers the enum globally, and the
 * wire layout is the same at both protocols.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/text-packet/
 */
export default class TextPacket extends NetworkPacket<Text> {
    public get id(): number {
        return PacketIdentifier.TEXT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: Text): void {
        layoutAt(textPacket, this.codecProtocol).encode(stream, {
            needsTranslation: data.needsTranslation,
            body: {
                type: data.type,
                sourceName: data.sourceName ?? '',
                message: data.message,
                parameters: data.parameters ?? []
            },
            xuid: data.xuid,
            platformChatId: data.platformChatId,
            filtered: data.filtered.length > 0 ? data.filtered : null
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): Text {
        const { needsTranslation, body, xuid, platformChatId, filtered } = layoutAt(
            textPacket,
            this.codecProtocol
        ).decode(stream);
        const carries = textBodyCarries(body.type);

        return {
            type: body.type,
            needsTranslation,
            ...(carries.sourceName ? { sourceName: body.sourceName } : {}),
            message: body.message,
            ...(carries.parameters ? { parameters: body.parameters } : {}),
            xuid,
            platformChatId,
            filtered: filtered ?? ''
        };
    }
}
