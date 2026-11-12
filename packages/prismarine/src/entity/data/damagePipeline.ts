/**
 * Damage to an entity in the store, as one staged action
 * ([ADR 0013](../../../../../docs/adr/0013-vetoable-actions-are-staged.md)).
 *
 * Every blow a data-driven entity takes, whoever or whatever deals it, enters here as a
 * {@link DamageIntent} and runs four stages, synchronously.
 *
 * 1. The intent is plain data: who is hit, who is answerable, the cause, the amount and how the
 *    blow came.
 * 2. Guards run in the order they are listed. Each reads the intent and passes, vetoes or
 *    replaces the amount, which is the one parameter this pipeline declares replaceable. A guard
 *    writes nothing. Later guards see the replaced amount, and the first veto ends the run with
 *    one rejection record.
 * 3. Compute applies declared modifiers in priority order, each an operation and a value, such as
 *    armor multiplying the amount or the grace period subtracting the blow still running.
 * 4. Commit writes the result through the store's logged setters, and a death runs inside it.
 *
 * The pipeline knows no entity rules itself. The runtime lists the guards, the modifier slots
 * and the commit (`damageStages.ts`), and a host adds before-hooks, such as the plugin
 * `entityDamage` event, after them.
 */
import type { ContentPosition } from '../../content/world/adapter';

/**
 * The route a blow reached the store by. It names the blow in counts and in a rejection record,
 * and the routes the legacy code describes with a `DamageSource` keep the legacy rules through
 * {@link DamageSourceFacts}.
 */
export type DamageRoute =
    | 'melee'
    | 'mob_attack'
    | 'area_attack'
    | 'projectile'
    | 'explosion'
    | 'sonic_boom'
    | 'fire'
    | 'void'
    | 'component'
    | 'interaction'
    | 'command'
    | 'status_effect'
    | 'item'
    | 'legacy_body';

/**
 * How a blow came, beyond its cause.
 *
 * A player's sword, a legacy blast, a command or a status effect reached a data mob through the
 * legacy damage pipeline before the store owned damage, and that pipeline added a grace period,
 * armor, resistance, absorption and a shove. A mob's bite, a fire tick or a component hazard
 * went straight to the runtime and had none of them. Each caller states which it is, so both
 * keep the outcome they had.
 */
export interface DamageSourceFacts {
    /** Which path the blow came by. */
    readonly route: DamageRoute;
    /** Whether the grace period after a hit applies. */
    readonly graced?: boolean;
    /** Whether armor, its enchantments, resistance and absorption apply. */
    readonly mitigated?: boolean;
    /** Whether the blow ignores worn armor, as drowning and the void do. */
    readonly bypassesArmor?: boolean;
    /** Whether the blow ignores protection enchantments, as a sonic boom does. */
    readonly bypassesEnchantments?: boolean;
    /** Whether the blow ignores the grace period, as `/kill` and the void do. */
    readonly bypassesGrace?: boolean;
    /** Where the blow shoves the target away from, and with how many Knockback levels. */
    readonly knockback?: { readonly origin: ContentPosition; readonly levels: number };
    /** Whether a blow that lands shows the hurt animation and sound; true when left out. */
    readonly feedback?: boolean;
    /**
     * Whether the target remembers the blow for `hurt_by_target`, `panic` and the other goals
     * that read who hurt it; true when left out. A component's own hazard, such as drowning,
     * is not remembered.
     */
    readonly remembered?: boolean;
    /** The death message key to use instead of the cause's. */
    readonly deathMessageOverride?: string;
    /** The Java damage type a `/damage` named, such as `minecraft:magic`. */
    readonly damageType?: string;
    /** That damage type's tags, which decided what the blow bypasses. */
    readonly tags?: readonly string[];
}

/** One attempt to hurt an entity in the store, before anything has checked it. */
export interface DamageIntent {
    /** The runtime id of the entity being hurt. */
    readonly target: number;
    /** The runtime id of whoever is answerable, such as an archer, when anyone is. */
    readonly attacker?: number;
    /** The runtime id of what made contact, when that is not the attacker. */
    readonly projectile?: number;
    /** The damage cause, such as `entity_attack`, `fire_tick` or a legacy cause name. */
    readonly cause: string;
    /** The blow, in half-hearts, before any guard or modifier. */
    readonly amount: number;
    /** How the blow came. */
    readonly source: DamageSourceFacts;
}

/** The parameters a guard may replace. */
export interface DamageReplacement {
    /** The new amount. At or below zero, a replacement from a before-hook is a veto. */
    readonly amount: number;
}

/** What one guard decides. */
export type DamageVerdict =
    | { readonly verdict: 'pass' }
    | { readonly verdict: 'veto' }
    | { readonly verdict: 'replace'; readonly with: DamageReplacement };

/** A pass, shared because most guards pass most blows. */
export const PASS: DamageVerdict = { verdict: 'pass' };

/** A veto, shared for the same reason. */
export const VETO: DamageVerdict = { verdict: 'veto' };

/** Replaces the amount. */
export const replaceAmount = (amount: number): DamageVerdict => ({ verdict: 'replace', with: { amount } });

/** Where in the guard order a guard sits, as ADR 0013 states it. */
export type DamageGuardStage = 'pack' | 'game_rule' | 'before_hook';

/** The guard stages, in the order they run. */
export const DAMAGE_GUARD_STAGES: readonly DamageGuardStage[] = ['pack', 'game_rule', 'before_hook'];

/** One cheap check. It reads the intent and writes nothing. */
export interface DamageGuard {
    /** The guard's name, which a rejection record carries. */
    readonly name: string;
    readonly stage: DamageGuardStage;
    check(intent: DamageIntent): DamageVerdict;
}

/** How a modifier changes the amount. */
export type DamageModifierOperation = 'add' | 'multiply';

/** One declared change to the amount, as Java's attribute modifiers are declared. */
export interface DamageModifier {
    /** The slot that declared it. */
    readonly name: string;
    readonly operation: DamageModifierOperation;
    readonly value: number;
    /** Lower runs first. */
    readonly priority: number;
}

/**
 * A place in the compute stage that may declare one modifier for a blow.
 *
 * The value can depend on the amount the slots before it left, which is how armor works: its
 * reduction depends on how hard the blow is. The slot declares the modifier and the pipeline
 * applies it, so no slot changes the amount itself.
 */
export interface DamageModifierSlot {
    readonly name: string;
    readonly priority: number;
    modifier(intent: DamageIntent, amount: number): Omit<DamageModifier, 'name' | 'priority'> | undefined;
}

/** One modifier as it was applied, with the amount it left. */
export interface AppliedDamageModifier extends DamageModifier {
    readonly amountAfter: number;
}

/** What the compute stage produced. */
export interface DamageComputation {
    /** The amount the guards left, before any modifier. */
    readonly guarded: number;
    /** Every modifier that applied, in the order it applied. */
    readonly modifiers: readonly AppliedDamageModifier[];
    /** What reaches the commit. Never negative. */
    readonly amount: number;
}

/** What one run of the pipeline did. */
export type DamageOutcome =
    | {
          readonly committed: false;
          readonly intent: DamageIntent;
          /** The guard that vetoed. */
          readonly rejectedBy: string;
          readonly stage: DamageGuardStage;
      }
    | {
          readonly committed: true;
          /** The intent as the guards left it. */
          readonly intent: DamageIntent;
          readonly computation: DamageComputation;
          /** What came off the health. */
          readonly taken: number;
          /** Whether the blow killed the target. */
          readonly died: boolean;
      };

/** What the commit stage reports back. */
export interface DamageCommitResult {
    readonly taken: number;
    readonly died: boolean;
}

/** The stages one pipeline runs. */
export interface DamageStages {
    /** The pack and game-rule guards, in order. Before-hooks are added with {@link DamagePipeline.addBeforeHook}. */
    readonly guards: readonly DamageGuard[];
    readonly modifiers: readonly DamageModifierSlot[];
    /** Applies a computed blow through the store's setters. */
    commit(intent: DamageIntent, computation: DamageComputation): DamageCommitResult;
    /** Records a veto. Nothing else is written. */
    reject(intent: DamageIntent, guard: DamageGuard): void;
}

/**
 * Runs damage intents through their guards, modifiers and commit.
 *
 * Synchronous throughout, so a blow is decided and applied before the call returns, and a death
 * it causes has happened by then too.
 */
export class DamagePipeline {
    /**
     * Replaced rather than changed in place, so a hook that adds or removes a hook while a run
     * walks the list leaves that run's list as it was: removing one in place shifted the next
     * guard into its index, and the run skipped it.
     */
    private guards: readonly DamageGuard[];
    private readonly modifiers: readonly DamageModifierSlot[];
    private readonly runs = new Map<DamageRoute, number>();

    public constructor(private readonly stages: DamageStages) {
        this.guards = [...stages.guards].sort(
            (left, right) => DAMAGE_GUARD_STAGES.indexOf(left.stage) - DAMAGE_GUARD_STAGES.indexOf(right.stage)
        );
        this.modifiers = [...stages.modifiers].sort((left, right) => left.priority - right.priority);
    }

    /**
     * Adds a scripting or plugin before-hook, which runs after every pack and game-rule guard.
     * @returns A function that removes it.
     */
    public addBeforeHook(name: string, check: (intent: DamageIntent) => DamageVerdict): () => void {
        const guard: DamageGuard = { name, stage: 'before_hook', check };
        this.guards = [...this.guards, guard];
        return () => {
            this.guards = this.guards.filter((each) => each !== guard);
        };
    }

    /** How many intents each route has brought, for tests and reports. */
    public runsByRoute(): ReadonlyMap<DamageRoute, number> {
        return this.runs;
    }

    /** Runs one intent through every stage. */
    public run(intent: DamageIntent): DamageOutcome {
        this.runs.set(intent.source.route, (this.runs.get(intent.source.route) ?? 0) + 1);

        let current = intent;
        for (const guard of this.guards) {
            const verdict = guard.check(current);
            if (verdict.verdict === 'pass') continue;
            if (verdict.verdict === 'replace' && (guard.stage !== 'before_hook' || verdict.with.amount > 0)) {
                current = { ...current, amount: Math.max(0, verdict.with.amount) };
                continue;
            }
            this.stages.reject(current, guard);
            return { committed: false, intent: current, rejectedBy: guard.name, stage: guard.stage };
        }

        const computation = this.compute(current);
        const result = this.stages.commit(current, computation);
        return { committed: true, intent: current, computation, taken: result.taken, died: result.died };
    }

    private compute(intent: DamageIntent): DamageComputation {
        const modifiers: AppliedDamageModifier[] = [];
        let amount = intent.amount;
        for (const slot of this.modifiers) {
            const declared = slot.modifier(intent, amount);
            if (declared === undefined) continue;
            amount = Math.max(0, declared.operation === 'add' ? amount + declared.value : amount * declared.value);
            modifiers.push({ ...declared, name: slot.name, priority: slot.priority, amountAfter: amount });
        }
        return { guarded: intent.amount, modifiers, amount };
    }
}
