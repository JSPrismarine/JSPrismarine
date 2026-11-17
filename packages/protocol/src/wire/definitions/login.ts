/**
 * `LoginPacket`: the client's protocol number and its connection request.
 *
 * The request is a varuint byte length over two blobs, each with its own little-endian uint32
 * length. The outer length is redundant with the inner ones, and the reader enforces it: it takes
 * the request as a sub-buffer of that length, so a request claiming more than it carries fails
 * here rather than consuming the next packet in the batch, and one with bytes left after the
 * second blob is refused.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/login-packet/
 */
import BinaryStream from '@jsprismarine/binaryutils';

import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/** The two JWT strings of a connection request, carried as text and not interpreted. */
export interface ConnectionRequest {
    /** The chain JSON, as the client sent it. */
    chainData: string;
    /** The client data JWT. */
    clientData: string;
}

/**
 * `Connection Request`: a varuint byte length, then the chain data and the client data, each
 * an ASCII string behind a little-endian uint32 length. Decoding refuses a request that does not
 * end exactly after the client data.
 */
export const connectionRequest = t.custom<ConnectionRequest>(
    'ConnectionRequest',
    (stream, value) => {
        const request = new BinaryStream();
        for (const blob of [value.chainData, value.clientData]) {
            const bytes = Buffer.from(blob, 'ascii');
            request.writeUnsignedIntLE(bytes.byteLength);
            request.write(bytes);
        }

        stream.writeLengthPrefixed(request.getWriteBuffer());
    },
    (stream) => {
        // Read through the declared length rather than past it, so a request claiming more than
        // it carries fails here instead of silently consuming the next packet in the batch.
        const request = new BinaryStream(stream.readLengthPrefixed());
        const chainData = request.read(request.readUnsignedIntLE()).toString('ascii');
        const clientData = request.read(request.readUnsignedIntLE()).toString('ascii');

        if (!request.feof()) {
            const unread = request.readRemaining().byteLength;
            throw new ProtocolWireErrors.ConnectionRequestHasTrailingBytes({ unread });
        }

        return { chainData, clientData };
    }
);

/** The fields a client sends to start a connection. */
export const loginPacket = definePacket('LoginPacket', {
    /**
     * `Client Network Version`: a big-endian int32, not a varint, so a server of another version
     * can read it and refuse the connection for the right reason.
     */
    protocolVersion: t.i32,
    /** `Connection Request`: the length-framed chain data and client data. */
    connectionRequest
});

/** Payload carried by `LoginPacket`, with the request still framed as one field. */
export type LoginWirePayload = PayloadOf<typeof loginPacket>;
