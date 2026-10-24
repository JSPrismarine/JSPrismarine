import { DiagnosticCollector } from './diagnostics';
import { defaultEnchantmentView, defaultItemStackOps } from './item';
import type { ContentView, EnchantmentView, ItemStack, ItemStackOps } from './item';
import { constantRandom } from './random';
import type { RandomSource } from './random';
import type { BlockEntityView, BlockState, DamageSource, EntityView, LevelView, Vec3 } from './world';

/**
 * The 16 loot context parameters Java 26.3 registers in
 * `LootContextParams`, with the type this package carries for each.
 */
export interface LootContextParameters {
    /** The entity the evaluation is about: the mob that died, the player opening the chest. */
    this_entity?: EntityView;
    interacting_entity?: EntityView;
    target_entity?: EntityView;
    last_damage_player?: EntityView;
    damage_source?: DamageSource;
    /** The entity behind the damage, which is the shooter for a projectile. */
    attacking_entity?: EntityView;
    /** The entity that landed the hit, which is the projectile itself. */
    direct_attacking_entity?: EntityView;
    origin?: Vec3;
    block_state?: BlockState;
    block_entity?: BlockEntityView;
    tool?: ItemStack;
    explosion_radius?: number;
    enchantment_level?: number;
    enchantment_active?: boolean;
    additional_cost_component_allowed?: boolean;
    container?: readonly ItemStack[];
}

/** One of the keys of {@link LootContextParameters}. */
export type LootContextParameter = keyof LootContextParameters;

/** Which parameters a context key set guarantees and which it only allows. */
export interface ContextParameterSet {
    readonly required: readonly LootContextParameter[];
    readonly optional: readonly LootContextParameter[];
}

/**
 * The 31 context key sets of Java 26.3, read out of
 * `LootContextParamSets.<clinit>` in the 26.3 server jar. Evaluating a
 * predicate against the wrong set is what the missing-parameter diagnostic
 * catches.
 */
export const CONTEXT_PARAMETER_SETS = {
    empty: { required: [], optional: [] },
    generic: {
        required: [
            'this_entity',
            'last_damage_player',
            'damage_source',
            'attacking_entity',
            'direct_attacking_entity',
            'origin',
            'block_state'
        ],
        optional: []
    },
    chest: { required: ['origin'], optional: ['this_entity'] },
    command: { required: ['origin'], optional: ['this_entity'] },
    command_slot_source: { required: ['origin', 'container'], optional: ['this_entity'] },
    command_compute_default: { required: ['origin'], optional: ['this_entity'] },
    command_compute_position: { required: ['origin', 'block_state'], optional: ['this_entity', 'block_entity'] },
    command_compute_entity: { required: ['origin', 'target_entity'], optional: ['this_entity'] },
    selector: { required: ['origin', 'this_entity'], optional: [] },
    villager_trade: { required: ['origin', 'this_entity', 'additional_cost_component_allowed'], optional: [] },
    fishing: { required: ['origin', 'tool'], optional: ['this_entity'] },
    entity: {
        required: ['this_entity', 'origin', 'damage_source'],
        optional: ['attacking_entity', 'direct_attacking_entity', 'last_damage_player']
    },
    equipment: { required: ['origin', 'this_entity'], optional: [] },
    archaeology: { required: ['origin', 'this_entity', 'tool'], optional: [] },
    gift: { required: ['origin', 'this_entity'], optional: [] },
    barter: { required: ['this_entity'], optional: [] },
    vault: { required: ['origin', 'tool'], optional: ['this_entity'] },
    advancement_reward: { required: ['this_entity', 'origin'], optional: [] },
    advancement_entity: { required: ['this_entity', 'origin'], optional: [] },
    advancement_location: { required: ['this_entity', 'origin', 'tool', 'block_state'], optional: ['block_entity'] },
    block_use: { required: ['this_entity', 'origin', 'block_state'], optional: [] },
    block: {
        required: ['block_state', 'origin', 'tool'],
        optional: ['this_entity', 'block_entity', 'explosion_radius']
    },
    shearing: { required: ['origin', 'this_entity', 'tool'], optional: [] },
    entity_interact: { required: ['target_entity', 'tool'], optional: ['interacting_entity'] },
    block_interact: {
        required: ['block_state', 'origin'],
        optional: ['block_entity', 'interacting_entity', 'tool']
    },
    container_process: { required: ['block_entity', 'block_state', 'container', 'origin'], optional: [] },
    enchanted_damage: {
        required: ['this_entity', 'enchantment_level', 'origin', 'damage_source'],
        optional: ['direct_attacking_entity', 'attacking_entity']
    },
    enchanted_item: { required: ['tool', 'enchantment_level'], optional: [] },
    enchanted_location: {
        required: ['this_entity', 'enchantment_level', 'origin', 'enchantment_active'],
        optional: []
    },
    enchanted_entity: { required: ['this_entity', 'enchantment_level', 'origin'], optional: [] },
    hit_block: { required: ['this_entity', 'enchantment_level', 'origin', 'block_state'], optional: [] }
} as const satisfies Record<string, ContextParameterSet>;

/** One of the keys of {@link CONTEXT_PARAMETER_SETS}. */
export type ContextParameterSetName = keyof typeof CONTEXT_PARAMETER_SETS;

const hasLevelMember = <K extends keyof LevelView>(
    level: LevelView,
    key: K
): level is LevelView & Required<Pick<LevelView, K>> => typeof level[key] === 'function';

/** Everything {@link PredicateContext} needs, all of it optional so a test can supply only what it exercises. */
export interface PredicateContextOptions {
    /** Defaults to `empty`, which declares no parameters and so reports every read. */
    parameterSet?: ContextParameterSetName;
    parameters?: LootContextParameters;
    /** Defaults to a source that always draws 0.5. */
    random?: RandomSource;
    level?: LevelView;
    /** Defaults to a fresh collector, reachable as {@link PredicateContext.diagnostics}. */
    diagnostics?: DiagnosticCollector;
    items?: ItemStackOps;
    enchantments?: EnchantmentView;
    content?: ContentView;
}

/**
 * What a parsed predicate, modifier or provider evaluates against. Reading a
 * parameter the declared context key set does not provide reports a
 * diagnostic and yields undefined, so a predicate attached to the wrong loot
 * table fails loudly instead of quietly passing.
 */
export class PredicateContext {
    /** The context key set the host declared, which decides what {@link parameter} will answer. */
    public readonly parameterSet: ContextParameterSetName;
    public readonly parameters: LootContextParameters;
    public readonly random: RandomSource;
    public readonly level: LevelView | undefined;
    public readonly diagnostics: DiagnosticCollector;
    public readonly items: ItemStackOps;
    public readonly enchantments: EnchantmentView;
    public readonly content: ContentView;

    public constructor(options: PredicateContextOptions = {}) {
        this.parameterSet = options.parameterSet ?? 'empty';
        this.parameters = options.parameters ?? {};
        this.random = options.random ?? constantRandom(0.5);
        this.level = options.level;
        this.diagnostics = options.diagnostics ?? new DiagnosticCollector();
        this.items = options.items ?? defaultItemStackOps;
        this.enchantments = options.enchantments ?? defaultEnchantmentView;
        this.content = options.content ?? {};
    }

    /**
     * Reads a loot context parameter.
     *
     * @param path - Diagnostic path of the grammar member asking for it.
     * @returns The value, or undefined after reporting when the set does not
     * declare the parameter or a required parameter is missing.
     */
    public parameter<K extends LootContextParameter>(key: K, path: string): LootContextParameters[K] | undefined {
        const set: ContextParameterSet = CONTEXT_PARAMETER_SETS[this.parameterSet];
        const required = set.required.includes(key);
        if (!required && !set.optional.includes(key)) {
            this.diagnostics.error(path, `the ${this.parameterSet} loot context does not provide ${key}`);
            return undefined;
        }

        const value = this.parameters[key];
        if (value === undefined && required) {
            this.diagnostics.error(path, `required loot context parameter ${key} is missing`);
        }
        return value;
    }

    /**
     * Returns the level view narrowed so `key` is callable on it, or undefined
     * after reporting that the host cannot answer that question.
     */
    public levelWith<K extends keyof LevelView>(
        key: K,
        path: string
    ): (LevelView & Required<Pick<LevelView, K>>) | undefined {
        const level = this.level;
        if (!level) {
            this.diagnostics.error(path, 'no level view is bound to this context');
            return undefined;
        }
        if (!hasLevelMember(level, key)) {
            this.diagnostics.error(path, `the level view does not implement ${key}`);
            return undefined;
        }
        return level;
    }
}
