import type { NetworkBinaryStream } from '../';
import { NetworkStructure } from '../';
import type { CommandPermissionLevel, PlayerPermissionLevel } from '@jsprismarine/minecraft';
import SerializedAbilityLayer from './SerializedAbilityLayer';

export default class SerializedAbilitiesData extends NetworkStructure {
    public layers: Array<SerializedAbilityLayer>;

    public constructor(
        public targetPlayerRawId: bigint,
        public mPlayerPermissions: PlayerPermissionLevel,
        public mCommandPermissions: CommandPermissionLevel,
        layers?: Array<SerializedAbilityLayer>
    ) {
        super();
        this.layers = layers ?? [];
    }

    public serialize(stream: NetworkBinaryStream): void {
        stream.writeLongLE(this.targetPlayerRawId);
        stream.writeByte(this.mPlayerPermissions);
        stream.writeByte(this.mCommandPermissions);
        stream.writeUnsignedVarInt(this.layers.length);
        for (const layer of this.layers) {
            layer.serialize(stream);
        }
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.targetPlayerRawId = stream.readLongLE();
        this.mPlayerPermissions = stream.readByte();
        this.mCommandPermissions = stream.readByte();
        const layersCount = stream.readUnsignedVarInt();
        this.layers = new Array(layersCount);
        for (let i = 0; i < layersCount; i++) {
            this.layers[i] = SerializedAbilityLayer.deserialize(stream);
        }
    }
}
