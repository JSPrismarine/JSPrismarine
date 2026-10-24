import NetworkStructure from '../NetworkStructure';
import AttributeLayerSettings from './AttributeLayerSettings';
import EnvironmentAttributeData from './EnvironmentAttributeData';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * One `AttributeLayerData`: the full definition of an environment attribute layer, as the
 * `UpdateAttributeLayersData` alternative of `ClientboundAttributeLayerSyncPacket` lists them.
 *
 * Protocol 2193 wire order: `Name` (string), `NoiseName` as an optional string (a presence
 * byte, then the string only when set), `Dimension` as a ZigZag varint32, `Settings` as an
 * {@link AttributeLayerSettings}, then `Attributes` as a varuint32 count followed by one
 * {@link EnvironmentAttributeData} each. Protocol 2207 drops `NoiseName`.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/attribute-layer-data/}
 */
export default class AttributeLayerData extends NetworkStructure {
    public constructor(
        /** `Name` of the layer, at most 128 characters. */
        public name = '',
        /** `NoiseName`, the noise the layer's transitions sample. Unset when the layer uses none. */
        public noiseName?: string,
        /** `Dimension` the layer applies to: 0 for the Overworld, 1 for the Nether, 2 for the End, custom ones from 1000. */
        public dimension = 0,
        /** `Settings` of the layer. */
        public settings = new AttributeLayerSettings(),
        /** `Attributes` the layer defines. */
        public attributes: EnvironmentAttributeData[] = []
    ) {
        super();
    }

    /** Writes every field in the order the docs list them. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.name);
        stream.writeBoolean(this.noiseName !== undefined);
        if (this.noiseName !== undefined) stream.writeString(this.noiseName);
        stream.writeVarInt(this.dimension);
        this.settings.serialize(stream);
        stream.writeUnsignedVarInt(this.attributes.length);
        for (const attribute of this.attributes) attribute.serialize(stream);
    }

    /** Reads every field in the order the docs list them. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.name = stream.readString();
        this.noiseName = stream.readBoolean() ? stream.readString() : undefined;
        this.dimension = stream.readVarInt();
        this.settings = AttributeLayerSettings.deserialize(stream);
        this.attributes = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) this.attributes.push(EnvironmentAttributeData.deserialize(stream));
    }
}
