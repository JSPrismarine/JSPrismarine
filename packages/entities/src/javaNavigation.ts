import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';

/** Java's navigation, path costs, and pushability, read after the entity registers its goals. */
export interface JavaEntityNavigation {
    /** The Java class that owns the entity's path navigation. */
    readonly navigationClass: string;
    /** Whether Java's goal registrations enabled floating through liquid. */
    readonly canFloat: boolean;
    /** Whether the navigator can follow paths on solid ground. */
    readonly canNavigateGround: boolean;
    /** Whether Java lets this living entity push and be pushed by other entities. */
    readonly pushable: boolean;
    /** Java's per-path-type cost, with negative values marking blocked terrain. */
    readonly pathfindingMalus: Readonly<Record<string, number>>;
}

/** Java mob navigation data keyed by the Java entity identifier. */
export type JavaNavigationSource = Readonly<Record<string, JavaEntityNavigation>>;

const bedrockKeyedSources = new WeakMap<JavaNavigationSource, ReadonlyMap<string, JavaEntityNavigation>>();

/** Builds a source's Bedrock-keyed view on first use and keeps it. */
const bedrockKeyed = (source: JavaNavigationSource): ReadonlyMap<string, JavaEntityNavigation> => {
    const cached = bedrockKeyedSources.get(source);
    if (cached !== undefined) return cached;

    const byBedrock = new Map<string, JavaEntityNavigation>();
    const ambiguous = new Set<string>();
    for (const [javaIdentifier, navigation] of Object.entries(source)) {
        const mapped = javaEntityTypeToBedrock(javaIdentifier);
        if (mapped.kind !== 'mapped' || mapped.bedrock === javaIdentifier) continue;
        if (ambiguous.has(mapped.bedrock)) continue;
        if (byBedrock.has(mapped.bedrock)) {
            byBedrock.delete(mapped.bedrock);
            ambiguous.add(mapped.bedrock);
            continue;
        }
        byBedrock.set(mapped.bedrock, navigation);
    }

    bedrockKeyedSources.set(source, byBedrock);
    return byBedrock;
};

/** Java's navigation for the entity a Bedrock identifier spawns, when the dump has that type. */
export const javaEntityNavigation = (
    identifier: string,
    source: JavaNavigationSource | undefined
): JavaEntityNavigation | undefined =>
    source === undefined ? undefined : (source[identifier] ?? bedrockKeyed(source).get(identifier));
