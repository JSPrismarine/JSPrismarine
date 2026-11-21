import NetworkStructure from '../../NetworkStructure';
import AttributeLayerSettings from './AttributeLayerSettings';
import EnvironmentAttributeData2225 from './EnvironmentAttributeData2225';

import type NetworkBinaryStream from '../../NetworkBinaryStream';

/**
 * One `AttributeLayerData` as protocol 2225 sends it, as the `UpdateAttributeLayersData`
 * alternative of `ClientboundAttributeLayerSyncPacket` lists them. Protocol 2225 dropped
 * `NoiseName` from the layer (it moved into the noise transition settings of each attribute)
 * and changed `Attributes` to {@link EnvironmentAttributeData2225}.
 *
 * Wire order: `Name` (string), `Dimension` as a ZigZag varint32, `Settings` as an
 * {@link AttributeLayerSettings}, then `Attributes` as a varuint32 count followed by one
 * {@link EnvironmentAttributeData2225} each.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/types/attribute-layer-data/
 */
export default class AttributeLayerData2225 extends NetworkStructure {
    public constructor(
        /** `Name` of the layer, at most 128 characters. */
        public name = '',
        /** `Dimension` the layer applies to: 0 for the Overworld, 1 for the Nether, 2 for the End, custom ones from 1000. */
        public dimension = 0,
        /** `Settings` of the layer. */
        public settings = new AttributeLayerSettings(),
        /** `Attributes` the layer defines. */
        public attributes: EnvironmentAttributeData2225[] = []
    ) {
        super();
    }

    /** Writes every field in the order the docs list them. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.name);
        stream.writeVarInt(this.dimension);
        this.settings.serialize(stream);
        stream.writeUnsignedVarInt(this.attributes.length);
        for (const attribute of this.attributes) attribute.serialize(stream);
    }

    /** Reads every field in the order the docs list them. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.name = stream.readString();
        this.dimension = stream.readVarInt();
        this.settings = AttributeLayerSettings.deserialize(stream);
        this.attributes = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) this.attributes.push(EnvironmentAttributeData2225.deserialize(stream));
    }
}
