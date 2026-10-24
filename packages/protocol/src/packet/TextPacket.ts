import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The "Message Type" of a text packet. The values are the global ones the wire carries. */
export enum TextType {
    Raw,
    Chat,
    Translation,
    Popup,
    JukeboxPopup,
    Tip,
    System,
    Whisper,
    Announcement,
    JsonWhisper,
    Json,
    JsonAnnouncement
}

/** The fields of a text packet. Which optional ones are written depends on `type`. */
export interface Text {
    type: TextType;
    /** "Localize?": whether the client should run the message through its translations. */
    needsTranslation: boolean;
    /** "Player Name". Only written for Chat, Whisper and Announcement. */
    sourceName?: string;
    /** "Message": the text, or a translation key for the parameterized types. */
    message: string;
    /** "Parameter List". Only written for Translation, Popup and JukeboxPopup. */
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
const variantOf = (type: TextType): BodyVariant => {
    switch (type) {
        case TextType.Chat:
        case TextType.Whisper:
        case TextType.Announcement:
            return BodyVariant.AuthorAndMessage;

        case TextType.Translation:
        case TextType.Popup:
        case TextType.JukeboxPopup:
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
        const type: TextType = stream.readByte();

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
