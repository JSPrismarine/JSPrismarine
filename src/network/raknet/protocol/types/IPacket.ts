import BinaryStream from "@jsprismarine/jsbinaryutils";

export default interface IPacket {
    encode(buffer: BinaryStream): void;
    decode(buffer: BinaryStream): void;
}