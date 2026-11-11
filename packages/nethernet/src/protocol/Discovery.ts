import { createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto';

/**
 * LAN discovery's packets on UDP 7551. Each datagram is an HMAC-SHA256 checksum of the plain
 * packet followed by the packet encrypted with AES-256-ECB, both keyed with SHA-256 of the
 * application ID `0xDEADBEEF` as a little-endian 64-bit integer. The plain packet is a
 * little-endian u16 length of what follows, a u16 type, the sender's u64 network ID, eight
 * reserved bytes, and the type's fields.
 */

/** The packet types, as the u16 after the length numbers them. */
export const DiscoveryPacketType = {
    Request: 0,
    Response: 1,
    Message: 2
} as const;

/** A client asking who is on the network. */
export interface DiscoveryRequest {
    readonly type: typeof DiscoveryPacketType.Request;
    readonly senderId: bigint;
}

/** A server answering with its advertisement, as the bytes `encodeLanAdvertisement` makes. */
export interface DiscoveryResponse {
    readonly type: typeof DiscoveryPacketType.Response;
    readonly senderId: bigint;
    readonly advertisement: Buffer;
}

/** A signal for one peer, as a signal's text. */
export interface DiscoveryMessage {
    readonly type: typeof DiscoveryPacketType.Message;
    readonly senderId: bigint;
    readonly recipientId: bigint;
    readonly data: string;
}

/** Any discovery packet. */
export type DiscoveryPacket = DiscoveryRequest | DiscoveryResponse | DiscoveryMessage;

const appId = Buffer.alloc(8);
appId.writeBigUInt64LE(0xdeadbeefn);
const KEY = createHash('sha256').update(appId).digest();

const CHECKSUM_BYTES = 32;
/** Length, type, sender and reserved. */
const HEADER_BYTES = 2 + 2 + 8 + 8;

const encrypt = (plain: Buffer): Buffer => {
    const cipher = createCipheriv('aes-256-ecb', KEY, null);
    return Buffer.concat([cipher.update(plain), cipher.final()]);
};

const decrypt = (encrypted: Buffer): Buffer => {
    const decipher = createDecipheriv('aes-256-ecb', KEY, null);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
};

const checksum = (plain: Buffer): Buffer => createHmac('sha256', KEY).update(plain).digest();

const lengthPrefixed = (text: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32LE(text.byteLength);
    return Buffer.concat([length, text]);
};

/**
 * Encodes a packet as the datagram LAN discovery sends.
 * @param packet - The packet.
 * @returns The checksum and the encrypted packet.
 */
export const encodeDiscoveryPacket = (packet: DiscoveryPacket): Buffer => {
    let body: Buffer;
    switch (packet.type) {
        case DiscoveryPacketType.Request:
            body = Buffer.alloc(0);
            break;
        case DiscoveryPacketType.Response:
            // The advertisement travels as hex text.
            body = lengthPrefixed(Buffer.from(packet.advertisement.toString('hex'), 'utf8'));
            break;
        case DiscoveryPacketType.Message: {
            const recipient = Buffer.alloc(8);
            recipient.writeBigUInt64LE(packet.recipientId);
            body = Buffer.concat([recipient, lengthPrefixed(Buffer.from(packet.data, 'utf8'))]);
            break;
        }
    }
    const header = Buffer.alloc(HEADER_BYTES);
    header.writeUInt16LE(HEADER_BYTES - 2 + body.byteLength, 0);
    header.writeUInt16LE(packet.type, 2);
    header.writeBigUInt64LE(packet.senderId, 4);
    const plain = Buffer.concat([header, body]);
    return Buffer.concat([checksum(plain), encrypt(plain)]);
};

/**
 * Decodes a datagram from UDP 7551.
 * @param datagram - The datagram.
 * @returns The packet.
 * @throws {Error} When the datagram is short, its checksum does not match, or its type is unknown.
 */
export const decodeDiscoveryPacket = (datagram: Buffer): DiscoveryPacket => {
    if (datagram.byteLength < CHECKSUM_BYTES + 16) throw new Error('A discovery packet is too short');
    const plain = decrypt(datagram.subarray(CHECKSUM_BYTES));
    if (!checksum(plain).equals(datagram.subarray(0, CHECKSUM_BYTES))) {
        throw new Error('A discovery packet’s checksum does not match');
    }
    if (plain.byteLength < HEADER_BYTES) throw new Error('A discovery packet is too short');
    const declared = plain.readUInt16LE(0);
    const type = plain.readUInt16LE(2);
    const senderId = plain.readBigUInt64LE(4);
    const readText = (at: number): { text: string; end: number } => {
        const length = plain.readUInt32LE(at);
        const end = at + 4 + length;
        if (end > plain.byteLength) throw new Error('A discovery packet’s text runs past its end');
        return { text: plain.toString('utf8', at + 4, end), end };
    };
    switch (type) {
        case DiscoveryPacketType.Request:
            return { type, senderId };
        case DiscoveryPacketType.Response:
            return { type, senderId, advertisement: Buffer.from(readText(HEADER_BYTES).text, 'hex') };
        case DiscoveryPacketType.Message: {
            const recipientId = plain.readBigUInt64LE(HEADER_BYTES);
            const { text, end } = readText(HEADER_BYTES + 8);
            let data = text;
            // Retail LAN hosts can undercount an answer with inline candidates in both lengths. The
            // checksum covers the whole datagram, so its tail is the answer's, unless it holds a
            // NUL, which SDP never does and a second appended packet would.
            const tail = plain.subarray(HEADER_BYTES + 12);
            if (
                text.startsWith('CONNECTRESPONSE ') &&
                (end < plain.byteLength || 2 + declared < plain.byteLength) &&
                !tail.includes(0)
            ) {
                data = tail.toString('utf8');
            }
            return { type, senderId, recipientId, data };
        }
        default:
            throw new Error(`Unknown discovery packet type ${type}`);
    }
};
