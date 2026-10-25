/**
 * Who has hurt one entity, and how much each of them has dealt.
 *
 * Three goals read it and each reads it differently.
 * `minecraft:behavior.hurt_by_target` and `minecraft:behavior.panic` want the
 * most recent entry, which is Java's `lastHurtByMob`.
 * `minecraft:behavior.wither_target_highest_damage` wants the biggest running
 * total, which is Java's `WitherBoss` damage tally. One ordered list of
 * per-source totals answers all three, so that is what this keeps.
 */

/** One source's share of the damage an entity has taken. */
export interface DamageRecord {
    /** The runtime id of whatever dealt it, or undefined when nothing did. */
    readonly sourceId: number | undefined;
    /** The damage cause, such as `entity_attack`. */
    readonly cause: string;
    /** How much this source has dealt in total. */
    readonly total: number;
}

/** The damage one entity has taken, oldest source first. */
export class DamageLog {
    /** One entry per source, keyed so a second hit from the same source adds to its total. */
    private readonly totals = new Map<string, DamageRecord>();

    /** Every source that has hurt the entity, the most recent one last. */
    public records(): readonly DamageRecord[] {
        return [...this.totals.values()];
    }

    /** The most recent source, which is Java's `lastHurtByMob`. */
    public last(): DamageRecord | undefined {
        return this.records().at(-1);
    }

    /**
     * Adds one hit.
     *
     * Re-inserting the entry moves it to the end of the map, so the iteration
     * order is oldest source first and the last entry is the most recent hit.
     */
    public record(sourceId: number | undefined, cause: string, amount: number): void {
        const key = `${sourceId ?? 'none'}:${cause}`;
        const total = (this.totals.get(key)?.total ?? 0) + Math.max(0, amount);
        this.totals.delete(key);
        this.totals.set(key, { sourceId, cause, total });
    }

    /** Forgets everything, which is what healing to full does in Java. */
    public clear(): void {
        this.totals.clear();
    }
}
