import { NetworkBinaryStream, NetworkStructure } from '../';

/**
 * Represents a newtork serialized actor link.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ActorLink.html}
 */
export default class ActorLink extends NetworkStructure {
    public constructor(
        public actorAUniqueID: bigint,
        public actorBUniqueID: bigint,
        public type: number,
        public immediate: boolean,
        public riderInitiated: boolean
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeVarLong(this.actorAUniqueID);
        stream.writeVarLong(this.actorBUniqueID);
        stream.writeByte(this.type);
        stream.writeBoolean(this.immediate);
        stream.writeBoolean(this.riderInitiated);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.actorAUniqueID = stream.readVarLong();
        this.actorBUniqueID = stream.readVarLong();
        this.type = stream.readByte();
        this.immediate = stream.readBoolean();
        this.riderInitiated = stream.readBoolean();
    }
}
