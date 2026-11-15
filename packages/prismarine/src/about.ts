import { advertisedCodec, registeredCodecs } from './network/codec/CodecRegistry';
import { SOFTWARE_NAME, serverVersion } from './version';

/** One protocol version the server speaks and the Minecraft releases that use it. */
export interface AboutProtocol {
    readonly protocolVersion: number;
    /** Minecraft releases on this protocol, in ascending order. */
    readonly minecraftVersions: readonly string[];
    /** Whether this is the protocol the MOTD and query advertise. */
    readonly advertised: boolean;
    /** Whether this protocol is a Minecraft preview, negotiated but never advertised. */
    readonly preview: boolean;
}

/** What the server says about itself wherever it states a version. */
export interface About {
    /** The software name, `JSPrismarine`. */
    readonly software: string;
    /** The software version, without a leading `v`. */
    readonly version: string;
    /** The newest Minecraft release the server speaks, the one it advertises. A preview is never named here. */
    readonly minecraftVersion: string;
    /** The protocol version the server advertises: its newest release, not a preview. */
    readonly protocolVersion: number;
    /** Every protocol version the server speaks, newest first. */
    readonly protocols: readonly AboutProtocol[];
}

/**
 * The one place every version surface reads from: the startup log, `/version`, the server-list
 * MOTD and the query protocol. The software version comes from the build stamp
 * or the package manifest, and the protocols from the codec registry, so a release or a codec
 * added there shows up everywhere at once.
 * @returns {About} The server's software and protocol versions.
 * @example
 * ```typescript
 * const { minecraftVersion, protocolVersion } = about();
 * ```
 */
export const about = (): About => {
    const minecraftVersion = advertisedCodec.minecraftVersions.at(-1);
    if (minecraftVersion === undefined) throw new Error('The advertised codec names no Minecraft version!');
    return {
        software: SOFTWARE_NAME,
        version: serverVersion(),
        minecraftVersion,
        protocolVersion: advertisedCodec.protocolVersion,
        protocols: registeredCodecs.map((codec) => ({
            protocolVersion: codec.protocolVersion,
            minecraftVersions: codec.minecraftVersions,
            advertised: codec === advertisedCodec,
            preview: codec.preview === true
        }))
    };
};
