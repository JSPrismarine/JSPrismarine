import {
    minecraftVersions as minecraftVersions2193,
    packetIds as packetIds2193,
    protocolVersion as protocolVersion2193
} from './wire/versions/v2193';
import {
    minecraftVersions as minecraftVersions2225,
    packetIds as packetIds2225,
    protocolVersion as protocolVersion2225
} from './wire/versions/v2225';

/** Metadata shared by every codec for one Bedrock protocol version. */
export interface ProtocolVersionDefinition {
    /** The number a client sends in `RequestNetworkSettingsPacket`. */
    readonly protocolVersion: number;
    /** Minecraft releases that use this wire version, in ascending order. */
    readonly minecraftVersions: readonly string[];
    /** Packet class name to wire id for this version. */
    readonly ids: Readonly<Record<string, number>>;
}

/** Wire definitions supported by this package, oldest protocol version first. */
export const ProtocolVersions = {
    v2193: {
        protocolVersion: protocolVersion2193,
        minecraftVersions: minecraftVersions2193,
        ids: packetIds2193
    },
    v2225: {
        protocolVersion: protocolVersion2225,
        minecraftVersions: minecraftVersions2225,
        ids: packetIds2225
    }
} as const satisfies Record<string, ProtocolVersionDefinition>;
