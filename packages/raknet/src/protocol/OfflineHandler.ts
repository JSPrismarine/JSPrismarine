import {
    InetAddress,
    MAX_MTU_SIZE,
    MINECRAFT_PROTOCOL_VERSION,
    OFFLINE_MESSAGE_DATA_ID,
    UDP_HEADER_SIZE
} from '../RakNet.js';

import IncompatibleProtocolVersion from './connection/IncompatibleProtocolVersion.js';
import { MessageIdentifiers } from './MessageIdentifiers.js';
import OpenConnectionReply1 from './connection/OpenConnectionReply1.js';
import OpenConnectionReply2 from './connection/OpenConnectionReply2.js';
import OpenConnectionRequest2 from './connection/OpenConnectionRequest2.js';
import { RemoteInfo } from 'dgram';
import UnconnectedPing from './offline/UnconnectedPing.js';
import UnconnectedPong from './offline/UnconnectedPong.js';
import ServerSocket from '../ServerSocket.js';
import BinaryStream from '@jsprismarine/jsbinaryutils';

export default class OfflineHandler {
    public constructor(private readonly listener: ServerSocket) {}

    public process(msg: Buffer, rinfo: RemoteInfo): void {
        switch (msg[0]) {
            // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4638
            case MessageIdentifiers.UNCONNECTED_PING_OPEN_CONNECTIONS:
                if (!this.listener.allowIncomingConnections()) {
                    return;
                }
            case MessageIdentifiers.UNCONNECTED_PING:
                const ping = new UnconnectedPing(msg);
                ping.decode();

                const pong = new UnconnectedPong();
                pong.timestamp = ping.timestamp;

                const guid = this.listener.getServerGuid();
                pong.serverGuid = guid;
                pong.serverName = 'MCPE;JSPrismarine;560;1.19.51;0;20;' + guid + ';Second line;Creative;';

                this.listener.sendPacket(pong, rinfo);
                break;
            // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5127
            case MessageIdentifiers.OPEN_CONNECTION_REQUEST_1:
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

                if (msg.byteLength + UDP_HEADER_SIZE > MAX_MTU_SIZE) {
                    reply1.mtuSize = MAX_MTU_SIZE;
                } else {
                    reply1.mtuSize = msg.byteLength + UDP_HEADER_SIZE;
                }

                this.listener.sendPacket(reply1, rinfo);
                break;
            // https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5198
            case MessageIdentifiers.OPEN_CONNECTION_REQUEST_2:
                const request = new OpenConnectionRequest2(msg);
                request.decode();

                const addrSession = this.listener.getSessionByAddress(rinfo);
                const addressInUse = addrSession !== null && !addrSession.isDisconnected(); // isActive'ish
                const guidSession = this.listener.getSessionByGUID(request.clientGUID);
                const guidInUse = guidSession !== null && !guidSession.isDisconnected();

                const reply2 = new OpenConnectionReply2();
                reply2.serverGuid = this.listener.getServerGuid();
                reply2.clientAddress = new InetAddress(rinfo.address, rinfo.port, 4);
                reply2.mtuSize = request.mtuSize;

                if (addressInUse && guidInUse) {
                    if (addrSession === guidSession) {
                        this.listener.sendPacket(reply2, rinfo);
                        return;
                    }
                    this.sendAlreadyConnected(rinfo);
                    return;
                }

                if ((!addressInUse && guidInUse) || (addrSession && !guidInUse)) {
                    this.sendAlreadyConnected(rinfo);
                }

                if (!this.listener.allowIncomingConnections()) {
                    const str = new BinaryStream();
                    str.writeByte(MessageIdentifiers.NO_FREE_INCOMING_CONNECTIONS);
                    str.write(OFFLINE_MESSAGE_DATA_ID);
                    str.writeLong(this.listener.getServerGuid());
                    this.listener.sendBuffer(str.getBuffer(), rinfo);
                    return;
                }

                this.listener.addSession(rinfo, request.mtuSize, request.clientGUID);

                this.listener.sendPacket(reply2, rinfo);
                break;
            case MessageIdentifiers.QUERY:
                this.listener.emit('raw', msg, new InetAddress(rinfo.address, rinfo.port));
                break;
            default:
                throw new Error(`Unknown unconnected packet with ID=${msg[0].toString(16)}`);
        }
    }

    private sendAlreadyConnected(remote: RemoteInfo): void {
        const str = new BinaryStream();
        str.writeByte(MessageIdentifiers.ALREADY_CONNECTED);
        str.write(OFFLINE_MESSAGE_DATA_ID);
        str.writeLong(this.listener.getServerGuid());
        this.listener.sendBuffer(str.getBuffer(), remote);
    }
}
