/**
 * The handshake phase's one packet, which a client sends first on every connection.
 *
 * Its id and layout are the same in every release, so a server reads it before it knows which
 * release the client speaks.
 */
import { javaString, unsignedShort, varInt } from '../wire/javaTypes';
import { defineJavaPacket } from './JavaPacket';

/** What a client wants after the handshake: the next phase. */
export enum ClientIntent {
    /** A server list ping. */
    Status = 1,
    /** A join. */
    Login = 2,
    /** A join that another server sent the client to. */
    Transfer = 3
}

/** `Intention` (serverbound): the client's protocol, the address it dialed and what it wants. */
export const Intention = defineJavaPacket('Intention', 'handshake/serverbound/intention', {
    protocolVersion: varInt,
    serverAddress: javaString(255),
    serverPort: unsignedShort,
    intent: varInt
});
