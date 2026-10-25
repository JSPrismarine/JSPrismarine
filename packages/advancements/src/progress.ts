import type { ParsedAdvancement } from './model';

/**
 * Whether the conjunctive normal form in `requirements` is satisfied: every
 * group needs at least one completed criterion. The single-criterion default
 * is one group of one name, so it completes with that criterion.
 *
 * @param isDone - Answers whether one criterion name has been completed.
 */
export const requirementsMet = (
    requirements: readonly (readonly string[])[],
    isDone: (criterion: string) => boolean
): boolean => requirements.every((group) => group.some(isDone));

/** How many of the `requirements` groups are satisfied, which is what a progress bar shows. */
export const requirementsCount = (
    requirements: readonly (readonly string[])[],
    isDone: (criterion: string) => boolean
): number => requirements.reduce((total, group) => (group.some(isDone) ? total + 1 : total), 0);

/** One advancement's stored progress, as a server persists it. */
export interface AdvancementProgressJson {
    /** Criterion name to the ISO-8601 instant it was completed at. */
    readonly criteria: Readonly<Record<string, string>>;
    readonly done: boolean;
}

/** Every advancement a player has touched, keyed by namespaced advancement id. */
export type PlayerProgressJson = Readonly<Record<string, AdvancementProgressJson>>;

/** How far a player is through one advancement. */
export interface AdvancementProgressView {
    /** Completed criterion names with the instant each was completed at. */
    readonly criteria: ReadonlyMap<string, string>;
    readonly done: boolean;
    /** Satisfied requirement groups out of the advancement's total. */
    readonly completed: number;
    readonly total: number;
}

/**
 * One player's advancement progress.
 *
 * The store holds completed criteria and their instants, and derives
 * completion from the advancement's `requirements` every time it is asked, so
 * reloading a datapack that changes `requirements` re-derives completion
 * instead of trusting a stale flag. It owns no clock: a caller that wants
 * reproducible instants passes `at` to {@link grant}.
 */
export class PlayerAdvancements {
    private readonly completed = new Map<string, Map<string, string>>();

    /**
     * Restores a store from {@link toJSON} output. The `done` flags are
     * ignored and recomputed, because only the advancement knows its
     * requirements.
     */
    public static fromJSON(json: PlayerProgressJson): PlayerAdvancements {
        const progress = new PlayerAdvancements();
        for (const [id, entry] of Object.entries(json)) {
            const criteria = new Map<string, string>();
            for (const [name, obtained] of Object.entries(entry.criteria)) criteria.set(name, obtained);
            if (criteria.size > 0) progress.completed.set(id, criteria);
        }
        return progress;
    }

    /** Whether one criterion of one advancement is already completed. */
    public hasCriterion(advancement: string, criterion: string): boolean {
        return this.completed.get(advancement)?.has(criterion) ?? false;
    }

    /**
     * Marks one criterion completed.
     *
     * @param at - ISO-8601 instant to record; defaults to now.
     * @returns Whether this call changed anything, which is false when the
     * criterion was already completed.
     */
    public grant(advancement: string, criterion: string, at: string = new Date().toISOString()): boolean {
        const criteria = this.completed.get(advancement) ?? new Map<string, string>();
        if (criteria.has(criterion)) return false;
        criteria.set(criterion, at);
        this.completed.set(advancement, criteria);
        return true;
    }

    /**
     * Clears one criterion.
     *
     * @returns Whether the criterion had been completed.
     */
    public revokeCriterion(advancement: string, criterion: string): boolean {
        const criteria = this.completed.get(advancement);
        if (!criteria?.delete(criterion)) return false;
        if (criteria.size === 0) this.completed.delete(advancement);
        return true;
    }

    /**
     * Clears every criterion of one advancement.
     *
     * @returns Whether the player had any progress on it.
     */
    public revoke(advancement: string): boolean {
        return this.completed.delete(advancement);
    }

    /** Whether the player has met the advancement's requirements. */
    public isDone(advancement: ParsedAdvancement): boolean {
        const criteria = this.completed.get(advancement.id);
        if (!criteria) return false;
        return requirementsMet(advancement.requirements, (name) => criteria.has(name));
    }

    /** The player's standing on one advancement, including the group count a progress bar shows. */
    public progressOf(advancement: ParsedAdvancement): AdvancementProgressView {
        const criteria = this.completed.get(advancement.id) ?? new Map<string, string>();
        const isDone = (name: string): boolean => criteria.has(name);
        return {
            criteria,
            done: requirementsMet(advancement.requirements, isDone),
            completed: requirementsCount(advancement.requirements, isDone),
            total: advancement.requirements.length
        };
    }

    /**
     * The persistable form.
     *
     * @param advancements - Looks up an advancement by id so each entry can
     * carry the `done` flag a client needs. Without it every entry reports
     * `done: false`.
     */
    public toJSON(advancements?: (id: string) => ParsedAdvancement | undefined): PlayerProgressJson {
        const json: Record<string, AdvancementProgressJson> = {};
        for (const [id, criteria] of this.completed) {
            const advancement = advancements?.(id);
            json[id] = {
                criteria: Object.fromEntries(criteria),
                done: advancement ? this.isDone(advancement) : false
            };
        }
        return json;
    }
}
