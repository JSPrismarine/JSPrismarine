import PriorityQueue from "../queue/priority/PriorityQueue";

export default interface NetworkQueueHandlerType {
    /**
     * Packets incoming from the client 
     */
    incomingPackets: PriorityQueue;
    /**
     * Packets sent from the server
     */
    outcomingPackets: PriorityQueue;
    /**
     * Reorder queues by the priority of each packet
     */
    reorderQueues(): Promise<void>;
    /**
     * Send outcoming packets
     */
    sendOutcoming(): Promise<void>;
}