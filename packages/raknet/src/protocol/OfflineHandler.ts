import {
    MAX_MTU_SIZE,
    MIN_MTU_SIZE,
    MINECRAFT_PROTOCOL_VERSION,
    OFFLINE_MESSAGE_DATA_ID,
    UDP_HEADER_SIZE
} from '../Constants';
import InetAddress from '../utils/InetAddress';

import BinaryStream from '@jsprismarine/binaryutils';
import type { RemoteInfo } from 'node:dgram';
import type ServerSocket from '../ServerSocket';
import { MessageIdentifiers } from './MessageIdentifiers';
import IncompatibleProtocolVersion from './connection/IncompatibleProtocolVersion';
import OpenConnectionReply1 from './connection/OpenConnectionReply1';
import OpenConnectionReply2 from './connection/OpenConnectionReply2';
import OpenConnectionRequest2 from './connection/OpenConnectionRequest2';
import UnconnectedPing from './offline/UnconnectedPing';
import UnconnectedPong from './offline/UnconnectedPong';

/**
 * Keeps a peer-supplied MTU inside the range the reliability layer can actually work with.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/MTUSize.h#L33
 */
const clampMTU = (mtuSize: number): number =>
    Number.isFinite(mtuSize) ? Math.min(Math.max(Math.trunc(mtuSize), MIN_MTU_SIZE), MAX_MTU_SIZE) : MIN_MTU_SIZE;

/** Where OFFLINE_MESSAGE_DATA_ID sits inside each offline packet, and the shortest such packet. */
const MAGIC_OFFSET_AFTER_ID = 1;
const MAGIC_OFFSET_AFTER_ID_AND_TIMESTAMP = 1 + 8;
const MIN_UNCONNECTED_PING_LENGTH = 1 + 8 + 16;
const MIN_OPEN_CONNECTION_REQUEST_1_LENGTH = 1 + 16 + 1;
const MIN_OPEN_CONNECTION_REQUEST_2_LENGTH = 1 + 16 + 7 + 2 + 8;

/**
 * Confirms a packet really is the offline message it claims to be, before anything is
 * decoded from it. RakNet performs exactly this check - right magic, at the right offset,
 * in a packet long enough to hold it - as the condition for treating a datagram as offline.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4587
 */
const isOfflineMessage = (msg: Buffer, magicOffset: number, minimumLength: number): boolean =>
    msg.byteLength >= minimumLength &&
    msg.compare(
        OFFLINE_MESSAGE_DATA_ID,
        0,
        OFFLINE_MESSAGE_DATA_ID.byteLength,
        magicOffset,
        magicOffset + OFFLINE_MESSAGE_DATA_ID.byteLength
    ) === 0;

export class OfflineHandler {
    public constructor(private readonly listener: ServerSocket) {}

    public process(msg: Buffer, rinfo: RemoteInfo): void {
        if (msg.byteLength < 1) return;

        switch (msg[0]) {
            // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4638
            case MessageIdentifiers.UNCONNECTED_PING_OPEN_CONNECTIONS:
                if (!this.listener.allowIncomingConnections()) {
                    return;
                }
            case MessageIdentifiers.UNCONNECTED_PING:
                if (!isOfflineMessage(msg, MAGIC_OFFSET_AFTER_ID_AND_TIMESTAMP, MIN_UNCONNECTED_PING_LENGTH)) {
                    this.discard(msg, rinfo, 'bad magic or truncated UnconnectedPing');
                    return;
                }

                const ping = new UnconnectedPing(msg);
                ping.decode();

                const pong = new UnconnectedPong();
                pong.timestamp = ping.timestamp;
                pong.serverGuid = this.listener.getServerGuid();
                pong.serverName = this.listener.serverName.toString();
                this.listener.sendPacket(pong, rinfo);
                break;
            // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5127
            case MessageIdentifiers.OPEN_CONNECTION_REQUEST_1:
                if (!isOfflineMessage(msg, MAGIC_OFFSET_AFTER_ID, MIN_OPEN_CONNECTION_REQUEST_1_LENGTH)) {
                    this.discard(msg, rinfo, 'bad magic or truncated OpenConnectionRequest1');
                    return;
                }

                // Don't waste resources by allocating a packet if we know version mismatches
                const remoteProtocol = msg[1 + OFFLINE_MESSAGE_DATA_ID.byteLength];
                // TODO: setter for custom protocol version
                if (remoteProtocol !== MINECRAFT_PROTOCOL_VERSION) {
                    const response = new IncompatibleProtocolVersion();
                    response.protocol = MINECRAFT_PROTOCOL_VERSION;
                    response.serverGUID = this.listener.getServerGuid();
                    this.listener.sendPacket(response, rinfo);
                    return;
                }

                const reply1 = new OpenConnectionReply1();
                reply1.serverGUID = this.listener.getServerGuid();

                // The request is padded to probe the path MTU, so its size is the MTU
                // the client is testing. Clamp it: everything downstream sizes buffers
                // against this value.
                // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5183
                reply1.mtuSize = clampMTU(msg.byteLength + UDP_HEADER_SIZE);

                this.listener.sendPacket(reply1, rinfo);
                break;
            // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5198
            case MessageIdentifiers.OPEN_CONNECTION_REQUEST_2:
                if (!isOfflineMessage(msg, MAGIC_OFFSET_AFTER_ID, MIN_OPEN_CONNECTION_REQUEST_2_LENGTH)) {
                    this.discard(msg, rinfo, 'bad magic or truncated OpenConnectionRequest2');
                    return;
                }

                const request = new OpenConnectionRequest2(msg);
                request.decode();

                // The MTU comes straight off the wire and is fully attacker controlled.
                // Session.sendFrame derives its fragment size from it, and a value below
                // the frame overhead yields a non-positive size.
                // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L3638
                const mtuSize = clampMTU(request.mtuSize);

                // "In use" is RakNet's `isActive`, which stays true while a system is on its
                // way out: a session still saying goodbye holds its address, and a request
                // arriving in that window is a collision rather than a free slot.
                const addrSession = this.listener.getSessionByAddress(rinfo);
                const addressInUse = addrSession !== null && !addrSession.isDisconnected();
                const guidSession = this.listener.getSessionByGUID(request.clientGUID);
                const guidInUse = guidSession !== null && !guidSession.isDisconnected();

                const reply2 = new OpenConnectionReply2();
                reply2.serverGuid = this.listener.getServerGuid();
                reply2.clientAddress = new InetAddress(rinfo.address, rinfo.port, 4);
                reply2.mtuSize = mtuSize;

                if (addressInUse && guidInUse) {
                    // Same session, and it has not finished the handshake: the request is
                    // the duplicate of one whose reply was lost, and gets the same reply
                    // again. RakNet tests its connectMode for exactly this, and answers
                    // ID_ALREADY_CONNECTED otherwise - so a peer spoofing the source address
                    // of a *connected* client cannot make us re-open its handshake.
                    // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5269
                    if (addrSession === guidSession && addrSession.isHandshaking()) {
                        this.listener.sendPacket(reply2, rinfo);
                        return;
                    }
                    this.sendAlreadyConnected(rinfo);
                    return;
                }

                // One of the two is taken but not the other: someone else holds this guid, or
                // this address belongs to a session the peer has forgotten about.
                if ((!addressInUse && guidInUse) || (addressInUse && !guidInUse)) {
                    this.sendAlreadyConnected(rinfo);
                    return;
                }

                if (!this.listener.allowIncomingConnections()) {
                    const str = new BinaryStream();
                    str.writeByte(MessageIdentifiers.NO_FREE_INCOMING_CONNECTIONS);
                    str.write(OFFLINE_MESSAGE_DATA_ID);
                    str.writeLong(this.listener.getServerGuid());
                    this.listener.sendBuffer(str.getBuffer(), rinfo);
                    return;
                }

                this.listener.addSession(rinfo, mtuSize, request.clientGUID);

                this.listener.sendPacket(reply2, rinfo);
                break;
            case MessageIdentifiers.QUERY:
                this.listener.emit('raw', msg, new InetAddress(rinfo.address, rinfo.port));
                break;
            default:
                // RakNet ignores traffic it does not recognise; anything reachable from
                // an unauthenticated UDP socket must never be able to raise.
                // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5452
                this.discard(msg, rinfo, 'unknown unconnected packet id');
        }
    }

    private discard(msg: Buffer, rinfo: RemoteInfo, reason: string): void {
        this.listener
            .getLogger()
            .debug(
                `Discarded offline packet ID=0x${msg[0]!.toString(16)} from client=${rinfo.address}:${rinfo.port}, reason=${reason}`,
                'RakNet/OfflineHandler/process'
            );
    }

    private sendAlreadyConnected(remote: RemoteInfo): void {
        const str = new BinaryStream();
        str.writeByte(MessageIdentifiers.ALREADY_CONNECTED);
        str.write(OFFLINE_MESSAGE_DATA_ID);
        str.writeLong(this.listener.getServerGuid());
        this.listener.sendBuffer(str.getBuffer(), remote);
    }
}
