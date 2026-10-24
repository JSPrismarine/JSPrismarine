import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';

import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of an `AddVolumeEntityPacket`, in wire order. */
export interface AddVolumeEntity {
    /** `Entity Network Id`, the `Raw Id` the server later removes the volume by. */
    entityNetworkId: number;
    /** `Components`: the volume's components, such as `minecraft:fog`, as a network NBT compound. */
    components: NBTTagCompound;
    /** `JSON Identifier`: the volume definition's identifier, for example `custom:fog_volume`. */
    jsonIdentifier: string;
    /** `Instance Name` of this volume in the world. */
    instanceName: string;
    /** `Min Bounds`: the corner of the volume with the lowest coordinates, in blocks. */
    minBounds: BlockPos;
    /** `Max Bounds`: the corner of the volume with the highest coordinates, in blocks. */
    maxBounds: BlockPos;
    /** `Dimension Type`: 0 for the Overworld, 1 for the Nether, 2 for the End. */
    dimension: number;
    /** `Engine Version` the volume definition was written for, as a semantic version string. */
    engineVersion: string;
}

/**
 * Tells the client about a volume entity, the box a behavior pack's volume definition
 * covers, and the components that apply inside it.
 *
 * Protocol 2193 layout, in wire order: `Entity Network Id` (varuint32), `Components` as a
 * network NBT compound (little endian with varint lengths; the docs leave its type as
 * "unknown"), `JSON Identifier` and `Instance Name` as strings, `Min Bounds` and `Max Bounds`
 * as a {@link BlockPos} each (three ZigZag varint32s), `Dimension Type` (ZigZag varint32),
 * then `Engine Version` as a string. Strings are a varuint32 byte length followed by UTF-8.
 *
 * 1.26.70-preview.20 removes this packet and `RemoveVolumeEntityPacket`.
 */
export default class AddVolumeEntityPacket extends NetworkPacket<AddVolumeEntity> {
    public get id(): number {
        return PacketIdentifier.ADD_VOLUME_ENTITY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AddVolumeEntity): void {
        stream.writeUnsignedVarInt(data.entityNetworkId);
        data.components.writeToStream(stream, ByteOrder.LITTLE_ENDIAN, true);
        stream.writeString(data.jsonIdentifier);
        stream.writeString(data.instanceName);
        data.minBounds.serialize(stream);
        data.maxBounds.serialize(stream);
        stream.writeVarInt(data.dimension);
        stream.writeString(data.engineVersion);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AddVolumeEntity {
        return {
            entityNetworkId: stream.readUnsignedVarInt(),
            components: NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN, true),
            jsonIdentifier: stream.readString(),
            instanceName: stream.readString(),
            minBounds: BlockPos.deserialize(stream),
            maxBounds: BlockPos.deserialize(stream),
            dimension: stream.readVarInt(),
            engineVersion: stream.readString()
        };
    }
}
