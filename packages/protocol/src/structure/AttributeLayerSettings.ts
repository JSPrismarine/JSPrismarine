import NetworkStructure from '../NetworkStructure';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * The `AttributeLayerSettings` of an environment attribute layer: how the layer blends with
 * the others and whether it runs. `ClientboundAttributeLayerSyncPacket` carries it inside each
 * `AttributeLayerData` and on its own in `UpdateAttributeLayerSettingsData`.
 *
 * Protocol 2193 wire order: `Priority` as a little-endian int32, `Weight` as a little-endian
 * float, then `Enabled` and `TransitionsPaused` as one byte each. `Weight` became a float
 * shortly before the packet shipped; the earlier `AttributeLayerPacket` drafts carried it as a
 * float-or-string variant.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/attribute-layer-settings/}
 */
export default class AttributeLayerSettings extends NetworkStructure {
    public constructor(
        /** `Priority`: layers apply in ascending priority, so a higher one wins. */
        public priority = 0,
        /** `Weight` the layer's attributes blend in with. */
        public weight = 0,
        /** `Enabled`: whether the layer contributes at all. */
        public enabled = false,
        /** `TransitionsPaused`: whether the layer's attribute transitions hold their current tick. */
        public transitionsPaused = false
    ) {
        super();
    }

    /** Writes `Priority`, `Weight`, `Enabled`, then `TransitionsPaused`. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeIntLE(this.priority);
        stream.writeFloatLE(this.weight);
        stream.writeBoolean(this.enabled);
        stream.writeBoolean(this.transitionsPaused);
    }

    /** Reads `Priority`, `Weight`, `Enabled`, then `TransitionsPaused`. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.priority = stream.readIntLE();
        this.weight = stream.readFloatLE();
        this.enabled = stream.readBoolean();
        this.transitionsPaused = stream.readBoolean();
    }
}
