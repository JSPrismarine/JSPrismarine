import { Priorities } from "../queue/priority/Priorities";
import PriorityQueue from "../queue/priority/PriorityQueue";
import InetAddress from "../util/InetAddress";
import NetworkQueueHandlerType from "./NetworkQueueHandlerType";

export default class NetworkQueueHandler implements NetworkQueueHandlerType {  // Entities will extend this class
    public readonly incomingPackets: PriorityQueue = new PriorityQueue();  // client -> server
    public readonly outcomingPackets: PriorityQueue = new PriorityQueue();  // server -> client

    private clientAddress: InetAddress;
    private clientGUID: bigint;  
    private mtuSize: number;

    constructor(clientAddress: InetAddress, clientGUID: bigint, mtuSize: number) {
        this.clientAddress = clientAddress;
        this.clientGUID = clientGUID;
        this.mtuSize = mtuSize;
    }

    public pushIncomingQueue(element: any, priority: Priorities): void {
        this.incomingPackets.add(element, priority);
    }

    public async reorderQueues(): Promise<void> {
        await new Promise(resolve => {
            // Do all for each / heavy checks
            return resolve();
        });
    }

    public async sendOutcoming(): Promise<void> {
        await new Promise(resolve => {
            console.log('ah')
            return resolve();
        });
    }
}
