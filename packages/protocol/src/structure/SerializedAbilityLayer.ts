import type { NetworkBinaryStream } from '../';
import { NetworkStructure } from '../';

/**
 * Represents a newtork serialized ability layer.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/SerializedAbilitiesData__SerializedLayer.html}
 */
export default class SerializedAbilityLayer extends NetworkStructure {
    public constructor(
        public layer: number,
        public abilitiesSet: number,
        public abilityValues: number,
        public flySpeed: number,
        public walkSpeed: number
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedShortLE(this.layer);
        stream.writeUnsignedIntLE(this.abilitiesSet);
        stream.writeUnsignedIntLE(this.abilityValues);
        stream.writeFloatLE(this.flySpeed);
        stream.writeFloatLE(this.walkSpeed);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.layer = stream.readUnsignedShortLE();
        this.abilitiesSet = stream.readUnsignedIntLE();
        this.abilityValues = stream.readUnsignedIntLE();
        this.flySpeed = stream.readFloatLE();
        this.walkSpeed = stream.readFloatLE();
    }
}
