/**
 * The client's empty acknowledgement after it derives the session key and enables encryption.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/client-to-server-handshake-packet/}
 */
import { definePacket } from '../define';

import type { PayloadOf } from '../define';

/**
 * The `ClientToServerHandshakePacket` field list: empty.
 *
 * The client's answer to `ServerToClientHandshake` says only that the client derived the key
 * and turned encryption on, so it carries its meaning by arriving readable rather than by its
 * contents. The empty list is still a definition so the registry accounts for the packet and
 * the round-trip suite holds it to writing no bytes: a field appearing here would leave the
 * first encrypted batch a byte long.
 */
export const clientToServerHandshakePacket = definePacket('ClientToServerHandshakePacket', {});

/** Completes the client handshake; encryption state is signaled by the first encrypted bytes. */
export type ClientToServerHandshakePayload = PayloadOf<typeof clientToServerHandshakePacket>;
