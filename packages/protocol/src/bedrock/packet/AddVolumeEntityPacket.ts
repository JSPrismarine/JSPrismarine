import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { addVolumeEntityPacket } from '../wire/definitions/addVolumeEntity';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { AddVolumeEntityPayload } from '../wire/definitions/addVolumeEntity';

/** The fields of an `AddVolumeEntityPacket`, in wire order. */
export type AddVolumeEntity = AddVolumeEntityPayload;

/**
 * Tells the client about a volume entity, the box a behavior pack's volume definition
 * covers, and the components that apply inside it.
 *
 * Protocol 2193 layout, in wire order: `Entity Network Id` (varuint32), `Components` as a
 * network NBT compound (little endian with varint lengths; the docs leave its type as
 * "unknown"), `JSON Identifier` and `Instance Name` as strings, `Min Bounds` and `Max Bounds`
 * as a `BlockPos` each (three ZigZag varint32s), `Dimension Type` (ZigZag varint32),
 * then `Engine Version` as a string. Strings are a varuint32 byte length followed by UTF-8.
 *
 * 1.26.70-preview.20 removes this packet and `RemoveVolumeEntityPacket`.
 */
export default class AddVolumeEntityPacket extends NetworkPacket<AddVolumeEntity> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'AddVolumeEntityPacket';
    }

    public get id(): number {
        return PacketIdentifier.ADD_VOLUME_ENTITY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AddVolumeEntity): void {
        layoutAt(addVolumeEntityPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AddVolumeEntity {
        return layoutAt(addVolumeEntityPacket, this.codecProtocol).decode(stream);
    }
}
