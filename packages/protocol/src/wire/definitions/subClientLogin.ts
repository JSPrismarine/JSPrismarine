/**
 * `SubClientLoginPacket`: the connection request of a split-screen player that shares the main
 * player's connection.
 *
 * The body is the same framed request `LoginPacket` carries: a varuint byte length over the chain
 * JSON and the client data JWT, each behind a little-endian uint32 length. Neither string is
 * verified here.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/sub-client-login-packet/
 */
import { definePacket } from '../define';
import { connectionRequest } from './login';

import type { PayloadOf } from '../define';

/** The fields sent when an additional local player joins an existing connection. */
export const subClientLoginPacket = definePacket('SubClientLoginPacket', {
    /** `Sub Client Connection Request`: the length-framed chain data and client data. */
    connectionRequest
});

/** Payload carried by `SubClientLoginPacket`, with the request still framed as one field. */
export type SubClientLoginWirePayload = PayloadOf<typeof subClientLoginPacket>;
