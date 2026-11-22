import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { transferPacket } from '../wire/definitions/transfer';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { TransferPayload } from '../wire/definitions/transfer';

/** Data carried when sending the client to another server. */
export type Transfer = TransferPayload;

/** The optional experience metadata sent with a server transfer. */
export type GatheringsConfig = NonNullable<Transfer['gatheringsConfig']>;

/**
 * Sends the client to another server, optionally supplying metadata for a hosted experience.
 *
 * Protocols 2193 and 2225 share one layout: `Server Address` as a string, `Server Port` as uint16 little-endian,
 * `Reload World` as a boolean, then an optional `Gatherings Configuration`. Each optional
 * field in that configuration has its own presence boolean.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/transfer-packet/
 */
export default class TransferPacket extends NetworkPacket<Transfer> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'TransferPacket';
    }

    public get id(): number {
        return PacketIdentifier.TRANSFER;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: Transfer): void {
        layoutAt(transferPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): Transfer {
        return layoutAt(transferPacket, this.codecProtocol).decode(stream);
    }
}
