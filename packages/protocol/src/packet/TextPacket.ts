import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The docs' `TextPacketType`, the "Message Type" of a text packet. The values are the global
 * ones the wire carries; member names are the docs' names in PascalCase.
 */
export enum TextPacketType {
    Raw,
    Chat,
    Translate,
    Popup,
    JukeboxPopup,
    Tip,
    SystemMessage,
    Whisper,
    Announcement,
    TextObjectWhisper,
    TextObject,
    TextObjectAnnouncement
}

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

/** The three shapes of the Body variant, as the docs name them. The value is the variant index on the wire. */
const enum BodyVariant {
    MessageOnly = 0,
    AuthorAndMessage = 1,
    MessageAndParams = 2
}

/** The body variant a message type is sent in. Every type not listed is MessageOnly. */
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

/**
 * Chat, system messages, popups and translations (docs id 9).
 *
 * Protocol 2193 layout, after the header: "Localize?" boolean (`needsTranslation`), then the
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
 */
export default class TextPacket extends NetworkPacket<Text> {
    public get id(): number {
        return PacketIdentifier.TEXT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: Text): void {
        stream.writeBoolean(data.needsTranslation);

        const variant = variantOf(data.type);
        stream.writeByte(variant);
        stream.writeByte(data.type);

        switch (variant) {
            case BodyVariant.MessageOnly:
                stream.writeString(data.message);
                break;

            case BodyVariant.AuthorAndMessage:
                stream.writeString(data.sourceName ?? '');
                stream.writeString(data.message);
                break;

            case BodyVariant.MessageAndParams: {
                stream.writeString(data.message);
                const parameters = data.parameters ?? [];
                stream.writeUnsignedVarInt(parameters.length);
                for (const parameter of parameters) {
                    stream.writeString(parameter);
                }
                break;
            }
        }

        stream.writeString(data.xuid);
        stream.writeString(data.platformChatId);

        stream.writeBoolean(data.filtered.length > 0);
        if (data.filtered.length > 0) stream.writeString(data.filtered);
    }

    protected deserializePayload(stream: NetworkBinaryStream): Text {
        const needsTranslation = stream.readBoolean();

        // The variant index says which shape follows; the type is carried as sent.
        const variant = stream.readByte();
        const type: TextPacketType = stream.readByte();

        let sourceName: string | undefined;
        let message: string;
        let parameters: string[] | undefined;

        switch (variant) {
            case BodyVariant.MessageOnly:
                message = stream.readString();
                break;

            case BodyVariant.AuthorAndMessage:
                sourceName = stream.readString();
                message = stream.readString();
                break;

            case BodyVariant.MessageAndParams: {
                message = stream.readString();
                parameters = [];
                let count = stream.readUnsignedVarInt();
                while (count-- > 0) {
                    parameters.push(stream.readString());
                }
                break;
            }

            default:
                throw new Error(`Unknown TextPacket body variant ${variant}`);
        }

        const xuid = stream.readString();
        const platformChatId = stream.readString();
        const filtered = stream.readBoolean() ? stream.readString() : '';

        return {
            type,
            needsTranslation,
            ...(sourceName === undefined ? {} : { sourceName }),
            message,
            ...(parameters === undefined ? {} : { parameters }),
            xuid,
            platformChatId,
            filtered
        };
    }
}
