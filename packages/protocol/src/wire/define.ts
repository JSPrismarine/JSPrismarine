/**
 * Packet definitions: one ordered field list per packet, as data.
 *
 * The list is the single source for a packet's wire order, both wire directions, and its
 * TypeScript payload shape ({@link PayloadOf} derives the type from the value, so a field
 * cannot exist on the wire without existing on the type or the other way around). A field
 * whose presence depends on the protocol version wraps its type in {@link gated}; a packet
 * whose layout never changed carries no gate and never mentions a version.
 *
 * Field order is the object literal's property order, which JavaScript preserves for string
 * keys. The resolved layout materializes that order into a frozen array once per protocol
 * version (`WireLayout.ts`), and the capture round-trip suite holds the order against real
 * server bytes, so a misordered list fails loudly rather than silently.
 *
 * @see `docs/adr/0003-declarative-wire-layouts.md`
 */
import type { WireType } from './fieldTypes';
import type { WireGate } from './wireGates';

/** A field whose presence a {@link WireGate} decides per protocol version. */
export interface GatedField<T> {
    readonly gate: WireGate;
    readonly of: WireType<T>;
    /** What the payload holds at versions where the field is not on the wire. */
    readonly fallback: T;
}

/** One entry in a field list: always on the wire, or gated by version. */
export type FieldSpec<T> = WireType<T> | GatedField<T>;

/** Marks a field as travelling only at the versions its gate admits. */
export const gated = <T>(gate: WireGate, of: WireType<T>, fallback: T): GatedField<T> =>
    Object.freeze({ gate, of, fallback });

/** Whether a field spec is gated. */
export const isGated = <T>(spec: FieldSpec<T>): spec is GatedField<T> => 'gate' in spec;

/** The value type one field spec carries. */
type ValueOf<S> = S extends FieldSpec<infer T> ? T : never;

/** The payload shape a definition's field list implies. */
export type PayloadOf<D> = D extends PacketDefinition<infer F> ? { -readonly [K in keyof F]: ValueOf<F[K]> } : never;

/** A packet's declarative description: its wire name and its ordered field list. */
export interface PacketDefinition<F extends Record<string, FieldSpec<unknown>> = Record<string, FieldSpec<unknown>>> {
    /** The packet's name in the id tables, e.g. `AnimatePacket`. */
    readonly name: string;
    /** The ordered fields, in wire order. */
    readonly fields: Readonly<F>;
}

/**
 * Declares a packet's wire layout.
 *
 * @param name - The packet's name as the codec id tables key it.
 * @param fields - The fields in wire order.
 */
export const definePacket = <F extends Record<string, FieldSpec<unknown>>>(
    name: string,
    fields: F
): PacketDefinition<F> => Object.freeze({ name, fields: Object.freeze(fields) });
