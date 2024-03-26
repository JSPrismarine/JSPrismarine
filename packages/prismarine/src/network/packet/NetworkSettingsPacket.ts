import DataPacket from "./DataPacket";
import Identifiers from "../Identifiers";

export enum CompressionThreshold {
  COMPRESS_NOTHING,
  COMPRESS_EVERYTHING,
}

export enum PacketCompressionAlgorithm {
  ZLIB,
  SNAPPY,
  NONE = 0xffff & 0xff, // Mojang defined it as 0xFFFF but it's actually a byte :'D
}

export default class NetworkSettingsPacket extends DataPacket {
  public static NetID = Identifiers.NetworkSettingsPacket;

  public compressionThreshold!: number;
  public compressionAlgorithm!: number;

  public clientThrottlingEnabled!: boolean;
  public clientThrottleThreshold!: number;
  public clientThrottleScalar!: number;

  public decodePayload(): void {
    this.compressionThreshold = this.readUnsignedShortLE();
    this.compressionAlgorithm = this.readUnsignedShortLE();
    this.clientThrottlingEnabled = this.readBoolean();
    this.clientThrottleThreshold = this.readByte();
    this.clientThrottleScalar = this.readFloatLE();
  }

  public encodePayload(): void {
    this.writeUnsignedShortLE(this.compressionThreshold);
    this.writeUnsignedShortLE(this.compressionAlgorithm);
    this.writeBoolean(this.clientThrottlingEnabled);
    this.writeByte(this.clientThrottleThreshold);
    this.writeFloatLE(this.clientThrottleScalar);
  }
}
