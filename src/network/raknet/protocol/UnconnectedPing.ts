import BinaryStream from "@jsprismarine/jsbinaryutils";
import { RakNetIdentifiers } from "./RakNetIdentifiers";
import Packet from "./types/Packet";

export default class UnconnectedPing extends Packet {
    protected id: number = RakNetIdentifiers.UnconnectedPing - 1;

    protected decode(buffer: BinaryStream) {
        
    }
}