import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of a `CurrentStructureFeaturePacket`, in wire order. */
export interface CurrentStructureFeature {
    /**
     * `Current Structure Feature`, the identifier of the structure the player stands in, for
     * example "minecraft:village". Empty when the player is not inside any structure.
     */
    currentStructureFeature: string;
}

/**
 * Tells the client which structure feature the player currently occupies.
 *
 * Protocol 2193 layout, in wire order: `Current Structure Feature` as a string (varuint32 byte
 * length, then UTF-8). An empty string means the player left every structure. The server
 * sends it when the structure the player stands in changes.
 */
export default class CurrentStructureFeaturePacket extends NetworkPacket<CurrentStructureFeature> {
    public get id(): number {
        return PacketIdentifier.CURRENT_STRUCTURE_FEATURE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CurrentStructureFeature): void {
        stream.writeString(data.currentStructureFeature);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CurrentStructureFeature {
        return { currentStructureFeature: stream.readString() };
    }
}
