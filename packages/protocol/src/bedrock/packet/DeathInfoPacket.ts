import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { deathInfoPacket } from '../wire/definitions/deathInfo';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { DeathInfoPayload } from '../wire/definitions/deathInfo';

/**
 * The fields of a `DeathInfoPacket`, in wire order. Both belong to the packet's single
 * `Death Cause Message` field, a `DeathCauseMessageType`.
 */
export type DeathInfo = DeathInfoPayload;

/**
 * Tells a client why its player died so the death screen can show the cause.
 *
 * Layout at protocols 2193 and 2225 (it did not change), in wire order: `Death Cause Attack Name` as a string, then
 * `Death Cause Message List` as a varuint32 count followed by one string per parameter.
 * Strings are a varuint32 byte length followed by UTF-8. The server sends it from
 * `Level::onPlayerDeath`, before the client is respawned.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/death-info-packet/
 */
export default class DeathInfoPacket extends NetworkPacket<DeathInfo> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'DeathInfoPacket';
    }

    public get id(): number {
        return PacketIdentifier.DEATH_INFO;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: DeathInfo): void {
        layoutAt(deathInfoPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): DeathInfo {
        return layoutAt(deathInfoPacket, this.codecProtocol).decode(stream);
    }
}
