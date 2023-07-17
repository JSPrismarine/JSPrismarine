import { ConnectionRequest, ConnectionRequestAccepted, FrameReliability } from './protocol/Protocol.js';
import { InetAddress, RakNetListener } from './RakNet.js';

import { MessageIdentifiers } from './protocol/MessageIdentifiers.js';
import { RakNetPriority } from './Session.js';
import ReadReliabilityLayer from './ReadReliabilityLayer.js';
import { RemoteInfo } from 'node:dgram';
import WriteReliabilityLayer from './WriteReliabilityLayer.js';

export default class SessionV2 {
    private readonly readLayer: ReadReliabilityLayer;
    private readonly writeLayer: WriteReliabilityLayer;

    public constructor(
        private readonly listener: RakNetListener,
        private readonly mtuSize: number,
        public readonly rinfo: RemoteInfo,
        public readonly guid: bigint
    ) {
        this.writeLayer = new WriteReliabilityLayer(mtuSize,
            (buffer: Buffer) => this.listener.sendBuffer(buffer, this.rinfo)
        );
        this.readLayer = new ReadReliabilityLayer(mtuSize, 
            (buffer: Buffer) => this.listener.sendBuffer(buffer, this.rinfo)
        );
    }

    // public sendRawBuffer(): void {}

    public handle(buffer: Buffer): void {
        return this.readLayer.handleFromConnectedClient(buffer, this.rinfo);
    }

    public handleConnectedFinalPacket(buffer: Buffer): void {
        if (buffer[0] === MessageIdentifiers.CONNECTION_REQUEST) {
            const connReq = new ConnectionRequest(buffer);
            connReq.decode();

            const connAccept = new ConnectionRequestAccepted();
            connAccept.clientAddress = new InetAddress(this.rinfo.address, this.rinfo.port, 4);
            // incomingTimestamp
            connAccept.requestTimestamp = connReq.requestTimestamp;
            connAccept.acceptedTimestamp = BigInt(Date.now()) // TODO: proper timestamp
            connAccept.encode();
            this.writeLayer.sendImmediate(connAccept.getBuffer(), RakNetPriority.IMMEDIATE, FrameReliability.RELIABLE_ORDERED, 0, Date.now());
        } else if (buffer[0] === MessageIdentifiers.NEW_INCOMING_CONNECTION) {
            console.log("NEW INCOMING")
            this.listener.emit('openConnection', this);
        } else if (buffer[0] === MessageIdentifiers.DISCONNECTION_NOTIFICATION){
            this.listener.removeSession(this, 'Client disconnect');
        } else if (buffer[0] == 0xfe) {
            this.listener.emit('encapsulated', buffer, this.getAddress());
        } else {
            console.log("Unknown pid %d", buffer[0]);
        }
    }

    public update(timestamp: number): void {
        this.readLayer.update(timestamp);

        const buffer = this.readLayer.receive();
        buffer && this.handleConnectedFinalPacket(buffer);

        this.writeLayer.update(timestamp);
    }

    public send(buffer: Buffer, priority: RakNetPriority, reliability: FrameReliability, orderChannel: number): void {
        console.log("Sent")
        console.log(buffer)
        this.writeLayer.send(buffer, priority, reliability, orderChannel, Date.now());
    }

    // just compatibility shit
    public getAddress(): InetAddress {
        return new InetAddress(this.rinfo.address, this.rinfo.port, 4);
    }
}
