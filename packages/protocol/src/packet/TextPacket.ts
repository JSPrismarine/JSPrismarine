import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

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
    Json
}

export interface Text {
    type: TextType;
    needsTranslation: boolean;
    /** Only present for the three types that name a speaker. */
    sourceName?: string;
    message: string;
    /** Only present for the three translated types. */
    parameters?: string[];
    xuid: string;
    platformChatId: string;
    filtered: string;
}

/** Which types carry a speaker, and which carry translation parameters. */
const WITH_SOURCE = new Set([TextType.Chat, TextType.Whisper, TextType.Announcement]);
const WITH_PARAMETERS = new Set([TextType.Translation, TextType.Popup, TextType.JukeboxPopup]);

/**
 * Chat, system messages, popups and translations, all down one packet whose shape depends on
 * its first byte.
 *
 * The three groups are not a formality: reading a `Chat` as if it were `Raw` leaves the
 * speaker's name in the stream and every field after it comes out shifted.
 */
export default class TextPacket extends NetworkPacket<Text> {
    public get id(): number {
        return PacketIdentifier.TEXT;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: Text): void {
        stream.writeByte(data.type);
        stream.writeBoolean(data.needsTranslation);

        if (WITH_SOURCE.has(data.type)) stream.writeString(data.sourceName ?? '');

        stream.writeString(data.message);

        if (WITH_PARAMETERS.has(data.type)) {
            const parameters = data.parameters ?? [];
            stream.writeUnsignedVarInt(parameters.length);
            for (const parameter of parameters) {
                stream.writeString(parameter);
            }
        }

        stream.writeString(data.xuid);
        stream.writeString(data.platformChatId);
        stream.writeString(data.filtered);
    }

    protected deserializePayload(stream: NetworkBinaryStream): Text {
        const type = stream.readByte() as TextType;
        const needsTranslation = stream.readBoolean();

        const sourceName = WITH_SOURCE.has(type) ? stream.readString() : undefined;
        const message = stream.readString();

        let parameters: string[] | undefined;
        if (WITH_PARAMETERS.has(type)) {
            parameters = [];
            let count = stream.readUnsignedVarInt();
            while (count-- > 0) {
                parameters.push(stream.readString());
            }
        }

        return {
            type,
            needsTranslation,
            ...(sourceName === undefined ? {} : { sourceName }),
            message,
            ...(parameters === undefined ? {} : { parameters }),
            xuid: stream.readString(),
            platformChatId: stream.readString(),
            filtered: stream.readString()
        };
    }
}
