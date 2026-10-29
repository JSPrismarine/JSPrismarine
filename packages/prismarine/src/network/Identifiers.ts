import { minecraftVersions, packetIds, protocolVersion } from './codec/v2193';

/**
 * The protocol 2193 constants, flattened into one object.
 *
 * @deprecated Derived from `Codec2193` for existing consumers; read the codec (or the
 * session's `ProtocolCodec`) instead, which carries the same facts per protocol version.
 */
const Identifiers = {
    Protocol: protocolVersion,
    MinecraftVersions: minecraftVersions,

    ...packetIds
};

export default Identifiers;
