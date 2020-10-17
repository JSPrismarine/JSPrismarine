import PriorityQueue from "../queue/priority/PriorityQueue";
import INetworkQueueHandler from "./INetworkQueueHandler";

export default class NetworkQueueHandler implements INetworkQueueHandler {  // Entities will extend this class
    private readonly incomingPackets: PriorityQueue = new PriorityQueue();  // client -> server
    private readonly outcomingPackets: PriorityQueue = new PriorityQueue();  // server -> client

    
}