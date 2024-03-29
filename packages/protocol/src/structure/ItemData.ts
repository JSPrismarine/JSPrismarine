import { NetworkStructure } from '../';
import NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * Represents the network structure of the data linked to a item.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ItemData.html}
 */
export default class ItemData extends NetworkStructure {
    public constructor(
        public itemName: string,
        public itemId: number,
        public componentBased: boolean
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.itemName);
        stream.writeUnsignedVarInt(this.itemId);
        stream.writeBoolean(this.componentBased);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.itemName = stream.readString();
        this.itemId = stream.readUnsignedVarInt();
        this.componentBased = stream.readBoolean();
    }
}
