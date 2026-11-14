import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it } from 'vitest';
import { packetIds as packetIds2193 } from '../wire/versions/v2193';
import { packetIds as packetIds2225 } from '../wire/versions/v2225';
import { layoutAt } from '../wire/WireLayout';
import { serverboundStonecutterSetRecipePacket } from '../wire/definitions/added2225';

describe.each([2193, 2225])('the declarative ServerboundStonecutterSetRecipe layout at protocol %i', (protocol) => {
    const layout = layoutAt(serverboundStonecutterSetRecipePacket, protocol);

    it('writes the container id as one byte and the recipe index as a ZigZag varint32', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { containerId: 0x2a, recipeIndex: -3 });

        expect(stream.getBuffer()).toEqual(Buffer.from([0x2a, 0x05]));
    });

    it('round-trips a multi-byte recipe index', () => {
        const stream = new BinaryStream();
        layout.encode(stream, { containerId: 255, recipeIndex: 1_000_000 });

        expect(layout.decode(new BinaryStream(stream.getBuffer()))).toEqual({
            containerId: 255,
            recipeIndex: 1_000_000
        });
    });
});

describe('the ServerboundStonecutterSetRecipe packet id', () => {
    it('is 354 at protocol 2225, where the packet was added', () => {
        expect(packetIds2225.ServerboundStonecutterSetRecipePacket).toBe(354);
    });

    it('is absent at protocol 2193', () => {
        expect(packetIds2193).not.toHaveProperty('ServerboundStonecutterSetRecipePacket');
    });
});
