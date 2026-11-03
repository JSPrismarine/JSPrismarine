/** Coalesces structure-start requests before a shard worker builds their layouts. */
import type { StructureStartCandidate, StructureStartPlanEntry } from './javaStructureStarts';
import { freezeStructurePlanData } from './javaStructureWorld';

const CACHE_LIMIT = 8192;

interface PendingPlan {
    readonly promise: Promise<StructureStartPlanEntry>;
    readonly resolve: (plan: StructureStartPlanEntry) => void;
    readonly reject: (error: unknown) => void;
    settled: boolean;
}

const keyOf = (candidate: StructureStartCandidate): string =>
    `${candidate.set}@${candidate.chunkX},${candidate.chunkZ}`;

/**
 * Coalesces overlapping chunk-task requests for the same candidate layout.
 *
 * The coordinator stores promises only. A stable shard owns each candidate build, and its plain
 * plan is copied to whichever chunk worker needs it. Inserting pending promises before dispatch
 * keeps simultaneous chunk requests from racing into duplicate builds.
 */
export class StructureStartPlanBroker {
    private readonly plans = new Map<string, PendingPlan>();

    /**
     * Returns plans for every candidate, loading each cache miss once per owner shard.
     *
     * @param candidates - Unique or overlapping candidate starts requested by a chunk task.
     * @param ownerOf - Assigns a candidate to the worker that retains its source cache.
     * @param load - Builds a batch of previously unseen candidates on that worker.
     * @returns Plans in the first-occurrence order of the input candidates.
     */
    public async plansFor(
        candidates: readonly StructureStartCandidate[],
        ownerOf: (candidate: StructureStartCandidate) => number,
        load: (
            owner: number,
            candidates: readonly StructureStartCandidate[]
        ) => Promise<readonly StructureStartPlanEntry[]>
    ): Promise<readonly StructureStartPlanEntry[]> {
        const unique = new Map<string, StructureStartCandidate>();
        for (const candidate of candidates) unique.set(keyOf(candidate), candidate);

        const waiters = new Map<string, PendingPlan>();
        const missingByOwner = new Map<number, Array<{ key: string; candidate: StructureStartCandidate }>>();
        for (const [key, candidate] of unique) {
            let pending = this.plans.get(key);
            if (pending === undefined) {
                let resolve!: (plan: StructureStartPlanEntry) => void;
                let reject!: (error: unknown) => void;
                const promise = new Promise<StructureStartPlanEntry>((accept, fail) => {
                    resolve = accept;
                    reject = fail;
                });
                pending = { promise, resolve, reject, settled: false };
                this.plans.set(key, pending);
                const owner = ownerOf(candidate);
                const group = missingByOwner.get(owner);
                if (group === undefined) missingByOwner.set(owner, [{ key, candidate }]);
                else group.push({ key, candidate });
            }
            waiters.set(key, pending);
        }

        const loads = [...missingByOwner].map(async ([owner, group]) => {
            try {
                const loaded = await load(
                    owner,
                    group.map(({ candidate }) => candidate)
                );
                for (const plan of loaded) freezeStructurePlanData(plan);
                const byKey = new Map(loaded.map((plan) => [keyOf(plan), plan]));
                for (const { key, candidate } of group) {
                    const plan = byKey.get(key);
                    if (plan === undefined) {
                        throw new Error(`The structure-start owner omitted ${keyOf(candidate)}.`);
                    }
                }
                for (const { key } of group) {
                    const pending = this.plans.get(key);
                    const plan = byKey.get(key);
                    if (pending === undefined || plan === undefined) continue;
                    pending.settled = true;
                    pending.resolve(plan);
                }
            } catch (error) {
                for (const { key } of group) {
                    const pending = this.plans.get(key);
                    if (pending === undefined) continue;
                    this.plans.delete(key);
                    pending.settled = true;
                    pending.reject(error);
                }
                throw error;
            }
        });

        this.trimCache();
        const pendingPlans = [...waiters.values()].map(({ promise }) => promise);
        await Promise.all([...loads, ...pendingPlans]);
        this.trimCache();
        return Promise.all(
            [...unique.keys()].map((key) => {
                const pending = waiters.get(key);
                if (pending === undefined) throw new Error(`The structure-start request lost ${key}.`);
                return pending.promise;
            })
        );
    }

    private trimCache(): void {
        if (this.plans.size <= CACHE_LIMIT) return;

        for (const [key, pending] of this.plans) {
            if (pending.settled) this.plans.delete(key);
            if (this.plans.size <= CACHE_LIMIT) return;
        }
    }
}

/**
 * Stable owner assignment for a start key, independent of task order and region routing.
 * @param candidate - The candidate structure start to assign.
 * @param shards - Number of worker shards in the pool.
 * @returns The zero-based owner shard index.
 */
export const structureStartOwnerOf = (candidate: StructureStartCandidate, shards: number): number => {
    let hash = 0x811c9dc5;
    const key = keyOf(candidate);
    for (let index = 0; index < key.length; index++) {
        hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
    }
    return (hash >>> 0) % Math.max(1, shards);
};
