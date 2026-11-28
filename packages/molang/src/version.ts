/** A pack `min_engine_version` triple, as found in a manifest header. */
export type EngineVersion = readonly [number, number, number];

/**
 * One Molang version: a number of BDS's `MolangVersion` enum and the engine version that brought
 * it in.
 *
 * The engine versions each Molang expression by the manifest of the pack that contains it. Any
 * change whose engine version is at or below the pack's `min_engine_version` is in effect, and
 * the newest one names the expression's version. The names are the enumerators in EndstoneMC's
 * mirror of the enum, and the engine versions are the rows of Mojang's "Versioned changes" table;
 * `docs/research/molang.md` lists both.
 */
export interface MolangVersionEntry {
    /** The enum's number, which travels as a block definition's `molangVersion`. */
    readonly version: number;
    /** The enumerator's name. */
    readonly name: string;
    /** The lowest `min_engine_version` that gets this version. */
    readonly since: EngineVersion;
}

/**
 * Every Molang version, oldest first.
 *
 * Protocol 2225's pinned Bedrock Dedicated Server writes this number as `molangVersion` on each pack
 * block it defines for a client: given packs at `min_engine_version` 1.13.0, 1.17.0, 1.18.20,
 * 1.20.60, 1.20.70, 1.21.90 and 1.21.100, it wrote 0, 1, 6, 11, 12, 12 and 13.
 */
export const MOLANG_VERSIONS = [
    { version: 0, name: 'BeforeVersioning', since: [0, 0, 0] },
    { version: 1, name: 'Initial', since: [1, 17, 0] },
    { version: 2, name: 'FixedItemRemainingUseDurationQuery', since: [1, 17, 30] },
    { version: 3, name: 'ExpressionErrorMessages', since: [1, 17, 40] },
    { version: 4, name: 'UnexpectedOperatorErrors', since: [1, 17, 40] },
    { version: 5, name: 'ConditionalOperatorAssociativity', since: [1, 18, 10] },
    { version: 6, name: 'ComparisonAndLogicalOperatorPrecedence', since: [1, 18, 20] },
    { version: 7, name: 'DivideByNegativeValue', since: [1, 19, 60] },
    { version: 8, name: 'FixedCapeFlapAmountQuery', since: [1, 20, 0] },
    { version: 9, name: 'QueryBlockPropertyRenamedToState', since: [1, 20, 10] },
    { version: 10, name: 'DeprecateOldBlockQueryNames', since: [1, 20, 40] },
    { version: 11, name: 'DeprecatedSnifferAndCamelQueries', since: [1, 20, 50] },
    { version: 12, name: 'LeafSupportingInFirstSolidBlockBelow', since: [1, 20, 70] },
    { version: 13, name: 'CarryingBlockQueryAllActors', since: [1, 21, 100] }
] as const satisfies readonly MolangVersionEntry[];

/** A number of BDS's `MolangVersion` enum. */
export type MolangVersion = (typeof MOLANG_VERSIONS)[number]['version'];

/** The newest Molang version, BDS's `Latest`, which also versions its hard-coded expressions. */
export const LATEST_MOLANG_VERSION: MolangVersion = MOLANG_VERSIONS.reduce<MolangVersion>(
    (latest, entry) => (entry.version > latest ? entry.version : latest),
    0
);

/** Looks up one version's entry. */
const entryOf = (version: MolangVersion): MolangVersionEntry => MOLANG_VERSIONS[version];

const atLeast = (version: EngineVersion, since: EngineVersion) =>
    version[0] !== since[0]
        ? version[0] > since[0]
        : version[1] !== since[1]
          ? version[1] > since[1]
          : version[2] >= since[2];

/** The Molang version a pack's `min_engine_version` gets: the newest one at or below it. */
export function molangVersionFor(engineVersion: EngineVersion): MolangVersion {
    let found: MolangVersion = 0;
    for (const entry of MOLANG_VERSIONS) if (atLeast(engineVersion, entry.since)) found = entry.version;
    return found;
}

/** Whether a Molang version includes the change another version brought in. */
const includes = (version: MolangVersion, change: MolangVersion): boolean => version >= entryOf(change).version;

/**
 * The language rules that change with the Molang version.
 *
 * Two changes affect parsing: `ConditionalOperatorAssociativity` made the ternary
 * right-associative, and `ComparisonAndLogicalOperatorPrecedence` made `&&` bind tighter than
 * `||` and comparisons tighter than equality. One change affects evaluation:
 * `DivideByNegativeValue` stopped dividing by a dynamically determined negative value's absolute
 * value.
 */
export interface MolangVersionRules {
    /** `A ? B : C ? D : E` groups as `A ? B : (C ? D : E)` from version 5. */
    ternaryRightAssociative: boolean;
    /** `&&` binds tighter than `||` and comparison tighter than equality from version 6. */
    andBeforeOr: boolean;
    /** Division by a non-constant negative divisor uses the real divisor from version 7. */
    divideByNegativeValue: boolean;
}

/** The versioned language rules of one Molang version. */
export function rulesForMolangVersion(version: MolangVersion): MolangVersionRules {
    return {
        ternaryRightAssociative: includes(version, 5),
        andBeforeOr: includes(version, 6),
        divideByNegativeValue: includes(version, 7)
    };
}

/** Derives the versioned language rules from a pack's `min_engine_version`. */
export function rulesForEngineVersion(version: EngineVersion): MolangVersionRules {
    return rulesForMolangVersion(molangVersionFor(version));
}

/** The rules the latest engine applies; used when a caller gives no version. */
export const LATEST_RULES = rulesForMolangVersion(LATEST_MOLANG_VERSION);
