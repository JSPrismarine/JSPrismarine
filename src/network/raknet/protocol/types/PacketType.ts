import BinaryStream from "@jsprismarine/jsbinaryutils";

export default interface PacketType {
    encode(buffer: BinaryStream): void;
    decode(buffer: BinaryStream): void;
}
