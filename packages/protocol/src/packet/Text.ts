import { NetworkBinaryStream, NetworkPacket, PacketIdentifier } from '../';

export enum MessageType {
    RAW,
    CHAT,
    TRANSLATIE,
    POPUP,
    JUKEBOX_POPUP,
    TIP,
    SYSTEM_MESSAGE,
    WHISPER,
    ANNOUNCEMENT,
    TEXT_OBJECT_WHISPER,
    TEXT_OBJECT,
    TEXT_OBJECT_ANNOUNCEMENT
}

interface BasePacketData {
    messageType: MessageType;
    localize: boolean;
    message: string;
    senderXUID: string;
    platformId: string;
}

interface PacketDataOnlyMessage extends BasePacketData {
    messageType:
        | MessageType.RAW
        | MessageType.TIP
        | MessageType.SYSTEM_MESSAGE
        | MessageType.TEXT_OBJECT_WHISPER
        | MessageType.TEXT_OBJECT
        | MessageType.TEXT_OBJECT_ANNOUNCEMENT;
}

interface PacketDataWithName extends BasePacketData {
    messageType: MessageType.CHAT | MessageType.WHISPER | MessageType.ANNOUNCEMENT;
    playerName: string;
}

interface PacketDataWithParameters extends BasePacketData {
    messageType: MessageType.TRANSLATIE | MessageType.POPUP | MessageType.JUKEBOX_POPUP;
    parameterList: Array<string>;
}

type PacketData = PacketDataOnlyMessage | PacketDataWithName | PacketDataWithParameters;

/**
 * Used for commands, messages, and other info printed to the screen. Most of which are server->client or server broadcasted to all clients.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/TextPacket.html}
 */
export default class TextPacket extends NetworkPacket<PacketData> {
    get id(): number {
        return PacketIdentifier.TEXT;
    }

    protected serializePayload(stream: NetworkBinaryStream, packetData: PacketData): void {
        stream.writeByte(packetData.messageType);
        stream.writeBoolean(packetData.localize);
        switch (packetData.messageType) {
            case MessageType.CHAT:
            case MessageType.WHISPER:
            case MessageType.ANNOUNCEMENT:
                stream.writeString(packetData.playerName);
            case MessageType.RAW:
            case MessageType.TIP:
            case MessageType.SYSTEM_MESSAGE:
            case MessageType.TEXT_OBJECT_WHISPER:
            case MessageType.TEXT_OBJECT:
            case MessageType.TEXT_OBJECT_ANNOUNCEMENT:
                stream.writeString(packetData.message);
                break;
            case MessageType.TRANSLATIE:
            case MessageType.POPUP:
            case MessageType.JUKEBOX_POPUP:
                stream.writeString(packetData.message);
                stream.writeUnsignedVarInt(packetData.parameterList.length);
                for (const parameter of packetData.parameterList) {
                    stream.writeString(parameter);
                }
                break;
        }
        stream.writeString(packetData.senderXUID);
        stream.writeString(packetData.platformId);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PacketData {
        const messageType = stream.readByte();
        const localize = stream.readBoolean();

        let packetData: PacketData;

        switch (messageType) {
            case MessageType.CHAT:
            case MessageType.WHISPER:
            case MessageType.ANNOUNCEMENT: {
                const playerName = stream.readString();
                const message = stream.readString();
                packetData = {
                    messageType,
                    localize,
                    senderXUID: stream.readString(),
                    platformId: stream.readString(),
                    playerName,
                    message
                };
                break;
            }
            case MessageType.RAW:
            case MessageType.TIP:
            case MessageType.SYSTEM_MESSAGE:
            case MessageType.TEXT_OBJECT_WHISPER:
            case MessageType.TEXT_OBJECT:
            case MessageType.TEXT_OBJECT_ANNOUNCEMENT: {
                const message = stream.readString();
                packetData = {
                    messageType,
                    localize,
                    senderXUID: stream.readString(),
                    platformId: stream.readString(),
                    message
                };
                break;
            }
            case MessageType.TRANSLATIE:
            case MessageType.POPUP:
            case MessageType.JUKEBOX_POPUP: {
                const message = stream.readString();
                const parameterListLength = stream.readUnsignedVarInt();
                const parameterList = new Array<string>(parameterListLength);
                for (let i = 0; i < parameterListLength; i++) {
                    parameterList[i] = stream.readString();
                }
                packetData = {
                    messageType,
                    localize,
                    senderXUID: stream.readString(),
                    platformId: stream.readString(),
                    message,
                    parameterList
                };
                break;
            }
            default:
                throw new Error(`Unknown message type: ${messageType}`);
        }
        return packetData;
    }
}
