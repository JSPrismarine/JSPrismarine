import type { NetworkBinaryStream } from '../';
import { NetworkStructure } from '../';

interface NetworkItemStackDescriptorConfig {
    netIdVariant?: number;
    userDataBuffer?: Buffer;
}

/**
 * Represents a network structure of a item stack descriptor.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/NetworkItemStackDescriptor.html}
 */
export default class NetworkItemStackDescriptor extends NetworkStructure {
    public netIdVariant: number;
    public userDataBuffer: Buffer; // serialized ItemInstanceUserData

    private readonly INVALID_ITEM_STACK_ID = 0;

    public constructor(
        public id: number,
        public stackSize: number,
        public auxValue: number,
        public includeNetid: boolean,
        public blockRuntimeId: number,
        config: NetworkItemStackDescriptorConfig = {}
    ) {
        super();
        this.netIdVariant = config.netIdVariant ?? 0;
        this.userDataBuffer = config.userDataBuffer = Buffer.allocUnsafe(0);
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeVarInt(this.id);
        if (this.id !== this.INVALID_ITEM_STACK_ID) {
            stream.writeShortLE(this.stackSize);
            stream.writeUnsignedVarInt(this.auxValue);
            stream.writeBoolean(this.includeNetid);
            this.includeNetid && stream.writeVarInt(this.netIdVariant);
            stream.writeVarInt(this.blockRuntimeId);
            stream.writeLengthPrefixed(this.userDataBuffer);
        }
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.id = stream.readVarInt();
        if (this.id !== this.INVALID_ITEM_STACK_ID) {
            this.stackSize = stream.readShortLE();
            this.auxValue = stream.readUnsignedVarInt();
            this.includeNetid = stream.readBoolean();
            this.includeNetid && (this.netIdVariant = stream.readVarInt());
            this.blockRuntimeId = stream.readVarInt();
            this.userDataBuffer = stream.readLengthPrefixed();
        }
    }
}
