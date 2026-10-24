import type { MolangScope, MolangValue } from './scope';

/** The scope member a query reads. `tags` resolves to the item when present, else the block. */
export type QueryContextKind = 'entity' | 'block' | 'item' | 'world' | 'placement' | 'tags' | 'pure';

/** A registered query: the context it needs and its implementation. */
export interface QueryDefinition {
    /** Which part of the scope the query reads; loaders can validate fields against it. */
    context: QueryContextKind;
    /** Evaluates the query over already-evaluated arguments. */
    evaluate: (scope: MolangScope, args: readonly MolangValue[]) => MolangValue;
}

const bool = (value: boolean | undefined) => (value ? 1 : 0);
const num = (value: number | undefined) => value ?? 0;
const toNumber = (value: MolangValue | undefined) => (typeof value === 'number' ? value : 0);
const toText = (value: MolangValue | undefined) => (typeof value === 'string' ? value : '');
const strings = (args: readonly MolangValue[]) => args.filter((value): value is string => typeof value === 'string');

const scopeTags = (scope: MolangScope): readonly string[] => scope.item?.tags?.() ?? scope.block?.tags?.() ?? [];

/**
 * The 21 queries the vanilla behavior pack uses server-side, keyed without the `query.` prefix.
 * Each declares the scope context it reads.
 */
export const VANILLA_QUERIES = {
    above_top_solid: {
        context: 'placement',
        evaluate: (scope, args) => num(scope.placement?.aboveTopSolid?.(toNumber(args[0]), toNumber(args[1])))
    },
    all_tags: {
        context: 'tags',
        evaluate: (scope, args) => {
            const tags = scopeTags(scope);
            const wanted = strings(args);
            return bool(wanted.length > 0 && wanted.every((tag) => tags.includes(tag)));
        }
    },
    anger_level: {
        context: 'entity',
        evaluate: (scope) => num(scope.entity?.angerLevel?.())
    },
    any_tag: {
        context: 'tags',
        evaluate: (scope, args) => {
            const tags = scopeTags(scope);
            return bool(strings(args).some((tag) => tags.includes(tag)));
        }
    },
    block_state: {
        context: 'block',
        evaluate: (scope, args) => {
            const value = scope.block?.blockState?.(toText(args[0]));
            if (typeof value === 'string') return value;
            if (typeof value === 'boolean') return bool(value);
            return num(value);
        }
    },
    equipment_count: {
        context: 'entity',
        evaluate: (scope) => num(scope.entity?.equipmentCount?.())
    },
    had_component_group: {
        context: 'entity',
        evaluate: (scope, args) => bool(scope.entity?.hadComponentGroup?.(toText(args[0])))
    },
    has_any_family: {
        context: 'entity',
        evaluate: (scope, args) => bool(scope.entity?.hasAnyFamily?.(strings(args)))
    },
    has_biome_tag: {
        context: 'placement',
        evaluate: (scope, args) =>
            bool(
                scope.placement?.hasBiomeTag?.(
                    toText(args[0]),
                    args[1] === undefined ? undefined : toNumber(args[1]),
                    args[2] === undefined ? undefined : toNumber(args[2]),
                    args[3] === undefined ? undefined : toNumber(args[3])
                )
            )
    },
    head_is_in_water: {
        context: 'entity',
        evaluate: (scope) => bool(scope.entity?.headIsInWater?.())
    },
    heightmap: {
        context: 'placement',
        evaluate: (scope, args) => num(scope.placement?.heightmap?.(toNumber(args[0]), toNumber(args[1])))
    },
    is_baby: {
        context: 'entity',
        evaluate: (scope) => bool(scope.entity?.isBaby?.())
    },
    is_on_ground: {
        context: 'entity',
        evaluate: (scope) => bool(scope.entity?.isOnGround?.())
    },
    is_using_item: {
        context: 'entity',
        evaluate: (scope) => bool(scope.entity?.isUsingItem?.())
    },
    last_hit_by_player: {
        context: 'entity',
        evaluate: (scope) => bool(scope.entity?.lastHitByPlayer?.())
    },
    max_durability: {
        context: 'item',
        evaluate: (scope) => num(scope.item?.maxDurability?.())
    },
    noise: {
        context: 'placement',
        evaluate: (scope, args) => num(scope.placement?.noise?.(toNumber(args[0]), toNumber(args[1])))
    },
    player_level: {
        context: 'entity',
        evaluate: (scope) => num(scope.entity?.playerLevel?.())
    },
    property: {
        context: 'entity',
        evaluate: (scope, args) => scope.entity?.property?.(toText(args[0])) ?? 0
    },
    remaining_durability: {
        context: 'item',
        evaluate: (scope) => num(scope.item?.remainingDurability?.())
    },
    variant: {
        context: 'entity',
        evaluate: (scope) => num(scope.entity?.variant?.())
    }
} as const satisfies Record<string, QueryDefinition>;

/** The name of a registered vanilla server-side query. */
export type VanillaQueryName = keyof typeof VANILLA_QUERIES;

/**
 * A registry of queries by bare name (without the `query.` prefix). Starts with the vanilla
 * server-side set; register more as the components that back them land.
 */
export class QueryRegistry {
    private readonly queries = new Map<string, QueryDefinition>(Object.entries(VANILLA_QUERIES));

    /** Adds or replaces a query under its bare name. */
    public register(name: string, definition: QueryDefinition): void {
        this.queries.set(name.toLowerCase(), definition);
    }

    /** Looks a query up by bare name, or undefined when it is not registered. */
    public get(name: string): QueryDefinition | undefined {
        return this.queries.get(name);
    }
}
