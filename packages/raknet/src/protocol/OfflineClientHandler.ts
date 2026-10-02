import { MINECRAFT_PROTOCOL_VERSION, OFFLINE_MESSAGE_DATA_ID } from '../Constants';

import type { RemoteInfo } from 'node:dgram';
import type ClientSocket from '../ClientSocket';
import { MessageIdentifiers } from './MessageIdentifiers';
import IncompatibleProtocolVersion from './connection/IncompatibleProtocolVersion';
import OpenConnectionReply1 from './connection/OpenConnectionReply1';
import OpenConnectionReply2 from './connection/OpenConnectionReply2';
import UnconnectedPong from './offline/UnconnectedPong';

/** Where the magic sits in each reply we accept, and the shortest such packet. */
const MAGIC_OFFSET_AFTER_ID = 1;
const MAGIC_OFFSET_AFTER_ID_AND_TIMESTAMPS = 1 + 8 + 8;
const MIN_UNCONNECTED_PONG_LENGTH = 1 + 8 + 8 + 16 + 2;
const MIN_OPEN_CONNECTION_REPLY_1_LENGTH = 1 + 16 + 8 + 1 + 2;
const MIN_OPEN_CONNECTION_REPLY_2_LENGTH = 1 + 16 + 8 + 7 + 2 + 1;
const MIN_INCOMPATIBLE_PROTOCOL_VERSION_LENGTH = 1 + 1 + 16 + 8;

/**
 * The same guard {@link OfflineHandler} applies to what a client sends us, applied to what
 * a server sends back: right magic, at the right offset, in a packet long enough to hold
 * it. Anything can put a datagram on our socket, and the reply path is reachable before a
 * session exists.
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

/**
 * The outgoing half of the offline exchange - the mirror of {@link OfflineHandler}, which
 * only ever answers the messages a *client* sends.
 *
 * The two are deliberately separate classes rather than one with a role flag: they share no
 * branch. A server sees pings and open-connection *requests*; a client sees pongs, open
 * connection *replies*, and the four ways a server has of refusing it.
 */
export class OfflineClientHandler {
    public constructor(private readonly socket: ClientSocket) {}

    public process(msg: Buffer, rinfo: RemoteInfo): void {
        if (msg.byteLength < 1) return;

        switch (msg[0]) {
            case MessageIdentifiers.UNCONNECTED_PONG: {
                if (!isOfflineMessage(msg, MAGIC_OFFSET_AFTER_ID_AND_TIMESTAMPS, MIN_UNCONNECTED_PONG_LENGTH)) {
                    this.discard(msg, rinfo, 'bad magic or truncated UnconnectedPong');
                    return;
                }

                const pong = new UnconnectedPong(msg);
                pong.decode();
                this.socket.onUnconnectedPong(pong, rinfo);
                break;
            }
            case MessageIdentifiers.OPEN_CONNECTION_REPLY_1: {
                if (!isOfflineMessage(msg, MAGIC_OFFSET_AFTER_ID, MIN_OPEN_CONNECTION_REPLY_1_LENGTH)) {
                    this.discard(msg, rinfo, 'bad magic or truncated OpenConnectionReply1');
                    return;
                }

                const reply = new OpenConnectionReply1(msg);
                reply.decode();
                this.socket.onOpenConnectionReply1(reply);
                break;
            }
            case MessageIdentifiers.OPEN_CONNECTION_REPLY_2: {
                if (!isOfflineMessage(msg, MAGIC_OFFSET_AFTER_ID, MIN_OPEN_CONNECTION_REPLY_2_LENGTH)) {
                    this.discard(msg, rinfo, 'bad magic or truncated OpenConnectionReply2');
                    return;
                }

                const reply = new OpenConnectionReply2(msg);
                reply.decode();
                this.socket.onOpenConnectionReply2(reply, rinfo);
                break;
            }
            // The three refusals. Each is terminal: retrying changes nothing, and the
            // caller is owed the actual reason rather than a connection timeout.
            case MessageIdentifiers.INCOMPATIBLE_PROTOCOL_VERSION: {
                if (msg.byteLength < MIN_INCOMPATIBLE_PROTOCOL_VERSION_LENGTH) {
                    this.discard(msg, rinfo, 'truncated IncompatibleProtocolVersion');
                    return;
                }

                const incompatible = new IncompatibleProtocolVersion(msg);
                incompatible.decode();
                this.socket.onOfflineFailure(
                    `incompatible RakNet protocol version: the server speaks ${incompatible.protocol}, we speak ${MINECRAFT_PROTOCOL_VERSION}`
                );
                break;
            }
            case MessageIdentifiers.ALREADY_CONNECTED:
                this.socket.onOfflineFailure('the server already has a connection from this address or guid');
                break;
            case MessageIdentifiers.NO_FREE_INCOMING_CONNECTIONS:
                this.socket.onOfflineFailure('the server is full');
                break;
            case MessageIdentifiers.CONNECTION_BANNED:
                this.socket.onOfflineFailure('banned from this server');
                break;
            default:
                // RakNet ignores traffic it does not recognise, and so must anything
                // reachable from an unauthenticated UDP socket.
                // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5452
                this.discard(msg, rinfo, 'unknown unconnected packet id');
        }
    }

    private discard(msg: Buffer, rinfo: RemoteInfo, reason: string): void {
        this.socket
            .getLogger()
            .debug(
                `Discarded offline packet ID=0x${msg[0]!.toString(16)} from server=${rinfo.address}:${rinfo.port}, reason=${reason}`,
                'RakNet/OfflineClientHandler/process'
            );
    }
}
