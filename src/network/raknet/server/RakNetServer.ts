import { createSocket, RemoteInfo, Socket as DSocket } from "dgram";
import { RakNetIdentifiers } from "../protocol/RakNetIdentifiers";
import Packet from "../protocol/types/Packet";
import UnconnectedPing from "../protocol/UnconnectedPing";
import UnconnectedPong from "../protocol/UnconnectedPong";
import InetAddress, { InetAddressData } from "../util/InetAddress";
import RakNetServerType from "./RakNetServerType";
import { randomBytes } from "crypto";
import OpenConnectionRequestOne from "../protocol/OpenConnectionRequestOne";
import OpenConnectionReplyOne from "../protocol/OpenConnectionReplyOne";
import { RAKNET_PROTOCOL } from "./RakNetCostants";
import OpenConnectionRequestTwo from "../protocol/OpenConnectionRequestTwo";
import OpenConnectionReplyTwo from "../protocol/OpenConnectionReplyTwo";
import Identifiers from "../../identifiers";
import { EventEmitter } from "events";
import { Priorities } from "../queue/priority/Priorities";
import NetworkQueueHandlerType from "../handler/NetworkQueueHandlerType";
import PlayerConnection from "../../PlayerConnection";

interface RakNetServerData extends InetAddressData {
    /**
     * Socket interface type (IPv4/IPv6).
     */
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

export default class RakNetServer extends EventEmitter implements RakNetServerType {
    private readonly bindAddress: InetAddress;
    private readonly socket: DSocket = createSocket("udp4");
    private readonly GUID: bigint = randomBytes(8).readBigInt64BE();
    private clients: Map<String, NetworkQueueHandlerType> = new Map();

    private motd: string = 'Another JSPrismarine server!';
    private version: string = Identifiers.MinecraftVersion;
    private protocol: number = Identifiers.Protocol;
    private maxPlayerCount: number = 0;
    private currentPlayerCount: number = 5;

    constructor(raknetData: RakNetServerData) {
        super();

        if (raknetData.type == "udp6") {
            throw new Error("IPv6 is not supported yet");
        }
        this.bindAddress = new InetAddress(raknetData);
    }

    public listen(): Promise<void> {
        this.socket.on('message', async (msg, rinfo) => await this.handleMessage(msg, rinfo));

        return new Promise((resolve, reject) => {
            try {
                this.socket.bind({
                    address: this.bindAddress.getAddress(),
                    port: this.bindAddress.getPort()
                }, () => {
                    resolve();
                });
            } catch (err) {
                reject(err);
            }
        });
    }

    private async handleMessage(msg: Buffer, rinfo: RemoteInfo): Promise<void> {
        const header = msg.readUInt8();

        const token = InetAddress.fromRemoteInfo(rinfo).toToken();
        if (this.clients.has(token)) {
            this.clients.get(token)!.incomingPackets.add(msg, Priorities.HIGH);
        } else {
            this.socket.send(
                await this.handleOfflineMessage(header, msg, rinfo),
                rinfo.port, rinfo.address
            )
        }
    }

    public async handleOfflineMessage(header: number, msg: Buffer, rinfo: RemoteInfo): Promise<Buffer> {
        return await new Promise(resolve => {
            let decoded, encoded;

            switch (header) {
                case RakNetIdentifiers.UNCONNECTED_PING:
                    decoded = new UnconnectedPing(msg);
                    decoded.decodeInternal();

                    if (!decoded.isMagicValid()) {
                        // TODO: skip fake Offline packet...
                    }

                    encoded = new UnconnectedPong();
                    encoded.timestamp = decoded.timestamp;
                    encoded.pongId = this.GUID;
                    encoded.serverName = `MCPE;${this.motd};${this.protocol};${this.version};${this.currentPlayerCount};${this.maxPlayerCount};server_id;JSRakNet;Creative;1;19132;19132;`;  // TODO: change with actual MOTD
                    encoded.encodeInternal();
                    return resolve(encoded.getOutputBuffer());
                case RakNetIdentifiers.OPEN_CONNECTION_REQUEST_1:
                    decoded = new OpenConnectionRequestOne(msg);
                    decoded.decodeInternal();

                    if (!decoded.isMagicValid()) {
                        // TODO: skip fake Offline packet...
                    }

                    if (decoded.protocolVersion != RAKNET_PROTOCOL) {
                        encoded = new Packet() // TODO
                        // Send incompatible protocol
                        console.log("Incom proto")
                    } else {
                        encoded = new OpenConnectionReplyOne();
                        encoded.GUID = this.GUID;
                        encoded.mtuSize = decoded.mtuSize;
                        encoded.encodeInternal();
                    }
                    return resolve(encoded.getOutputBuffer());
                case RakNetIdentifiers.OPEN_CONNECTION_REQUEST_2:
                    decoded = new OpenConnectionRequestTwo(msg);
                    decoded.decodeInternal();

                    if (!decoded.isMagicValid()) {
                        // TODO: skip fake Offline packet...
                    }

                    const clientAddr = InetAddress.fromRemoteInfo(rinfo);
                    encoded = new OpenConnectionReplyTwo();
                    encoded.mtuSize = decoded.mtuSize;   // TODO: able to change from config
                    encoded.serverGUID = this.GUID;
                    encoded.clientAddress = clientAddr;
                    encoded.encodeInternal();

                    // Create session
                    this.clients.set(clientAddr.toToken(), new PlayerConnection(
                        clientAddr,
                        decoded.clientGUID,
                        decoded.mtuSize
                    ));

                    return resolve(encoded.getOutputBuffer());
            }
        });
    }

    public setMotd(motd: string) {
        this.motd = motd;
    };
    public setVersion(version: string) {
        this.version = version;
    };
    public setProtocol(protocol: number) {
        this.protocol = protocol;
    };
    public setMaxPlayerCount(count: number) {
        this.maxPlayerCount = count;
    };
    public setCurrentPlayerCount(count: number) {
        this.currentPlayerCount = count;
    };
}
