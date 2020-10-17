import BinaryStream from "@jsprismarine/jsbinaryutils";
import InetAddress from "../util/InetAddress";
import { RakNetIdentifiers } from "./RakNetIdentifiers";
import OfflinePacket from "./types/OfflinePacket";

export default class OpenConnectionRequestTwo extends OfflinePacket {
    protected id: number = RakNetIdentifiers.OPEN_CONNECTION_REQUEST_2;

    public serverAddress: InetAddress;
    public mtuSize: number;
    public clientGUID: bigint;
    
    protected decode(buffer: BinaryStream): void {
        this.decodeMagic();
        this.serverAddress = this.decodeAddress();
        this.mtuSize = buffer.readShort();
        this.clientGUID = buffer.readLong();
    }
}