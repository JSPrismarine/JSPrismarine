/** A pack `min_engine_version` triple, as found in a manifest header. */
export type EngineVersion = readonly [number, number, number];

/**
 * The language rules that change with a pack's `min_engine_version`.
 *
 * The engine versions each Molang expression by the manifest of the pack that contains it. Two
 * changes affect parsing: at 1.18.10 the ternary became right-associative, and at 1.18.20 `&&`
 * started binding tighter than `||` and comparisons tighter than equality. One change affects
 * evaluation: at 1.19.60 division by a dynamically determined negative value stopped dividing by
 * its absolute value.
 */
export interface MolangVersionRules {
    /** `A ? B : C ? D : E` groups as `A ? B : (C ? D : E)` from 1.18.10. */
    ternaryRightAssociative: boolean;
    /** `&&` binds tighter than `||` and comparison tighter than equality from 1.18.20. */
    andBeforeOr: boolean;
    /** Division by a non-constant negative divisor uses the real divisor from 1.19.60. */
    divideByNegativeValue: boolean;
}

const atLeast = (version: EngineVersion, major: number, minor: number, patch: number) =>
    version[0] !== major ? version[0] > major : version[1] !== minor ? version[1] > minor : version[2] >= patch;

/** Derives the versioned language rules from a pack's `min_engine_version`. */
export function rulesForEngineVersion(version: EngineVersion): MolangVersionRules {
    return {
        ternaryRightAssociative: atLeast(version, 1, 18, 10),
        andBeforeOr: atLeast(version, 1, 18, 20),
        divideByNegativeValue: atLeast(version, 1, 19, 60)
    };
}

/** The rules the latest engine applies; used when a caller gives no version. */
export const LATEST_RULES = rulesForEngineVersion([1, 26, 50]);
