import { ContainerUiId } from '@jsprismarine/minecraft';
import NetworkStructure from '../NetworkStructure';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * A `FullContainerName`: which container a slot belongs to. `Container Name` is a
 * `ContainerEnumName` (`ContainerUiId` in `@jsprismarine/minecraft`) written as one byte,
 * then `Dynamic ID` tells apart several open containers of the same kind.
 *
 * On the wire `Dynamic ID` is an optional: one presence byte, then a little-endian uint32
 * when present. The 2193 schema lists it as a required uint32 and only records the optional
 * from 2207 on, but gophertunnel at 2193 and the live 1.26.50 client both write the presence
 * byte. `ContainerRegistryCleanupPacket` and the `ItemStackRequest` slot infos use it.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/full-container-name/}
 */
export default class FullContainerName extends NetworkStructure {
    /**
     * @param containerId - `Container Name`.
     * @param dynamicId - `Dynamic ID`, or null when the container is not dynamic.
     */
    public constructor(
        public containerId: ContainerUiId = ContainerUiId.INVENTORY,
        public dynamicId: number | null = null
    ) {
        super();
    }

    /**
     * Writes the `Container Name` byte, then the `Dynamic ID` presence byte and, when set, the id
     * as a little-endian uint32.
     */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeByte(this.containerId);
        stream.writeBoolean(this.dynamicId !== null);
        if (this.dynamicId !== null) stream.writeUnsignedIntLE(this.dynamicId);
    }

    /** Reads the `Container Name` byte, then `Dynamic ID` when its presence byte says one follows. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.containerId = stream.readByte();
        this.dynamicId = stream.readBoolean() ? stream.readUnsignedIntLE() : null;
    }
}
