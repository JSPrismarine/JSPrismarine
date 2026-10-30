/**
 * Every protocol-version fork in the wire format, in one file.
 *
 * A gate decides whether a field travels at a given protocol version. Field lists reference
 * gates by name from here and nowhere else, so one grep over this file answers "where does the
 * wire format branch between the versions we speak". No encoder or decoder tests a version
 * itself: a gate is evaluated once per codec when its {@link `./WireLayout.ts` | layout} is
 * resolved, never per packet.
 *
 * Name gates after the change they admit, not after the packet using them — several packets
 * changed together at 2225 and share one gate.
 *
 * @see `docs/adr/0003-declarative-wire-layouts.md`
 */

/** Whether a field travels at a protocol version. */
export interface WireGate {
    /** Why the wire branches here, for provenance and error messages. */
    readonly reason: string;
    /** Answers whether the gated field is on the wire at this protocol version. */
    includedAt(protocolVersion: number): boolean;
}

/** A gate admitting a field from `protocolVersion` on. */
export const since = (protocolVersion: number, reason: string): WireGate =>
    Object.freeze({
        reason,
        includedAt: (version: number) => version >= protocolVersion
    });

/** A gate admitting a field up to but not including `protocolVersion`. */
export const until = (protocolVersion: number, reason: string): WireGate =>
    Object.freeze({
        reason,
        includedAt: (version: number) => version < protocolVersion
    });

/**
 * Protocol 2225 (Minecraft 1.26.60) appended or inserted fields in eight packets; see
 * `docs/research/protocol-2225-delta.md` for the per-packet evidence.
 */
export const SINCE_2225 = since(2225, 'added at protocol 2225 (Minecraft 1.26.60)');

/**
 * The other half of a layout change at 2225: the field as it travelled up to 2193, which
 * 2225 replaced rather than merely extended. A moved or reshaped field is a gated pair,
 * one field under this gate and its successor under {@link SINCE_2225}.
 */
export const UNTIL_2225 = until(2225, 'superseded at protocol 2225 (Minecraft 1.26.60)');
