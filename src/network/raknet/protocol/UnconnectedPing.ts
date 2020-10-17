import BinaryStream from "@jsprismarine/jsbinaryutils";
import { RakNetIdentifiers } from "./RakNetIdentifiers";
import OfflinePacket from "./types/OfflinePacket";

export default class UnconnectedPing extends OfflinePacket {
    protected id: number = RakNetIdentifiers.UNCONNECTED_PING;

    public timestamp: bigint;
    public pingId: bigint;

    protected decode(buffer: BinaryStream): void {
        this.timestamp = buffer.readLong();
        this.decodeMagic();
        this.pingId = buffer.readLong();
    }
}