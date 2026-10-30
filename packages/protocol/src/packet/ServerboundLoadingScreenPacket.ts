import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The loading screen edge reported by the client. */
export enum ServerboundLoadingScreenPacketType {
    Unknown = 0,
    StartLoadingScreen = 1,
    EndLoadingScreen = 2
}

/** The screen edge and optional id sent by the client. */
export interface ServerboundLoadingScreen {
    /** Whether the client started or ended a loading screen. */
    loadingScreenType: ServerboundLoadingScreenPacketType;
    /** The id the server gave this screen, absent for the initial join screen. */
    loadingScreenId: number | null;
}

/**
 * Reports that a loading screen opened or closed. The initial join screen has no id; a
 * dimension transition includes the id supplied by the server in `ChangeDimensionPacket`.
 *
 * Protocol 2193 layout: `Loading Screen Packet Type` as a ZigZag varint32, followed by
 * `Loading Screen Id` as a presence boolean and, when present, a uint32 little-endian value.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/serverbound-loading-screen-packet/
 */
export default class ServerboundLoadingScreenPacket extends NetworkPacket<ServerboundLoadingScreen> {
    public get id(): number {
        return PacketIdentifier.SERVERBOUND_LOADING_SCREEN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerboundLoadingScreen): void {
        stream.writeVarInt(data.loadingScreenType);
        stream.writeBoolean(data.loadingScreenId !== null);
        if (data.loadingScreenId !== null) stream.writeUnsignedIntLE(data.loadingScreenId);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerboundLoadingScreen {
        const loadingScreenType = stream.readVarInt();
        const loadingScreenId = stream.readBoolean() ? stream.readUnsignedIntLE() : null;
        return { loadingScreenType, loadingScreenId };
    }
}
