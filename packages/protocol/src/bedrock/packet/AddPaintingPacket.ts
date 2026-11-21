import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { addPaintingPacket } from '../wire/definitions/addPainting';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { AddPaintingPayload } from '../wire/definitions/addPainting';

/** Data needed to add a painting actor to the client world. */
export type AddPainting = AddPaintingPayload;

/**
 * Adds a painting actor without a generic actor-add packet. The motif identifies both the
 * artwork and its dimensions, so no generic actor metadata accompanies the position.
 *
 * Layout at protocols 2193 and 2225, which do not differ: `Target Actor ID` as a ZigZag varint64, `Target Runtime ID` as an
 * unsigned varint64, `Position` as three little-endian floats, `Direction` as a ZigZag
 * varint32, then `Motif` as a string.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/add-painting-packet/
 */
export default class AddPaintingPacket extends NetworkPacket<AddPainting> {
    public get id(): number {
        return PacketIdentifier.ADD_PAINTING;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AddPainting): void {
        layoutAt(addPaintingPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AddPainting {
        return layoutAt(addPaintingPacket, this.codecProtocol).decode(stream);
    }
}
