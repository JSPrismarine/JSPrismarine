import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from './NetworkBinaryStream';
import BlockPos from './structure/BlockPos';
import SerializedAbilityLayer from './structure/SerializedAbilityLayer';
import Vec3 from './structure/Vec3';

describe('NetworkStructure.deserialize', () => {
    it('returns a real instance of the calling class', () => {
        const stream = new NetworkBinaryStream();
        new Vec3(1, 2, 3).serialize(stream);

        const vec = Vec3.deserialize(new NetworkBinaryStream(stream.getBuffer()));

        expect(vec).toBeInstanceOf(Vec3);
        expect(vec).toEqual(new Vec3(1, 2, 3));
    });

    it('dispatches to the subclass encoding', () => {
        const stream = new NetworkBinaryStream();
        new BlockPos(-4, 64, 12).serialize(stream);

        const pos = BlockPos.deserialize(new NetworkBinaryStream(stream.getBuffer()));

        expect(pos).toBeInstanceOf(BlockPos);
        expect(pos).toEqual(new BlockPos(-4, 64, 12));
    });

    it('returns an instance that can serialize itself again', () => {
        const stream = new NetworkBinaryStream();
        new SerializedAbilityLayer(1, 2, 3, 0.05, 1, 0.1).serialize(stream);

        const layer = SerializedAbilityLayer.deserialize(new NetworkBinaryStream(stream.getBuffer()));
        const again = new NetworkBinaryStream();
        layer.serialize(again);

        expect(layer).toBeInstanceOf(SerializedAbilityLayer);
        expect(again.getBuffer()).toEqual(stream.getBuffer());
    });
});
