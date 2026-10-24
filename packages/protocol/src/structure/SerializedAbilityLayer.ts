import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/**
 * One "SerializedAbilitiesDataSerializedLayer" entry of a `SerializedAbilitiesData`.
 *
 * Wire order, all little-endian: "SerializedLayer" uint16, "AbilitiesSet" uint32,
 * "AbilityValues" uint32, "FlySpeed" float, "VerticalFlySpeed" float, "WalkSpeed" float.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/update-abilities-packet/}
 */
export default class SerializedAbilityLayer extends NetworkStructure {
    public constructor(
        public layer: number,
        public abilitiesSet: number,
        public abilityValues: number,
        public flySpeed: number,
        public verticalFlySpeed: number,
        public walkSpeed: number
    ) {
        super();
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeUnsignedShortLE(this.layer);
        stream.writeUnsignedIntLE(this.abilitiesSet);
        stream.writeUnsignedIntLE(this.abilityValues);
        stream.writeFloatLE(this.flySpeed);
        stream.writeFloatLE(this.verticalFlySpeed);
        stream.writeFloatLE(this.walkSpeed);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.layer = stream.readUnsignedShortLE();
        this.abilitiesSet = stream.readUnsignedIntLE();
        this.abilityValues = stream.readUnsignedIntLE();
        this.flySpeed = stream.readFloatLE();
        this.verticalFlySpeed = stream.readFloatLE();
        this.walkSpeed = stream.readFloatLE();
    }
}
