import { createSocket, RemoteInfo, Socket as DSocket } from "dgram";
import InetAddress, { InetAddressData } from "../util/InetAddress";
import IRakNetServer from "./IRakNetServer";
import RakNetConnection from "./RakNetConnection";

interface RakNetServerData extends InetAddressData {
    type: "udp4" | "udp6";
    /**
     * Maximum transfer unit (buffer per packet).
     */
    mtu?: number;
    /**
     * Maximum client connections.
     */
    maxConnections?: number;
}

export default class RakNetServer implements IRakNetServer {
    private readonly bindAddress: InetAddress;
    private readonly socket: DSocket = createSocket("udp4");  
    private clients: Map<RemoteInfo, RakNetConnection> = new Map();

    constructor(raknetData: RakNetServerData) {
        if (raknetData.type == "udp6") {
            throw new Error("IPv6 is not supported yet");
        }
        this.bindAddress = new InetAddress(raknetData);
    }

    public listen(): void {
        try {
            this.socket.bind({
                address: this.bindAddress.getAddress(),
                port: this.bindAddress.getPort()
            }, () => console.log(
                "RakNet socket listening on port %d", this.bindAddress.getPort()
            )); // TODO: replace with an actual logger
        } catch (err) {
            throw err;
        }

        this.socket.on("message", async (msg, rinfo) => await this.handleMessage(msg, rinfo));
    }

    private async handleMessage(msg: Buffer, rinfo: RemoteInfo): Promise<void> {
        const packetID = msg.readUInt8();  

        switch (packetID) {}
    }
}