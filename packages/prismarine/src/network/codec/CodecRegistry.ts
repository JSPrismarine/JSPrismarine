import Codec2193 from './Codec2193';
import Codec2225 from './Codec2225';
import type { ProtocolCodec } from './ProtocolCodec';

/**
 * Builds a protocol-version-keyed registry over a codec list and names its newest member.
 * The server's registry below is built from the codecs it ships; a test can build one over
 * fakes to exercise negotiation across versions that do not exist yet.
 * @param {readonly ProtocolCodec[]} list - the codecs, each on a distinct protocol version.
 * @returns the lookup map and the codec with the highest protocol version.
 */
export const buildCodecRegistry = (
    list: readonly ProtocolCodec[]
): { codecs: ReadonlyMap<number, ProtocolCodec>; latest: ProtocolCodec } => {
    const codecs = new Map(list.map((codec) => [codec.protocolVersion, codec]));
    if (codecs.size !== list.length) throw new Error('Two codecs claim the same protocol version!');

    const latest = list.reduce((newest, codec) => (codec.protocolVersion > newest.protocolVersion ? codec : newest));
    return { codecs, latest };
};

/** Every codec the server speaks, keyed by protocol version. */
const { codecs, latest } = buildCodecRegistry([Codec2193, Codec2225]);

/**
 * Every registered codec, newest protocol version first. The order diagnostics list them in:
 * the newest is the one {@link latestCodec} names and the one the MOTD advertises.
 */
export const registeredCodecs: readonly ProtocolCodec[] = [...codecs.values()].sort(
    (a, b) => b.protocolVersion - a.protocolVersion
);

/**
 * Every Minecraft version some registered codec speaks, ascending. What the server
 * advertises as its supported game versions.
 */
export const supportedMinecraftVersions: readonly string[] = [...registeredCodecs]
    .reverse()
    .flatMap((codec) => codec.minecraftVersions);

/**
 * The codec for a protocol version a client announced.
 * @param {number} protocolVersion - the version from `RequestNetworkSettings`.
 * @returns {ProtocolCodec | undefined} the codec, or `undefined` for an unsupported version.
 */
export const codecForProtocol = (protocolVersion: number): ProtocolCodec | undefined => codecs.get(protocolVersion);

/** The newest codec the server speaks: what a refusal names as the version to use. */
export const latestCodec: ProtocolCodec = latest;
