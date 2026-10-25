import { DiagnosticCollector } from '@jsprismarine/predicates';
import type {
    ContentView,
    EnchantmentView,
    EntityView,
    ItemStackOps,
    LevelView,
    PredicateContext,
    RandomSource
} from '@jsprismarine/predicates';

import type { EvaluationServices } from './events';
import type { AdvancementRewards, CompiledCriterion, ParsedAdvancement } from './model';
import type { PlayerAdvancements } from './progress';
import { buildAdvancementTree } from './tree';
import type { AdvancementTree } from './tree';
import { eventKey } from './triggers';
import type { AnyTriggerEvent, TriggerEvents, TriggerName } from './triggers';

/**
 * Where the four reward kinds land. Every hook is optional, and a reward with
 * no hook reports a diagnostic rather than failing the completion, so a server
 * can ship advancements before it has a loot runner or a function runtime. The
 * function hook is the seam `@jsprismarine/mcfunction` fills.
 */
export interface RewardHooks {
    /** Adds experience points, not levels, which is what `rewards.experience` counts. */
    grantExperience?(player: EntityView, amount: number): void;
    /** Rolls a loot table and gives the player what it produced. */
    runLootTable?(player: EntityView, lootTable: string): void;
    unlockRecipe?(player: EntityView, recipe: string): void;
    runFunction?(player: EntityView, id: string): void;
}

/** The world views and hooks an engine evaluates and rewards through. */
export interface AdvancementEngineOptions {
    level?: LevelView;
    items?: ItemStackOps;
    enchantments?: EnchantmentView;
    content?: ContentView;
    random?: RandomSource;
    /** Reuse a collector to gather load faults and evaluation faults into one report. */
    diagnostics?: DiagnosticCollector;
    rewards?: RewardHooks;
}

/** One criterion in the dispatch index, with the advancement it belongs to. */
interface IndexedCriterion {
    readonly advancement: ParsedAdvancement;
    readonly criterion: CompiledCriterion;
}

/**
 * The advancement engine: it holds the loaded tree, routes game events to the
 * criteria listening for them, records progress against a player's store, and
 * fires rewards when an advancement completes.
 *
 * Criteria are indexed by trigger, and the four triggers whose event names a
 * registry element are indexed by that element as well, so raising an event
 * touches the criteria that could match it rather than all of them.
 */
export class AdvancementEngine {
    private readonly options: AdvancementEngineOptions;
    private readonly collector: DiagnosticCollector;
    private readonly byId = new Map<string, ParsedAdvancement>();
    private readonly byTrigger = new Map<TriggerName, IndexedCriterion[]>();
    private readonly byKey = new Map<string, IndexedCriterion[]>();
    private built: AdvancementTree = { roots: [], nodes: new Map() };

    public constructor(options: AdvancementEngineOptions = {}) {
        this.options = options;
        this.collector = options.diagnostics ?? new DiagnosticCollector();
    }

    /** The parent tree of everything loaded, rebuilt by each {@link load}. */
    public get tree(): AdvancementTree {
        return this.built;
    }

    /** Diagnostics from loading and from every evaluation since. */
    public get diagnostics(): DiagnosticCollector {
        return this.collector;
    }

    /** One loaded advancement by namespaced id. */
    public get(id: string): ParsedAdvancement | undefined {
        return this.byId.get(id);
    }

    /**
     * Replaces everything loaded with a new set, rebuilds the parent tree and
     * rebuilds the dispatch index. Tree faults go to the engine's collector.
     */
    public load(advancements: Iterable<ParsedAdvancement>): void {
        this.byId.clear();
        this.byTrigger.clear();
        this.byKey.clear();

        for (const advancement of advancements) {
            this.byId.set(advancement.id, advancement);
            for (const criterion of advancement.criteria.values()) {
                const entry: IndexedCriterion = { advancement, criterion };
                if (criterion.keys) {
                    for (const key of criterion.keys)
                        this.bucket(this.byKey, `${criterion.trigger}\u0000${key}`).push(entry);
                } else {
                    this.bucket(this.byTrigger, criterion.trigger).push(entry);
                }
            }
        }

        this.built = buildAdvancementTree(this.byId.values(), this.collector).tree;
    }

    /**
     * Routes one game event to the criteria listening for its trigger and
     * records every criterion it satisfies.
     *
     * @param progress - The player's store, updated in place.
     * @param at - ISO-8601 instant to record on each criterion; defaults to now.
     * @returns Namespaced ids of the advancements this event completed, in the
     * order they completed. An advancement already done completes no second
     * time and fires no second reward.
     */
    public raise<K extends TriggerName>(
        trigger: K,
        event: TriggerEvents[K],
        progress: PlayerAdvancements,
        at: string = new Date().toISOString()
    ): readonly string[] {
        const services: EvaluationServices = {
            diagnostics: this.collector,
            level: this.options.level,
            items: this.options.items,
            enchantments: this.options.enchantments,
            content: this.options.content,
            random: this.options.random,
            contexts: new Map<EntityView, PredicateContext>()
        };

        const completed: string[] = [];
        for (const entry of this.candidates(trigger, event)) {
            if (progress.hasCriterion(entry.advancement.id, entry.criterion.name)) continue;
            if (progress.isDone(entry.advancement)) continue;
            if (!entry.criterion.test(event, services)) continue;

            progress.grant(entry.advancement.id, entry.criterion.name, at);
            if (!progress.isDone(entry.advancement)) continue;
            completed.push(entry.advancement.id);
            this.reward(entry.advancement.rewards, event.player);
        }
        return completed;
    }

    /**
     * Completes every criterion of one advancement, the way
     * `/advancement grant` does.
     *
     * @returns Whether this call completed the advancement.
     */
    public award(id: string, progress: PlayerAdvancements, player: EntityView, at?: string): boolean {
        const advancement = this.byId.get(id);
        if (!advancement) {
            this.collector.error(id, 'cannot award an advancement that is not loaded');
            return false;
        }
        if (progress.isDone(advancement)) return false;

        for (const name of advancement.criteria.keys()) progress.grant(advancement.id, name, at);
        if (!progress.isDone(advancement)) return false;
        this.reward(advancement.rewards, player);
        return true;
    }

    /** Fires the reward hooks for one completion, reporting each kind the host left unhooked. */
    private reward(rewards: AdvancementRewards, player: EntityView): void {
        const hooks = this.options.rewards;
        if (rewards.experience !== 0) {
            if (hooks?.grantExperience) hooks.grantExperience(player, rewards.experience);
            else this.collector.warn('rewards.experience', 'no grantExperience hook is bound');
        }
        for (const lootTable of rewards.lootTables) {
            if (hooks?.runLootTable) hooks.runLootTable(player, lootTable);
            else this.collector.warn('rewards.loot', `no runLootTable hook is bound for ${lootTable}`);
        }
        for (const recipe of rewards.recipes) {
            if (hooks?.unlockRecipe) hooks.unlockRecipe(player, recipe);
            else this.collector.warn('rewards.recipes', `no unlockRecipe hook is bound for ${recipe}`);
        }
        if (rewards.function !== undefined) {
            if (hooks?.runFunction) hooks.runFunction(player, rewards.function);
            else this.collector.warn('rewards.function', `no runFunction hook is bound for ${rewards.function}`);
        }
    }

    /** The criteria one event could satisfy: its keyed bucket when it has a key, plus the trigger's linear bucket. */
    private candidates(trigger: TriggerName, event: AnyTriggerEvent): readonly IndexedCriterion[] {
        const linear = this.byTrigger.get(trigger) ?? [];
        const key = eventKey(trigger, event);
        if (key === undefined) return linear;

        const keyed = this.byKey.get(`${trigger}\u0000${key}`) ?? [];
        return linear.length === 0 ? keyed : [...keyed, ...linear];
    }

    private bucket<K>(index: Map<K, IndexedCriterion[]>, key: K): IndexedCriterion[] {
        const existing = index.get(key);
        if (existing) return existing;
        const created: IndexedCriterion[] = [];
        index.set(key, created);
        return created;
    }
}
