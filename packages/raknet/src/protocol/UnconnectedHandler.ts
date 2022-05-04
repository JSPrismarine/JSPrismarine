import { InetAddress, MAX_MTU_SIZE, MINECRAFT_PROTOCOL, RakNetListener } from '../RakNet';

import IncompatibleProtocolVersion from './connection/IncompatibleProtocolVersion';
import MessageHeaders from './MessageHeaders';
import OpenConnectionReply1 from './connection/OpenConnectionReply1';
import OpenConnectionReply2 from './connection/OpenConnectionReply2';
import OpenConnectionRequest1 from './connection/OpenConnectionRequest1';
import OpenConnectionRequest2 from './connection/OpenConnectionRequest2';
import { RemoteInfo } from 'dgram';
import UnconnectedPing from './offline/UnconnectedPing';
import UnconnectedPong from './offline/UnconnectedPong';

export default class UnconnectedHandler {
    private readonly listener: RakNetListener;

    public constructor(listener: RakNetListener) {
        this.listener = listener;
    }

    public handle(msg: Buffer, rinfo: RemoteInfo): void {
        const id = msg[0];
        switch (id) {
            case MessageHeaders.QUERY:
                this.listener.emit('raw', msg, new InetAddress(rinfo.address, rinfo.port));
                break;
            case MessageHeaders.UNCONNECTED_PING:
                const ping = new UnconnectedPing(msg);
                ping.decode();

                const pong = new UnconnectedPong();
                pong.timestamp = ping.timestamp;

                const guid = this.listener.getServerGuid();

                pong.serverGuid = guid;
                pong.serverName = 'MCPE;JSPrismarine;503;1.18.30;0;20;' + guid + ';Second line;Creative;';
                this.listener.sendPacket(pong, rinfo);
                break;
            case MessageHeaders.OPEN_CONNECTION_REQUEST_1:
                const request1 = new OpenConnectionRequest1(msg);
                request1.decode();

                if (request1.protocol !== MINECRAFT_PROTOCOL) {
                    const packet = new IncompatibleProtocolVersion();
                    packet.protocol = MINECRAFT_PROTOCOL;
                    packet.serverGUID = this.listener.getServerGuid();
                    this.listener.sendPacket(request1, rinfo);
                    return;
                }

                const reply1 = new OpenConnectionReply1();
                reply1.serverGUID = this.listener.getServerGuid();
                reply1.mtuSize = request1.mtuSize;
                this.listener.sendPacket(reply1, rinfo);
                break;
            case MessageHeaders.OPEN_CONNECTION_REQUEST_2:
                const request2 = new OpenConnectionRequest2(msg);
                request2.decode();

                const reply2 = new OpenConnectionReply2();
                reply2.serverGuid = this.listener.getServerGuid();

                const mtu = Math.min(request2.mtuSize, MAX_MTU_SIZE);

                reply2.mtuSize = mtu;
                reply2.clientAddress = new InetAddress(rinfo.address, rinfo.port, 4);

                this.listener.addSession(rinfo, mtu);
                this.listener.sendPacket(reply2, rinfo);
                break;
            default:
                throw new Error(`Unknown unconnected packet with ID=${id.toString(16)}`);
        }
    }
}
