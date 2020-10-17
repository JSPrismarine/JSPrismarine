import BinaryStream from "@jsprismarine/jsbinaryutils";
import { MTU_PADDING } from "../server/RakNetCostants";
import { RakNetIdentifiers } from "./RakNetIdentifiers";
import OfflinePacket from "./types/OfflinePacket";

export default class OpenConnectionRequestOne extends OfflinePacket {
    protected id: number = RakNetIdentifiers.OPEN_CONNECTION_REQUEST_1;

    public protocolVersion: number;
    public maximumTransferUnit: number;
    
    protected decode(buffer: BinaryStream): void {
        this.decodeMagic();
        this.protocolVersion = buffer.readByte();
        let remaining = buffer.readRemaining().length;
        this.maximumTransferUnit = remaining + MTU_PADDING;
        buffer.addOffset(remaining, true);  // skip remaining
    }
}