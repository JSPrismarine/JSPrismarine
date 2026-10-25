import { DiagnosticCollector, PredicateContext, namespaced } from '@jsprismarine/predicates';
import type { ItemStack, Predicate, PredicateContextOptions } from '@jsprismarine/predicates';

import { declarationOf } from './components';
import type { ChargingSounds, EffectComponentType, EnchantmentTarget } from './components';
import type { ResolvedEffect } from './effects';
import { componentItemView, enchantmentsOf, stackMatches } from './item';
import type { ItemView } from './item';
import { MIN_ENCHANTMENT_LEVEL } from './definition';
import type { EnchantmentDefinition } from './definition';

/**
 * The 15 functionality tags under `tags/enchantment/` in 26.3. None of them
 * changes what an enchantment does; each one is a switch some other system
 * reads, which is why an enchantment is only half described by its own file.
 */
export const ENCHANTMENT_TAGS = [
    'curse',
    'double_trade_price',
    'in_enchanting_table',
    'non_treasure',
    'on_mob_spawn_equipment',
    'on_random_loot',
    'on_traded_equipment',
    'prevents_bee_spawns_when_mining',
    'prevents_decorated_pot_shattering',
    'prevents_ice_melting',
    'prevents_infested_spawns',
    'smelts_loot',
    'tooltip_order',
    'tradeable',
    'treasure'
] as const;

/** One of {@link ENCHANTMENT_TAGS}. */
export type EnchantmentTag = (typeof ENCHANTMENT_TAGS)[number];

/** What one effect run tells the host to do. */
export interface EffectRun {
    /** Namespaced id of the enchantment the effect came from. */
    readonly enchantment: string;
    readonly level: number;
    readonly component: EffectComponentType;
    readonly effect: ResolvedEffect;
    /** Which entity the effect acts on. Only `post_attack` names one. */
    readonly affected: EnchantmentTarget | undefined;
}

/**
 * Where an enchantment's world changes go. This package resolves what should
 * happen and never does it, because moving an entity, placing a block or
 * playing a sound belongs to the server.
 */
export type EffectSink = (run: EffectRun) => void;

/** One call to the effect machinery: whose enchantments, and against what. */
export interface EffectRequest {
    /** Enchantment id to level, which {@link enchantmentsOf} reads off a stack. */
    readonly enchantments: ReadonlyMap<string, number>;
    /**
     * What the `requirements` predicates evaluate against. The component
     * decides the loot context key set and this package fills in
     * `enchantment_level`, so a caller supplies only the parameters.
     */
    readonly context?: PredicateContextOptions;
    /**
     * Which side of a fight owns the enchanted item. Entries of `post_attack`
     * and `equipment_drops` that name a different `enchanted` target are
     * skipped.
     */
    readonly enchanted?: EnchantmentTarget;
}

/** Everything the registry is built from. */
export interface EnchantmentRegistryOptions {
    readonly definitions: Iterable<EnchantmentDefinition>;
    /**
     * Tag id to its raw values, keyed without the leading `#`. A value may
     * name another tag with a leading `#`, which vanilla's
     * `in_enchanting_table` does.
     */
    readonly tags?: ReadonlyMap<string, readonly string[]>;
    /**
     * Item answers the host can give, merged over {@link componentItemView}
     * so an unimplemented member still falls back to reading the component.
     */
    readonly items?: ItemView;
}

/**
 * Every enchantment a pack stack loaded, plus the tags that decide where each
 * one shows up, plus the machinery that runs their effects.
 *
 * The registry owns the four pieces an enchantment is made of that are not the
 * loot tables: the definition, the tags, the compatibility rules, and the 31
 * effect components. Callers that need the fifth piece, the enchantment level
 * a loot function reads, go through `createEnchantmentView`.
 */
export class EnchantmentRegistry {
    private readonly definitions: ReadonlyMap<string, EnchantmentDefinition>;
    private readonly tags: ReadonlyMap<string, readonly string[]>;
    private readonly expanded = new Map<string, ReadonlySet<string>>();
    private readonly exclusive = new Map<string, ReadonlySet<string>>();

    /** Item questions the registry cannot answer from a stack's components. */
    public readonly items: ItemView;

    public constructor(options: EnchantmentRegistryOptions) {
        const definitions = new Map<string, EnchantmentDefinition>();
        for (const definition of options.definitions) definitions.set(namespaced(definition.id), definition);

        this.definitions = definitions;
        this.tags = new Map(
            [...(options.tags ?? new Map())].map(([id, values]) => [namespaced(id.replace(/^#/, '')), values])
        );
        this.items = { ...componentItemView, ...options.items };
    }

    /** Every enchantment id the registry holds, in load order. */
    public get ids(): readonly string[] {
        return [...this.definitions.keys()];
    }

    /** Looks one enchantment up by namespaced or bare id. */
    public get(id: string): EnchantmentDefinition | undefined {
        return this.definitions.get(namespaced(id));
    }

    /** The highest level an enchantment reaches, or undefined when it is not registered. */
    public maxLevelOf(id: string): number | undefined {
        return this.get(id)?.maxLevel;
    }

    /**
     * Expands a tag to its enchantment ids, following tag values that name
     * other tags. A cycle stops at the tag that closes it rather than
     * recursing.
     */
    public membersOf(tag: string): ReadonlySet<string> {
        return this.expand(namespaced(tag.replace(/^#/, '')), new Set());
    }

    /** Whether an enchantment is in a tag. */
    public hasTag(id: string, tag: string): boolean {
        return this.membersOf(tag).has(namespaced(id));
    }

    /** Every enchantment that cannot share an item with this one. */
    public exclusiveWith(id: string): ReadonlySet<string> {
        const key = namespaced(id);
        const known = this.exclusive.get(key);
        if (known) return known;

        const members = new Set<string>();
        const definition = this.get(key);
        if (definition) {
            for (const entry of definition.exclusiveSet.ids) members.add(entry);
            for (const tag of definition.exclusiveSet.tags) {
                for (const entry of this.membersOf(tag)) members.add(entry);
            }
        }
        members.delete(key);
        this.exclusive.set(key, members);
        return members;
    }

    /**
     * Whether two enchantments may sit on one item. Java's rule, verbatim: a
     * different enchantment that neither side's exclusive set names.
     */
    public areCompatible(first: string, second: string): boolean {
        const a = namespaced(first);
        const b = namespaced(second);
        return a !== b && !this.exclusiveWith(a).has(b) && !this.exclusiveWith(b).has(a);
    }

    /** Whether an enchantment may go on a stack at all. */
    public supports(stack: ItemStack, id: string): boolean {
        const definition = this.get(id);
        return definition !== undefined && stackMatches(stack, definition.supportedItems, this.items);
    }

    /**
     * Whether the enchanting table may offer an enchantment for a stack. An
     * enchantment with no `primary_items` offers for every supported item.
     */
    public isPrimary(stack: ItemStack, id: string): boolean {
        const definition = this.get(id);
        if (definition === undefined || !this.supports(stack, id)) return false;
        return definition.primaryItems === undefined || stackMatches(stack, definition.primaryItems, this.items);
    }

    /** Every registered enchantment a stack supports, in load order. */
    public applicableTo(stack: ItemStack): readonly string[] {
        return this.ids.filter((id) => this.supports(stack, id));
    }

    /**
     * Runs every value effect of one component over a starting value.
     *
     * The component decides the loot context key set its conditions evaluate
     * against, so the caller passes the parameters of the moment and nothing
     * else. Enchantments apply in the order `request.enchantments` iterates,
     * and effects within one enchantment in file order, which is what Java
     * does and what makes `add` after `multiply` differ from the reverse.
     *
     * @param base - The vanilla value before any enchantment touches it.
     * @returns The value after every matching effect, or `base` when none match.
     */
    public modifyValue(component: EffectComponentType, base: number, request: EffectRequest): number {
        let running = base;
        for (const [id, level] of request.enchantments) {
            const parsed = this.get(id)?.effects.get(component);
            if (parsed === undefined) continue;

            const context = this.contextFor(component, level, request);
            if (parsed.kind === 'unconditional_value') {
                running = parsed.effect(level, running, context.random);
                continue;
            }
            if (parsed.kind !== 'value' && parsed.kind !== 'targeted_value') continue;

            for (const entry of parsed.entries) {
                if (!this.entryApplies(entry.enchanted, entry.requirements, context, request)) continue;
                running = entry.effect(level, running, context.random);
            }
        }
        return running;
    }

    /**
     * Resolves every entity, location or attribute effect of one component and
     * hands each one to the sink. Nothing in the world changes here; the sink
     * decides what a resolved effect means.
     */
    public runEffects(component: EffectComponentType, request: EffectRequest, sink: EffectSink): void {
        for (const [id, level] of request.enchantments) {
            const parsed = this.get(id)?.effects.get(component);
            if (parsed === undefined) continue;

            const context = this.contextFor(component, level, request);
            if (parsed.kind === 'attributes') {
                for (const modifier of parsed.modifiers) {
                    modifier(level, context, (effect) =>
                        sink({ enchantment: namespaced(id), level, component, effect, affected: undefined })
                    );
                }
                continue;
            }
            if (
                parsed.kind !== 'entity_effect' &&
                parsed.kind !== 'targeted_entity_effect' &&
                parsed.kind !== 'location_effect'
            ) {
                continue;
            }

            for (const entry of parsed.entries) {
                if (!this.entryApplies(entry.enchanted, entry.requirements, context, request)) continue;
                entry.effect(level, context, (effect) =>
                    sink({ enchantment: namespaced(id), level, component, effect, affected: entry.affected })
                );
            }
        }
    }

    /**
     * Whether any enchantment declares a marker component, which is how
     * `damage_immunity`, `prevent_armor_change` and `prevent_equipment_drop`
     * work. A conditional marker counts only when one of its entries matches.
     */
    public markerApplies(component: EffectComponentType, request: EffectRequest): boolean {
        for (const [id, level] of request.enchantments) {
            const parsed = this.get(id)?.effects.get(component);
            if (parsed === undefined) continue;
            if (parsed.kind === 'marker') return true;
            if (parsed.kind !== 'conditional_marker') continue;

            const context = this.contextFor(component, level, request);
            for (const entry of parsed.entries) {
                if (this.entryApplies(undefined, entry.requirements, context, request)) return true;
            }
        }
        return false;
    }

    /**
     * The sound bank one enchantment declares for a level, which is a
     * `{start, mid, end}` record for `crossbow_charging_sounds` and a sound id
     * for `trident_sound`. A level past the end of the list reuses the last
     * entry, as Java's clamp does.
     */
    public soundAt(component: EffectComponentType, id: string, level: number): ChargingSounds | string | undefined {
        const parsed = this.get(id)?.effects.get(component);
        if (parsed?.kind !== 'charging_sounds' && parsed?.kind !== 'sound_list') return undefined;

        const index = Math.min(Math.max(level - MIN_ENCHANTMENT_LEVEL, 0), parsed.perLevel.length - 1);
        return parsed.perLevel[index];
    }

    private expand(tag: string, visiting: Set<string>): ReadonlySet<string> {
        const known = this.expanded.get(tag);
        if (known) return known;
        if (visiting.has(tag)) return new Set();

        visiting.add(tag);
        const members = new Set<string>();
        for (const value of this.tags.get(tag) ?? []) {
            if (value.startsWith('#')) {
                for (const nested of this.expand(namespaced(value.slice(1)), visiting)) members.add(nested);
            } else {
                members.add(namespaced(value));
            }
        }
        visiting.delete(tag);

        this.expanded.set(tag, members);
        return members;
    }

    private contextFor(component: EffectComponentType, level: number, request: EffectRequest): PredicateContext {
        const options = request.context ?? {};
        return new PredicateContext({
            ...options,
            parameterSet: declarationOf(component).parameterSet ?? options.parameterSet ?? 'empty',
            parameters: { ...options.parameters, enchantment_level: level },
            diagnostics: options.diagnostics ?? new DiagnosticCollector()
        });
    }

    private entryApplies(
        enchanted: EnchantmentTarget | undefined,
        requirements: Predicate | undefined,
        context: PredicateContext,
        request: EffectRequest
    ): boolean {
        if (enchanted !== undefined && request.enchanted !== undefined && enchanted !== request.enchanted) return false;
        return requirements === undefined || requirements(context);
    }
}
