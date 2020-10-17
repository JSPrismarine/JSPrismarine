import BinaryStream from "@jsprismarine/jsbinaryutils";
import { RakNetIdentifiers } from "./RakNetIdentifiers";
import OfflinePacket from "./types/OfflinePacket";

export default class UnconnectedPong extends OfflinePacket {
    protected id: number = RakNetIdentifiers.UNCONNECTED_PONG;

    public timestamp: bigint;
    public pongId: bigint;
    public serverName: string;

    protected encode(buffer: BinaryStream): void {
        buffer.writeLong(this.timestamp);
        buffer.writeLong(this.pongId);
        this.encodeMagic();
        this.encodeString(this.serverName);
    }
}