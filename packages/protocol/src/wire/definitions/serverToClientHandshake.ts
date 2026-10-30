/**
 * The server's encryption handshake token: a signed JWT whose public key and salt let the
 * client derive the session key.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/server-to-client-handshake-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

/**
 * The `ServerToClientHandshakePacket` field list: the server's half of the encryption
 * handshake, and the last packet it sends in the clear.
 */
export const serverToClientHandshakePacket = definePacket('ServerToClientHandshakePacket', {
    /**
     * `Handshake WebToken`, a JWT signed with the server's ECDSA P-384 key. Its header
     * carries `x5u`, the server's public key as base64 DER, and its payload carries `salt`,
     * base64. The token carries no game state; both ends derive the AES key from it.
     */
    jwt: t.string
});
