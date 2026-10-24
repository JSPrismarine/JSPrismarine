import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import FullContainerName from '../structure/FullContainerName';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `ContainerRegistryCleanupPacket`, in wire order. */
export interface ContainerRegistryCleanup {
    /** `Removed Containers`: one `FullContainerName` per container the server's registry dropped. */
    removedContainers: FullContainerName[];
}

/**
 * Tells the client which dynamic containers to forget.
 *
 * Whenever the server-side container registry cleans up, it gathers the identifiers of the
 * removed containers and sends them so the client-side registry removes the same ones.
 *
 * Protocol 2193 layout: `Removed Containers` as a varuint32 count followed by one
 * {@link FullContainerName} per container, each a `Container Name` byte and an optional
 * `Dynamic ID` (presence byte, then a little-endian uint32 when present).
 */
export default class ContainerRegistryCleanupPacket extends NetworkPacket<ContainerRegistryCleanup> {
    public get id(): number {
        return PacketIdentifier.CONTAINER_REGISTRY_CLEANUP;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ContainerRegistryCleanup): void {
        stream.writeUnsignedVarInt(data.removedContainers.length);
        for (const container of data.removedContainers) {
            container.serialize(stream);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): ContainerRegistryCleanup {
        const removedContainers: FullContainerName[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            removedContainers.push(FullContainerName.deserialize(stream));
        }

        return { removedContainers };
    }
}
