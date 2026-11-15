import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { networkSettingsPacket, SctpRecoveryProfile } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';

import type { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import type NetworkBinaryStream from '../NetworkBinaryStream';

/** Values the server commonly uses for the smallest payload worth compressing. */
export enum CompressionThreshold {
    /** A threshold of zero disables compression for every packet. */
    COMPRESS_NOTHING = 0,
    /** A threshold of one byte compresses every nonempty payload. */
    COMPRESS_EVERYTHING = 1
}

/** The fields of a `NetworkSettingsPacket`, in wire order. */
export interface NetworkSettings {
    /**
     * `Compression Threshold`: the smallest payload, in bytes, that gets compressed. Zero
     * disables compression outright and 1 compresses everything.
     */
    compressionThreshold: number;
    /**
     * `CompressionAlgorithm`: ZLib 0, Snappy 1, None 65535, as the 1.26.60 docs and Mojang's
     * pinned enum dump list `PacketCompressionAlgorithm`. The 1.26.50 page prints None as 2; that
     * is the docs correction the 2207 changelog row records, not a wire change
     * (`docs/research/protocol-2225-delta.md`). Two bytes wide here; each batch then repeats it
     * in one, where none is 0xff.
     */
    compressionAlgorithm: PacketCompressionAlgorithm;
    /** `Client Throttle Enabled`: whether the client stops ticking players past the threshold. */
    clientThrottlingEnabled: boolean;
    /** `Client Throttle Threshold`: how many players the client ticks before throttling. */
    clientThrottleThreshold: number;
    /** `Client Throttle Scalar`: how hard it throttles once it does. */
    clientThrottleScalar: number;
    /**
     * `SCTP Recovery Profile`, on the wire from protocol 2259. Omitted, it writes `Default`;
     * read from an older protocol, it is `Default`.
     */
    sctpRecoveryProfile?: SctpRecoveryProfile;
}

/**
 * The server's answer to `RequestNetworkSettingsPacket`, and the last packet with no
 * compression prefix: it is itself sent uncompressed, and everything after it carries the
 * algorithm byte.
 *
 * Protocol 2193 and 2225 share one layout after the header: `Compression Threshold` as a
 * little-endian uint16, `CompressionAlgorithm` as a little-endian uint16,
 * `Client Throttle Enabled` as one byte, `Client Throttle Threshold` as a uint8, then
 * `Client Throttle Scalar` as a little-endian float.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/network-settings-packet/
 */
export default class NetworkSettingsPacket extends NetworkPacket<NetworkSettings> {
    public get id(): number {
        return PacketIdentifier.NETWORK_SETTINGS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: NetworkSettings): void {
        layoutAt(networkSettingsPacket, this.codecProtocol).encode(stream, {
            ...data,
            sctpRecoveryProfile: data.sctpRecoveryProfile ?? SctpRecoveryProfile.Default
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): NetworkSettings {
        return layoutAt(networkSettingsPacket, this.codecProtocol).decode(stream);
    }
}
