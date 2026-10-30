import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { definePacket, gated } from './define';
import { AnimateHand, animatePacket } from './definitions/animate';
import * as t from './fieldTypes';
import { layoutAt } from './WireLayout';
import { since } from './wireGates';

import type { AnimatePayload } from './definitions/animate';

const PROTOCOL_2193 = 2193;
const PROTOCOL_2225 = 2225;

describe('a wire layout', () => {
    const payload: AnimatePayload = {
        action: 1,
        runtimeEntityId: 42n,
        data: 1.5,
        swingSource: 'attack',
        hand: AnimateHand.Offhand
    };

    it('derives the payload type from the field list', () => {
        expectTypeOf<AnimatePayload>().toEqualTypeOf<{
            action: number;
            runtimeEntityId: bigint;
            data: number;
            swingSource: string | null;
            hand: number;
        }>();
    });

    it('round-trips a payload at the version that carries every field', () => {
        const layout = layoutAt(animatePacket, PROTOCOL_2225);
        const stream = new BinaryStream();
        layout.encode(stream, payload);

        const read = layoutAt(animatePacket, PROTOCOL_2225).decode(new BinaryStream(stream.getBuffer()));
        expect(read).toEqual(payload);
    });

    it('leaves a gated field off the wire below its version, and decodes its fallback', () => {
        const stream2193 = new BinaryStream();
        layoutAt(animatePacket, PROTOCOL_2193).encode(stream2193, payload);
        const stream2225 = new BinaryStream();
        layoutAt(animatePacket, PROTOCOL_2225).encode(stream2225, payload);

        // The 2225 wire is the 2193 wire plus exactly the one trailing Hand byte.
        expect(stream2225.getBuffer().byteLength).toBe(stream2193.getBuffer().byteLength + 1);
        expect(stream2225.getBuffer().subarray(0, stream2193.getBuffer().byteLength)).toEqual(stream2193.getBuffer());

        const read = layoutAt(animatePacket, PROTOCOL_2193).decode(new BinaryStream(stream2193.getBuffer()));
        expect(read).toEqual({ ...payload, hand: AnimateHand.Mainhand });
    });

    it('resolves a gate-free definition to one shared frozen layout at every version', () => {
        const ungated = definePacket('UngatedPacket', { value: t.varuint32 });
        const at2193 = layoutAt(ungated, PROTOCOL_2193);
        const at2225 = layoutAt(ungated, PROTOCOL_2225);
        expect(at2193).toBe(at2225);
        expect(Object.isFrozen(at2193)).toBe(true);
        expect(Object.isFrozen(at2193.fields)).toBe(true);
    });

    it('resolves a gated definition once per version and caches it', () => {
        const first = layoutAt(animatePacket, PROTOCOL_2225);
        expect(layoutAt(animatePacket, PROTOCOL_2225)).toBe(first);
        expect(layoutAt(animatePacket, PROTOCOL_2193)).not.toBe(first);
    });

    it('decodes an absent gated field to its declared fallback, not undefined', () => {
        const futureOnly = definePacket('FuturePacket', {
            present: t.bool,
            later: gated<number>(since(9999, 'a version nothing speaks yet'), t.varuint32, 7)
        });
        const stream = new BinaryStream();
        layoutAt(futureOnly, PROTOCOL_2225).encode(stream, { present: true, later: 123 });

        expect(layoutAt(futureOnly, PROTOCOL_2225).decode(new BinaryStream(stream.getBuffer()))).toEqual({
            present: true,
            later: 7
        });
    });

    it('round-trips the combinators', () => {
        const spec = definePacket('CombinatorPacket', {
            names: t.list(t.string),
            maybe: t.optional(t.varint64),
            nothing: t.optional(t.string)
        });
        const stream = new BinaryStream();
        const value = { names: ['a', 'b', 'c'], maybe: -5n, nothing: null };
        layoutAt(spec, PROTOCOL_2193).encode(stream, value);

        expect(layoutAt(spec, PROTOCOL_2193).decode(new BinaryStream(stream.getBuffer()))).toEqual(value);
    });
});
