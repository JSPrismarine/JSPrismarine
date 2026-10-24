import NetworkStructure from '../NetworkStructure';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The docs enum `NoiseAlignmentType`: what a noise-driven transition lines its noise up with. */
export enum NoiseAlignmentType {
    /** `minLocalTransitionEnd`: align with the earliest local transition end. */
    MIN_LOCAL_TRANSITION_END = 0
}

/**
 * The `NoiseAlignment` of an `EnvironmentAttributeData`: how a noise-driven transition lines
 * up its noise across the layer.
 *
 * Protocol 2193 wire order: `type` as one byte (the {@link NoiseAlignmentType} value, which
 * the schema marks `Enum-as-Value`), then `value` as a varuint32. The field arrived at
 * protocol 2181; the docs do not say what `value` measures.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/noise-alignment/}
 */
export default class NoiseAlignment extends NetworkStructure {
    public constructor(
        /** `type` of alignment. */
        public type: NoiseAlignmentType = NoiseAlignmentType.MIN_LOCAL_TRANSITION_END,
        /** `value` the alignment uses; its meaning depends on `type`. */
        public value = 0
    ) {
        super();
    }

    /** Writes `type` as a byte, then `value` as a varuint32. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeByte(this.type);
        stream.writeUnsignedVarInt(this.value);
    }

    /** Reads `type` as a byte, then `value` as a varuint32. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.type = stream.readByte();
        this.value = stream.readUnsignedVarInt();
    }
}
