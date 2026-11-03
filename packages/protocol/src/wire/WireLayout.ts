/**
 * A packet definition resolved against one protocol version, with compiled encode and decode
 * operations and a field-walking fallback.
 *
 * Resolution evaluates each field's gate once and produces a frozen flat record: the fields on
 * the wire at that version, in order, plus the fallback values for the fields that are not.
 * The compiled operations call the included fields' existing wire readers and writers in order;
 * decoding fills excluded fields with their fallbacks so a payload has the same shape at every
 * version. If the host disables dynamic code generation, the same resolved record drives the
 * field-walking fallback. A definition with no gates resolves to one shared frozen layout per
 * implementation, cached under a sentinel, so a packet whose wire never changed mentions no
 * version anywhere.
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
    /** Whether this layout uses generated straight-line code or the compatible field walker. */
    readonly implementation: 'compiled' | 'walker';
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

type LayoutEncoder = (stream: BinaryStream, payload: Record<string, unknown>) => void;
type LayoutDecoder = (stream: BinaryStream) => Record<string, unknown>;

interface CompiledLayout {
    readonly encode: LayoutEncoder;
    readonly decode: LayoutDecoder;
}

const compiledLayoutCaches = new WeakMap<PacketDefinition, Map<number | typeof UNVERSIONED, WireLayout>>();
const walkerLayoutCaches = new WeakMap<PacketDefinition, Map<number | typeof UNVERSIONED, WireLayout>>();
const gateChecks = new WeakMap<PacketDefinition, boolean>();

/** Generates only the call sequence; all field behavior remains in the original WireTypes. */
const compileLayout = (
    fields: readonly ResolvedField[],
    absent: ReadonlyArray<readonly [string, unknown]>
): CompiledLayout => {
    const writerNames = fields.map((_field, index) => 'w' + index);
    const writerBody = fields
        .map((field, index) => writerNames[index] + '(stream, payload[' + JSON.stringify(field.key) + ']);')
        .join('\n');
    const encoderSource = 'return function encode(stream, payload) { "use strict"; ' + writerBody + ' }';

    // Function cannot infer the generated function types. Its parameters are the existing typed
    // writers, and the body only calls each writer with its corresponding payload key.
    const encoderFactory = new Function(...writerNames, encoderSource) as (
        ...writers: WireType<unknown>['write'][]
    ) => LayoutEncoder;
    const encode = encoderFactory(...fields.map(({ of }) => of.write));

    const readerNames = fields.map((_field, index) => 'r' + index);
    const fallbackNames = absent.map((_field, index) => 'f' + index);
    const decodedFields = fields.map(
        (field, index) => '[' + JSON.stringify(field.key) + ']: ' + readerNames[index] + '(stream)'
    );
    const fallbackFields = absent.map(([key], index) => '[' + JSON.stringify(key) + ']: ' + fallbackNames[index]);
    const decoderSource =
        'return function decode(stream) { "use strict"; return { ' +
        [...decodedFields, ...fallbackFields].join(',') +
        ' }; }';

    // Generated parameters cannot be checked by TypeScript; they are only the original readers
    // followed by fallback values, so neither wire logic nor schema values become source text.
    const decoderFactory = new Function(...readerNames, ...fallbackNames, decoderSource) as (
        ...values: unknown[]
    ) => LayoutDecoder;
    const decode = decoderFactory(...fields.map(({ of }) => of.read), ...absent.map(([, fallback]) => fallback));

    return { encode, decode };
};

const resolve = (definition: PacketDefinition, protocolVersion: number, useCompiler: boolean): WireLayout => {
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
    let compiled: CompiledLayout | undefined;
    if (useCompiler) {
        try {
            compiled = compileLayout(frozenFields, frozenAbsent);
        } catch {
            // Dynamic code generation may be disabled by the host; retain the field walker.
        }
    }

    return Object.freeze({
        name: definition.name,
        implementation: compiled === undefined ? 'walker' : 'compiled',
        fields: frozenFields,
        absent: frozenAbsent,
        encode:
            compiled?.encode ??
            ((stream: BinaryStream, payload: Record<string, unknown>): void => {
                for (const { key, of } of frozenFields) of.write(stream, payload[key]);
            }),
        decode:
            compiled?.decode ??
            ((stream: BinaryStream): Record<string, unknown> => {
                const payload: Record<string, unknown> = {};
                for (const { key, of } of frozenFields) payload[key] = of.read(stream);
                for (const [key, fallback] of frozenAbsent) payload[key] = fallback;
                return payload;
            })
        // The walker is type-erased internally; the definition's field map carries the real
        // payload type back out through WireLayout<D>.
    }) as WireLayout;
};

/** Whether any field of the definition is version-gated. */
const hasGates = (definition: PacketDefinition): boolean => {
    const cached = gateChecks.get(definition);
    if (cached !== undefined) return cached;

    // Definitions are immutable, so their gate status is the same for every codec version.
    const result = Object.values(definition.fields).some(isGated);
    gateChecks.set(definition, result);
    return result;
};

/**
 * The layout of a definition at a protocol version, resolved once and frozen.
 *
 * @param definition - The packet's field list.
 * @param protocolVersion - The protocol the session negotiated.
 * @param useCompiler - Set false to force the compatible walker for differential tests.
 */
export const layoutAt = <D extends PacketDefinition>(
    definition: D,
    protocolVersion: number,
    useCompiler = true
): WireLayout<D> => {
    const layoutCaches = useCompiler ? compiledLayoutCaches : walkerLayoutCaches;
    let cache = layoutCaches.get(definition);
    if (cache === undefined) {
        cache = new Map();
        layoutCaches.set(definition, cache);
    }

    const key = hasGates(definition) ? protocolVersion : UNVERSIONED;
    let layout = cache.get(key);
    if (layout === undefined) {
        layout = resolve(definition, protocolVersion, useCompiler);
        cache.set(key, layout);
    }

    return layout as WireLayout<D>;
};
