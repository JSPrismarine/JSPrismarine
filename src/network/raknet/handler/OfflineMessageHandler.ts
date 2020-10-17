import { assert } from "console";
import { RakNetIdentifiers } from "../protocol/RakNetIdentifiers";
import Packet from "../protocol/types/Packet";
import UnconnectedPing from "../protocol/UnconnectedPing";

export default class OfflineMessageHandler {
    private packetPool: Map<Number, any> = new Map(); 

    constructor() {
        // Register offline packets
        this.packetPool.set(RakNetIdentifiers.UnconnectedPing, UnconnectedPing);  // Type: function
    }

    public async handle(header: number, msg: Buffer): Promise<Buffer> {
        assert(this.packetPool.has(header), "Unknown OfflinePacket with ID %d", header);
        let decoded: Packet = await new Promise(resolve => {
            const packet = new (this.packetPool.get(header))(msg);
            packet.decodeInternal();
            resolve(packet);
        });

        return 
    }
}