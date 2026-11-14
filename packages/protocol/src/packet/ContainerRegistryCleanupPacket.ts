import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { containerRegistryCleanupPacket } from '../wire/definitions/containerRegistryCleanup';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ContainerRegistryCleanupPayload } from '../wire/definitions/containerRegistryCleanup';

/** The fields of a `ContainerRegistryCleanupPacket`, in wire order. */
export type ContainerRegistryCleanup = ContainerRegistryCleanupPayload;

/**
 * Tells the client which dynamic containers to forget.
 *
 * Whenever the server-side container registry cleans up, it gathers the identifiers of the
 * removed containers and sends them so the client-side registry removes the same ones.
 *
 * Protocols 2193 and 2225 share one layout: `Removed Containers` as a varuint32 count followed by one
 * `FullContainerName` per container, each a `Container Name` byte and an optional
 * `Dynamic ID` (presence byte, then a little-endian uint32 when present).
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/container-registry-cleanup-packet/
 */
export default class ContainerRegistryCleanupPacket extends NetworkPacket<ContainerRegistryCleanup> {
    public get id(): number {
        return PacketIdentifier.CONTAINER_REGISTRY_CLEANUP;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ContainerRegistryCleanup): void {
        layoutAt(containerRegistryCleanupPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ContainerRegistryCleanup {
        return layoutAt(containerRegistryCleanupPacket, this.codecProtocol).decode(stream);
    }
}
