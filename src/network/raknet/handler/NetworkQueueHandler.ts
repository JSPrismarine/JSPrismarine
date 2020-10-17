import PriorityQueue from "../queue/priority/PriorityQueue";
import RakNetServer from "../server/RakNetServer";
import NetworkQueueHandlerType from "./NetworkQueueHandlerType";

export default class NetworkQueueHandler implements NetworkQueueHandlerType {  // Entities will extend this class
    private readonly incomingPackets: PriorityQueue = new PriorityQueue();  // client -> server
    private readonly outcomingPackets: PriorityQueue = new PriorityQueue();  // server -> client

    private server: RakNetServer;
    private clientGUID: bigint;  
    private mtuSize: number;

    constructor(server: RakNetServer, clientGUID: bigint, mtuSize: number) {
        this.server = server;
        this.clientGUID = clientGUID;
        this.mtuSize = mtuSize;
    }
}