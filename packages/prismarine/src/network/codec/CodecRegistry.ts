import type { ProtocolCodec, ProtocolCodecRegistry } from '@jsprismarine/protocol';
import { createProtocolCodecRegistry } from '@jsprismarine/protocol';

import Codec2193 from './Codec2193';
import Codec2225 from './Codec2225';

/** Protocol codecs configured with the server's captured item and world data. */
const serverProtocolRegistry = createProtocolCodecRegistry([Codec2193, Codec2225]);

/** Server-configured codecs keyed by the protocol number announced by each client. */
export const codecs: ProtocolCodecRegistry['codecs'] = serverProtocolRegistry.codecs;
/** The newest codec supported by this server. */
export const latestCodec: ProtocolCodec = serverProtocolRegistry.latestCodec;
/** Configured codecs ordered from newest protocol to oldest. */
export const registeredCodecs: readonly ProtocolCodec[] = serverProtocolRegistry.registeredCodecs;
/** Minecraft releases supported by the configured server codecs, in ascending order. */
export const supportedMinecraftVersions: readonly string[] = serverProtocolRegistry.supportedMinecraftVersions;
/** Finds the configured codec matching a client's announced protocol number. */
export const codecForProtocol = serverProtocolRegistry.codecForProtocol;
