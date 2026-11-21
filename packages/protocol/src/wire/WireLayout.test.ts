import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { definePacket, gated, isGated, versioned } from './define';
import type { FieldSpec } from './define';
import { AnimateHand, animatePacket } from '../bedrock/wire/definitions/animate';
import * as t from './fieldTypes';
import type { WireType } from './fieldTypes';
import { layoutAt } from './WireLayout';
import { since, until } from '../bedrock/wire/wireGates';
import { wireDefinitions } from '../bedrock/wire/definitions';

import type { AnimatePayload } from '../bedrock/wire/definitions/animate';

const PROTOCOL_2193 = 2193;
const PROTOCOL_2225 = 2225;

const writtenBytes = (stream: BinaryStream): Buffer =>
    stream.getWriteIndex() === 0 ? Buffer.alloc(0) : stream.getWriteBuffer();

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

    it('writes a versioned field under one key, in the layout its version picks', () => {
        const definition = definePacket('VersionedPacket', {
            value: versioned<number>([until(2225, 'byte before'), t.uint8], [since(2225, 'int after'), t.lu32])
        });
        expectTypeOf<ReturnType<ReturnType<typeof layoutAt<typeof definition>>['decode']>>().toEqualTypeOf<{
            value: number;
        }>();

        const old = new BinaryStream();
        layoutAt(definition, PROTOCOL_2193).encode(old, { value: 7 });
        const current = new BinaryStream();
        layoutAt(definition, PROTOCOL_2225).encode(current, { value: 7 });

        expect(writtenBytes(old)).toEqual(Buffer.from([7]));
        expect(writtenBytes(current)).toEqual(Buffer.from([7, 0, 0, 0]));
        expect(layoutAt(definition, PROTOCOL_2225).decode(new BinaryStream(current.getBuffer()))).toEqual({ value: 7 });
    });

    it('refuses a version no variant of a versioned field covers', () => {
        const definition = definePacket('UncoveredPacket', {
            value: versioned<number>([since(2225, 'only from 2225'), t.uint8])
        });

        expect(() => layoutAt(definition, PROTOCOL_2193)).toThrow(
            'UncoveredPacket.value has no layout at protocol 2193'
        );
    });

    it('resolves a gate-free definition to one shared frozen layout at every version', () => {
        const ungated = definePacket('UngatedPacket', { value: t.varuint32 });
        const at2193 = layoutAt(ungated, PROTOCOL_2193);
        const at2225 = layoutAt(ungated, PROTOCOL_2225);
        expect(at2193).toBe(at2225);
        expect(Object.isFrozen(at2193)).toBe(true);
        expect(Object.isFrozen(at2193.fields)).toBe(true);
    });

    it('checks a definition for version gates only once', () => {
        let fieldReads = 0;
        const definition = definePacket('CountedPacket', {
            get value() {
                fieldReads++;
                return t.varuint32;
            }
        });

        layoutAt(definition, PROTOCOL_2193);
        const readsAfterResolution = fieldReads;
        layoutAt(definition, PROTOCOL_2193);

        expect(readsAfterResolution).toBeGreaterThan(0);
        expect(fieldReads).toBe(readsAfterResolution);
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

    it.each([true, false])('gives each decoded payload its own absent list (compiled: %s)', (useCompiler) => {
        const definition = definePacket('LaterListPacket', {
            later: gated<number[]>(since(9999, 'a version nothing speaks yet'), t.list(t.varuint32), [])
        });
        const layout = layoutAt(definition, PROTOCOL_2225, useCompiler);

        layout.decode(new BinaryStream(Buffer.alloc(0))).later.push(1);

        expect(layout.decode(new BinaryStream(Buffer.alloc(0))).later).toEqual([]);
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

    it('keeps compiled and walker layouts byte-identical for every registered definition', () => {
        for (const protocolVersion of [PROTOCOL_2193, PROTOCOL_2225]) {
            for (const [name, definition] of wireDefinitions) {
                const actualWalker = layoutAt(definition, protocolVersion, false);
                const actualCompiled = layoutAt(definition, protocolVersion, true);
                expect(actualWalker.implementation, name + ' walker').toBe('walker');
                expect(actualCompiled.implementation, name + ' compiled').toBe('compiled');

                // Preserve this definition's keys, order, and gates, but give each field a
                // small deterministic wire type so the differential covers every layout
                // without needing a hand-authored sample for each nested packet structure.
                const probeFields: Record<string, FieldSpec<number>> = Object.fromEntries(
                    Object.entries(definition.fields).map(([key, spec], index) => {
                        const wireType: WireType<number> = {
                            wire: 'layout-probe-' + index,
                            write(stream, value) {
                                stream.writeUnsignedVarInt(index);
                                stream.writeUnsignedVarInt(value);
                            },
                            read(stream) {
                                const fieldIndex = stream.readUnsignedVarInt();
                                if (fieldIndex !== index) {
                                    throw new Error(name + ' field order changed at index ' + index);
                                }
                                return stream.readUnsignedVarInt();
                            }
                        };
                        return [key, isGated(spec) ? gated(spec.gate, wireType, index + 1000) : wireType];
                    })
                );
                const probe = definePacket(name, probeFields);
                const payload = Object.fromEntries(Object.keys(probeFields).map((_key, index) => [_key, index + 10]));
                const walker = layoutAt(probe, protocolVersion, false);
                const compiled = layoutAt(probe, protocolVersion, true);

                const walkerBytes = new BinaryStream();
                walker.encode(walkerBytes, payload);
                const compiledBytes = new BinaryStream();
                compiled.encode(compiledBytes, payload);
                expect(writtenBytes(compiledBytes), name + ' encoded bytes at ' + protocolVersion).toEqual(
                    writtenBytes(walkerBytes)
                );
                expect(compiled.decode(new BinaryStream(writtenBytes(compiledBytes)))).toEqual(
                    walker.decode(new BinaryStream(writtenBytes(walkerBytes)))
                );
            }
        }
    });

    it('compiles arbitrary payload keys as quoted own properties', () => {
        const quotedKey = 'a"quoted\\key';
        const definition = definePacket('ArbitraryKeyPacket', {
            [quotedKey]: t.varuint32,
            ['__proto__']: t.varuint32
        });
        const payload = { [quotedKey]: 7, ['__proto__']: 11 };
        const layout = layoutAt(definition, PROTOCOL_2193);
        const stream = new BinaryStream();
        layout.encode(stream, payload);
        const decoded = layout.decode(new BinaryStream(stream.getBuffer()));

        expect(layout.implementation).toBe('compiled');
        expect(decoded).toEqual(payload);
        expect(Object.hasOwn(decoded, '__proto__')).toBe(true);
        expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    });

    it.each([true, false])(
        'keeps an object-valued __proto__ field and fallback as own properties (compiled: %s)',
        (useCompiler) => {
            const object: WireType<{ readonly inner: number }> = {
                wire: 'test object',
                read: (stream) => ({ inner: stream.readUnsignedVarInt() }),
                write: (stream, value) => stream.writeUnsignedVarInt(value.inner)
            };
            const fallback = { inner: -1 };
            const definition = definePacket('ProtoObjectPacket', {
                ['__proto__']: object,
                ['constructor']: gated(since(PROTOCOL_2193 + 1, 'test gate'), object, fallback)
            });
            const layout = layoutAt(definition, PROTOCOL_2193, useCompiler);
            const stream = new BinaryStream();
            stream.writeUnsignedVarInt(5);

            const decoded = layout.decode(new BinaryStream(stream.getBuffer()));

            expect(layout.implementation).toBe(useCompiler ? 'compiled' : 'walker');
            expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
            expect(Object.getOwnPropertyDescriptor(decoded, '__proto__')?.value).toEqual({ inner: 5 });
            expect(Object.getOwnPropertyDescriptor(decoded, 'constructor')?.value).toBe(fallback);
            expect('inner' in decoded).toBe(false);
        }
    );
});
