/**
 * A packet definition resolved against one protocol version, and the walker that encodes and
 * decodes payloads through it.
 *
 * Resolution evaluates each field's gate once and produces a frozen flat record: the fields on
 * the wire at that version, in order, plus the fallback values for the fields that are not.
 * Encoding walks the included fields and writes; decoding walks them and reads, filling the
 * excluded fields with their fallbacks so a payload has the same shape at every version. A
 * definition with no gates resolves to one shared frozen layout, cached under a sentinel, so a
 * packet whose wire never changed costs one resolution ever and mentions no version anywhere.
 *
 * There is no transform between versions: a layout is a resolved record, and a session's codec
 * holds its own. Stamping a packet with the session's protocol is the whole per-send cost.
 *
 * @see `docs/adr/0003-declarative-wire-layouts.md`
 */
import { isGated } from './define';

import type BinaryStream from '@jsprismarine/binaryutils';
import type { FieldSpec, PacketDefinition, PayloadOf } from './define';
import type { WireType } from './fieldTypes';

/** One resolved field: its payload key and its wire type. */
interface ResolvedField {
    readonly key: string;
    readonly of: WireType<unknown>;
}

/** A definition resolved against one protocol version. */
export interface WireLayout<D extends PacketDefinition = PacketDefinition> {
    /** The packet's name, as the codec id tables key it. */
    readonly name: string;
    /** The fields on the wire at this version, in wire order. */
    readonly fields: readonly ResolvedField[];
    /** `[key, fallback]` for each field this version leaves off the wire. */
    readonly absent: ReadonlyArray<readonly [string, unknown]>;
    /** Writes a payload's fields in wire order. */
    encode(stream: BinaryStream, payload: PayloadOf<D>): void;
    /** Reads a payload off the stream, filling absent fields with their fallbacks. */
    decode(stream: BinaryStream): PayloadOf<D>;
}

/** The cache key for a gate-free definition, which resolves the same at every version. */
const UNVERSIONED = Symbol('unversioned');

const layoutCaches = new WeakMap<PacketDefinition, Map<number | typeof UNVERSIONED, WireLayout>>();

const resolve = (definition: PacketDefinition, protocolVersion: number): WireLayout => {
    const fields: ResolvedField[] = [];
    const absent: Array<readonly [string, unknown]> = [];
    for (const [key, spec] of Object.entries(definition.fields) as Array<[string, FieldSpec<unknown>]>) {
        if (!isGated(spec)) {
            fields.push({ key, of: spec });
        } else if (spec.gate.includedAt(protocolVersion)) {
            fields.push({ key, of: spec.of });
        } else {
            absent.push([key, spec.fallback] as const);
        }
    }

    const frozenFields = Object.freeze(fields.map((field) => Object.freeze(field)));
    const frozenAbsent = Object.freeze(absent);
    return Object.freeze({
        name: definition.name,
        fields: frozenFields,
        absent: frozenAbsent,
        encode(stream: BinaryStream, payload: Record<string, unknown>): void {
            for (const { key, of } of frozenFields) of.write(stream, payload[key]);
        },
        decode(stream: BinaryStream): Record<string, unknown> {
            const payload: Record<string, unknown> = {};
            for (const { key, of } of frozenFields) payload[key] = of.read(stream);
            for (const [key, fallback] of frozenAbsent) payload[key] = fallback;
            return payload;
        }
        // The walker is type-erased internally; the definition's field map carries the real
        // payload type back out through WireLayout<D>.
    }) as WireLayout;
};

/** Whether any field of the definition is version-gated. */
const hasGates = (definition: PacketDefinition): boolean =>
    Object.values(definition.fields).some((spec) => isGated(spec as FieldSpec<unknown>));

/**
 * The layout of a definition at a protocol version, resolved once and frozen.
 *
 * @param definition - The packet's field list.
 * @param protocolVersion - The protocol the session negotiated.
 */
export const layoutAt = <D extends PacketDefinition>(definition: D, protocolVersion: number): WireLayout<D> => {
    let cache = layoutCaches.get(definition);
    if (cache === undefined) {
        cache = new Map();
        layoutCaches.set(definition, cache);
    }

    const key = hasGates(definition) ? protocolVersion : UNVERSIONED;
    let layout = cache.get(key);
    if (layout === undefined) {
        layout = resolve(definition, protocolVersion);
        cache.set(key, layout);
    }

    return layout as WireLayout<D>;
};
