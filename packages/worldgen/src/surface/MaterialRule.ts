import type { OreVeinRule } from '../chunk/oreVein';
import { parseOreVeinRule } from '../chunk/oreVein';
import type { DensityFunctionNode } from '../density/DensityFunction';
import { normalizeIdentifier, typeName } from '../identifier';
import type { VerticalAnchor } from './VerticalAnchor';
import { parseVerticalAnchor } from './VerticalAnchor';

/** Which side of a solid run a `stone_depth` condition counts from. */
export type CaveSurface = 'floor' | 'ceiling';

/**
 * One node of a material rule tree, which earlier releases called a surface rule.
 *
 * A rule returns a block state for a position or nothing, in which case the position keeps
 * whatever the terrain pass left there. 26.3 registers exactly these five types.
 */
export type MaterialRuleNode =
    | { readonly type: 'block'; readonly resultState: string }
    | { readonly type: 'bandlands' }
    | { readonly type: 'sequence'; readonly sequence: readonly MaterialRuleNode[] }
    | { readonly type: 'condition'; readonly ifTrue: MaterialConditionNode; readonly thenRun: MaterialRuleNode }
    | { readonly type: 'ore_vein'; readonly rule: OreVeinRule };

/**
 * One test a `condition` rule runs before its branch applies.
 *
 * 26.3 registers exactly these eleven types. `bandlands`, `hole`, `steep` and `ore_vein` are
 * the four the vanilla overworld tree needs that no other TypeScript implementation has.
 */
export type MaterialConditionNode =
    | { readonly type: 'biome'; readonly biomes: readonly string[] }
    | {
          readonly type: 'noise_threshold';
          readonly noise: string;
          readonly minThreshold: number;
          readonly maxThreshold: number;
          readonly is3d: boolean;
      }
    | {
          readonly type: 'vertical_gradient';
          readonly randomName: string;
          readonly trueAtAndBelow: VerticalAnchor;
          readonly falseAtAndAbove: VerticalAnchor;
      }
    | {
          readonly type: 'y_above';
          readonly anchor: VerticalAnchor;
          readonly surfaceDepthMultiplier: number;
          readonly addStoneDepth: boolean;
      }
    | {
          readonly type: 'water';
          readonly offset: number;
          readonly surfaceDepthMultiplier: number;
          readonly addStoneDepth: boolean;
      }
    | { readonly type: 'temperature' }
    | { readonly type: 'steep' }
    | { readonly type: 'not'; readonly invert: MaterialConditionNode }
    | { readonly type: 'hole' }
    | { readonly type: 'above_preliminary_surface' }
    | {
          readonly type: 'stone_depth';
          readonly offset: number;
          readonly addSurfaceDepth: boolean;
          readonly secondaryDepthRange: number;
          readonly surfaceType: CaveSurface;
      };

/** Every `material_rule` type 26.3 registers. */
export const MATERIAL_RULE_TYPES = ['block', 'bandlands', 'sequence', 'condition', 'ore_vein'] as const;

/** Every `material_condition` type 26.3 registers. */
export const MATERIAL_CONDITION_TYPES = [
    'biome',
    'noise_threshold',
    'vertical_gradient',
    'y_above',
    'water',
    'temperature',
    'steep',
    'not',
    'hole',
    'above_preliminary_surface',
    'stone_depth'
] as const;

const asObject = (value: unknown, path: string): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${path}: expected an object, got ${JSON.stringify(value)}`);
    }
    // A parsed JSON document is `unknown`; every field read below is checked.
    return value as Record<string, unknown>;
};

const number = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${path}: expected a finite number, got ${JSON.stringify(value)}`);
    }
    return value;
};

const integer = (value: unknown, path: string): number => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new TypeError(`${path}: expected an integer, got ${JSON.stringify(value)}`);
    }
    return value;
};

const boolean = (value: unknown, path: string, fallback?: boolean): boolean => {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'boolean') throw new TypeError(`${path}: expected a boolean, got ${JSON.stringify(value)}`);
    return value;
};

/** Reads a block state reference, which 26.3 writes as an identifier or as an object. */
const blockState = (value: unknown, path: string): string => {
    if (typeof value === 'string') return normalizeIdentifier(value);
    const raw = asObject(value, path);
    return normalizeIdentifier(raw['id'] ?? raw['Name'] ?? raw['name']);
};

const caveSurface = (value: unknown, path: string): CaveSurface => {
    if (value === 'floor' || value === 'ceiling') return value;
    throw new TypeError(`${path}: expected "floor" or "ceiling", got ${JSON.stringify(value)}`);
};

/** The registries a material rule document can reference. */
export interface MaterialRuleSource {
    /** `worldgen/material_rule`, keyed by identifier. */
    readonly materialRules: ReadonlyMap<string, unknown>;
    /** `worldgen/material_condition`, keyed by identifier. */
    readonly materialConditions: ReadonlyMap<string, unknown>;
    /** Expands a `#biome` tag that a `biome` condition names. */
    readonly biomeTag?: (tag: string) => readonly string[];
}

/**
 * The parsed `material_rule` and `material_condition` registries for one data pack stack.
 *
 * Parsing is lazy and memoized per identifier, the way {@link import('../WorldgenData').WorldgenData}
 * handles density functions, and a reference cycle is reported rather than left to overflow the
 * stack at sample time.
 */
export class MaterialRuleData {
    private readonly ruleCache = new Map<string, MaterialRuleNode>();
    private readonly conditionCache = new Map<string, MaterialConditionNode>();
    private readonly resolving = new Set<string>();

    public constructor(
        private readonly source: MaterialRuleSource,
        /** Resolves the density functions an `ore_vein` rule names. */
        private readonly densityFunction: (reference: unknown, path: string) => DensityFunctionNode
    ) {}

    /** The identifiers of every material rule in the stack. */
    public get ruleIds(): string[] {
        return [...this.source.materialRules.keys()];
    }

    /** The identifiers of every material condition in the stack. */
    public get conditionIds(): string[] {
        return [...this.source.materialConditions.keys()];
    }

    /**
     * Parses a registered material rule, following its references.
     *
     * @throws When the identifier is missing, or when the references form a cycle.
     */
    public rule(reference: string): MaterialRuleNode {
        const id = normalizeIdentifier(reference);
        const cached = this.ruleCache.get(id);
        if (cached) return cached;
        const raw = this.source.materialRules.get(id);
        if (raw === undefined) throw new RangeError(`No material rule is registered as ${id}`);
        const parsed = this.withCycleCheck(`rule ${id}`, () => this.parseRule(raw, id));
        this.ruleCache.set(id, parsed);
        return parsed;
    }

    /**
     * Parses a registered material condition, following its references.
     *
     * @throws When the identifier is missing, or when the references form a cycle.
     */
    public condition(reference: string): MaterialConditionNode {
        const id = normalizeIdentifier(reference);
        const cached = this.conditionCache.get(id);
        if (cached) return cached;
        const raw = this.source.materialConditions.get(id);
        if (raw === undefined) throw new RangeError(`No material condition is registered as ${id}`);
        const parsed = this.withCycleCheck(`condition ${id}`, () => this.parseCondition(raw, id));
        this.conditionCache.set(id, parsed);
        return parsed;
    }

    /**
     * Parses one inline material rule document.
     *
     * @param source - A document, or a string naming a registered rule.
     * @throws When the type is unknown or a field is missing. Nothing falls back to a no-op,
     *   so a schema change arrives as an error rather than as different terrain.
     */
    public parseRule(source: unknown, path = '<material_rule>'): MaterialRuleNode {
        if (typeof source === 'string') return this.rule(source);
        const raw = asObject(source, path);
        const type = typeName(raw['type']);
        switch (type) {
            case 'block':
                return { type: 'block', resultState: blockState(raw['result_state'], `${path}.result_state`) };
            case 'bandlands':
                return { type: 'bandlands' };
            case 'sequence': {
                const sequence = raw['sequence'];
                if (!Array.isArray(sequence) || sequence.length === 0) {
                    throw new TypeError(`${path}.sequence: expected a non-empty array`);
                }
                return {
                    type: 'sequence',
                    sequence: sequence.map((child, index) => this.parseRule(child, `${path}.sequence[${index}]`))
                };
            }
            case 'condition':
                return {
                    type: 'condition',
                    ifTrue: this.parseCondition(raw['if_true'], `${path}.if_true`),
                    thenRun: this.parseRule(raw['then_run'], `${path}.then_run`)
                };
            case 'ore_vein':
                return {
                    type: 'ore_vein',
                    rule: parseOreVeinRule(
                        raw,
                        (reference, childPath) => this.densityFunction(reference, childPath),
                        path
                    )
                };
            default:
                throw new TypeError(`${path}: unknown material rule type ${JSON.stringify(raw['type'])}`);
        }
    }

    /**
     * Parses one inline material condition document.
     *
     * @param source - A document, or a string naming a registered condition.
     * @throws When the type is unknown or a field is missing.
     */
    public parseCondition(source: unknown, path = '<material_condition>'): MaterialConditionNode {
        if (typeof source === 'string') return this.condition(source);
        const raw = asObject(source, path);
        const type = typeName(raw['type']);
        switch (type) {
            case 'biome':
                return { type: 'biome', biomes: this.parseBiomeSet(raw['biome_is'], `${path}.biome_is`) };
            case 'noise_threshold':
                return {
                    type: 'noise_threshold',
                    noise: normalizeIdentifier(raw['noise']),
                    minThreshold: number(raw['min_threshold'], `${path}.min_threshold`),
                    maxThreshold: number(raw['max_threshold'], `${path}.max_threshold`),
                    is3d: boolean(raw['is_3d'], `${path}.is_3d`, false)
                };
            case 'vertical_gradient':
                return {
                    type: 'vertical_gradient',
                    randomName: normalizeIdentifier(raw['random_name']),
                    trueAtAndBelow: parseVerticalAnchor(raw['true_at_and_below'], `${path}.true_at_and_below`),
                    falseAtAndAbove: parseVerticalAnchor(raw['false_at_and_above'], `${path}.false_at_and_above`)
                };
            case 'y_above':
                return {
                    type: 'y_above',
                    anchor: parseVerticalAnchor(raw['anchor'], `${path}.anchor`),
                    surfaceDepthMultiplier: integer(
                        raw['surface_depth_multiplier'],
                        `${path}.surface_depth_multiplier`
                    ),
                    addStoneDepth: boolean(raw['add_stone_depth'], `${path}.add_stone_depth`)
                };
            case 'water':
                return {
                    type: 'water',
                    offset: integer(raw['offset'], `${path}.offset`),
                    surfaceDepthMultiplier: integer(
                        raw['surface_depth_multiplier'],
                        `${path}.surface_depth_multiplier`
                    ),
                    addStoneDepth: boolean(raw['add_stone_depth'], `${path}.add_stone_depth`)
                };
            case 'temperature':
                return { type: 'temperature' };
            case 'steep':
                return { type: 'steep' };
            case 'not':
                return { type: 'not', invert: this.parseCondition(raw['invert'], `${path}.invert`) };
            case 'hole':
                return { type: 'hole' };
            case 'above_preliminary_surface':
                return { type: 'above_preliminary_surface' };
            case 'stone_depth':
                return {
                    type: 'stone_depth',
                    offset: integer(raw['offset'], `${path}.offset`),
                    addSurfaceDepth: boolean(raw['add_surface_depth'], `${path}.add_surface_depth`),
                    secondaryDepthRange: integer(raw['secondary_depth_range'], `${path}.secondary_depth_range`),
                    surfaceType: caveSurface(raw['surface_type'], `${path}.surface_type`)
                };
            default:
                throw new TypeError(`${path}: unknown material condition type ${JSON.stringify(raw['type'])}`);
        }
    }

    private parseBiomeSet(source: unknown, path: string): readonly string[] {
        const names = Array.isArray(source) ? source : [source];
        return names.flatMap((entry, index) => {
            const entryPath = Array.isArray(source) ? `${path}[${index}]` : path;
            if (typeof entry === 'string' && entry.startsWith('#')) {
                const expand = this.source.biomeTag;
                if (!expand) {
                    throw new RangeError(`${entryPath}: ${entry} is a biome tag and no tag resolver was supplied`);
                }
                return [...expand(normalizeIdentifier(entry.slice(1)))];
            }
            return [normalizeIdentifier(entry)];
        });
    }

    private withCycleCheck<T>(key: string, parse: () => T): T {
        if (this.resolving.has(key)) {
            throw new RangeError(`Material ${key} references itself through ${[...this.resolving].join(' -> ')}`);
        }
        this.resolving.add(key);
        try {
            return parse();
        } finally {
            this.resolving.delete(key);
        }
    }
}
