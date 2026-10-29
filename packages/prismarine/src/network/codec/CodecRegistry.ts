import Codec2193 from './Codec2193';
import type { ProtocolCodec } from './ProtocolCodec';

/** Every codec the server speaks, keyed by protocol version. */
const codecs: ReadonlyMap<number, ProtocolCodec> = new Map([[Codec2193.protocolVersion, Codec2193]]);

/**
 * The codec for a protocol version a client announced.
 * @param {number} protocolVersion - the version from `RequestNetworkSettings`.
 * @returns {ProtocolCodec | undefined} the codec, or `undefined` for an unsupported version.
 */
export const codecForProtocol = (protocolVersion: number): ProtocolCodec | undefined => codecs.get(protocolVersion);

/** The newest codec the server speaks: what a refusal names as the version to use. */
export const latestCodec: ProtocolCodec = Codec2193;
