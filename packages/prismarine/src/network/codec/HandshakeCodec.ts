import { createHandshakeCodec } from '@jsprismarine/protocol';
import { advertisedCodec } from './CodecRegistry';

/** Server-configured pre-negotiation codec, built from the Protocol helper and this server's data. */
export default createHandshakeCodec(advertisedCodec);
