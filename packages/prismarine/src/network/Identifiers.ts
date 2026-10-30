import { latestCodec, supportedMinecraftVersions } from './codec/CodecRegistry';
import { packetIds } from '@jsprismarine/protocol/wire/versions/v2193';

/**
 * The advertised protocol facts and the protocol 2193 packet ids, flattened into one object.
 *
 * `Protocol` and `MinecraftVersions` follow the codec registry: the newest registered
 * protocol version, which is what a refusal names and the MOTD advertises, and every game
 * version some registered codec speaks.
 *
 * @deprecated Derived from the codec registry for existing consumers; read the codec (or the
 * session's `ProtocolCodec`) instead, which carries the same facts per protocol version.
 */
const Identifiers = {
    // Getters, not values: this module and the codecs import each other through the packet
    // barrel, so the registry may not have finished evaluating when this object is built.
    get Protocol(): number {
        return latestCodec.protocolVersion;
    },
    get MinecraftVersions(): readonly string[] {
        return supportedMinecraftVersions;
    },

    ...packetIds
};

export default Identifiers;
