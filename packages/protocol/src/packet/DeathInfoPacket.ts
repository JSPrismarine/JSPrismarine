import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The fields of a `DeathInfoPacket`, in wire order. Both belong to the packet's single
 * `Death Cause Message` field, a `DeathCauseMessageType`.
 */
export interface DeathInfo {
    /** `Death Cause Attack Name`: the untranslated death message key, for example "death.attack.lava". */
    cause: string;
    /** `Death Cause Message List`: the parameters the client substitutes into the translated message. */
    messages: string[];
}

/**
 * Tells a client why its player died so the death screen can show the cause.
 *
 * Protocol 2193 layout, in wire order: `Death Cause Attack Name` as a string, then
 * `Death Cause Message List` as a varuint32 count followed by one string per parameter.
 * Strings are a varuint32 byte length followed by UTF-8. The server sends it from
 * `Level::onPlayerDeath`, before the client is respawned.
 */
export default class DeathInfoPacket extends NetworkPacket<DeathInfo> {
    public get id(): number {
        return PacketIdentifier.DEATH_INFO;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: DeathInfo): void {
        stream.writeString(data.cause);
        stream.writeUnsignedVarInt(data.messages.length);
        for (const message of data.messages) {
            stream.writeString(message);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): DeathInfo {
        const cause = stream.readString();

        const messages: string[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            messages.push(stream.readString());
        }

        return { cause, messages };
    }
}
