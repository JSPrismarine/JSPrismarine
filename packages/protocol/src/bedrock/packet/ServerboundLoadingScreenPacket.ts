import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { serverboundLoadingScreenPacket } from '../wire/definitions/serverboundLoadingScreen';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';

/**
 * The loading screen edge reported by the client. The 1.26.50 docs page prints `StartLoadingScreen`
 * and `EndLoadingScreen` as 0 and 1; Mojang's pinned enum dump
 * (`packages/minecraft/datagen/snapshot/0e00fe80f4f3-enums.html`) lists `Unknown` 0, 1 and 2, and
 * the 1.26.60 page agrees.
 */
export enum ServerboundLoadingScreenPacketType {
    Unknown = 0,
    StartLoadingScreen = 1,
    EndLoadingScreen = 2
}

/** The screen edge and optional id sent by the client. */
export interface ServerboundLoadingScreen {
    /** Whether the client started or ended a loading screen. */
    loadingScreenType: ServerboundLoadingScreenPacketType;
    /**
     * The id the server gave this screen, absent for the initial join screen. The 1.26.60 page marks
     * the field `optional`; the 1.26.50 page omits that marker, and the presence byte stays at both
     * versions (`docs/research/protocol-2225-delta.md`, preview.21 note).
     */
    loadingScreenId: number | null;
}

/**
 * Reports that a loading screen opened or closed. The initial join screen has no id; a
 * dimension transition includes the id supplied by the server in `ChangeDimensionPacket`.
 *
 * Protocol 2193 layout: `Loading Screen Packet Type` as a ZigZag varint32, followed by
 * `Loading Screen Id` as a presence boolean and, when present, a uint32 little-endian value.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/serverbound-loading-screen-packet/
 */
export default class ServerboundLoadingScreenPacket extends NetworkPacket<ServerboundLoadingScreen> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ServerboundLoadingScreenPacket';
    }

    public get id(): number {
        return PacketIdentifier.SERVERBOUND_LOADING_SCREEN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerboundLoadingScreen): void {
        layoutAt(serverboundLoadingScreenPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerboundLoadingScreen {
        return layoutAt(serverboundLoadingScreenPacket, this.codecProtocol).decode(stream);
    }
}
