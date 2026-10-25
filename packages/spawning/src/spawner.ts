import type { EvaluateFilterOptions } from '@jsprismarine/entities';
import type { RandomSource } from '@jsprismarine/predicates';

import type { SpawnConditionContext } from './conditions';
import { SpawnDelays, evaluateSpawnCondition } from './conditions';
import type { SpawnConstants } from './constants';
import { SPAWN_CONSTANTS, poolCapFor } from './constants';
import type { EngineSpawnRule } from './engineRules';
import { VANILLA_ENGINE_SPAWN_RULES } from './engineRules';
import type { HerdRule, SpawnCondition, SpawnPermutation, SpawnRule } from './rules';
import type { SpawnPass, SpawnPosition, SpawnWorld } from './world';

/**
 * The spawn loop.
 *
 * Mojang's spawn cycle diagram names six steps, "check spawn conditions, find
 * valid spawn locations, check population caps, evaluate spawn weight, spawn
 * entity, and run spawn event", and publishes no number behind any of them.
 * This loop implements those six steps over the constants in
 * `src/tables/spawnConstants.json`, and every draw goes through an injected
 * {@link RandomSource}, so one seed reproduces one set of spawns.
 *
 * One cycle of one pool samples `chunksPerCycle` chunks around each player,
 * tries `positionsPerChunk` positions in each chunk for the surface pass and
 * the same number for the underground pass, and at each position draws one of
 * the conditions that passed, weighted by `minecraft:weight`.
 */

/** One entity the spawner asks the server to create. */
export interface SpawnRequest {
    /** The entity type, with any `<event>` suffix already split off. */
    readonly identifier: string;
    /** The event to run instead of `minecraft:entity_spawned`, when the rule names one. */
    readonly spawnEvent?: string;
    readonly position: SpawnPosition;
    /** The pool whose cap this spawn counts against. */
    readonly pool: string;
    /** The rule that produced the spawn, which is the identifier of its file. */
    readonly rule: string;
    readonly pass: SpawnPass;
}

/** How to build a {@link Spawner}. */
export interface SpawnerOptions {
    readonly rules: Iterable<SpawnRule>;
    readonly world: SpawnWorld;
    readonly random: RandomSource;
    readonly constants?: SpawnConstants;
    /** The `minecraft:delay_filter` cooldowns, so a caller can persist them across a restart. */
    readonly delays?: SpawnDelays;
    /**
     * The conditions Bedrock keeps in engine code, keyed by the entity each
     * one gates. Defaults to {@link VANILLA_ENGINE_SPAWN_RULES}; pass an empty
     * map to run the JSON conditions alone.
     */
    readonly engineRules?: ReadonlyMap<string, EngineSpawnRule>;
    /** Receives every biome filter test the evaluator could not answer. */
    readonly onUnanswered?: EvaluateFilterOptions['onUnanswered'];
}

/** One rule and the one of its conditions that passed at a position. */
interface Candidate {
    readonly rule: SpawnRule;
    readonly condition: SpawnCondition;
}

/** Splits `minecraft:pillager<minecraft:spawn_as_patrol_follower>` into its two halves. */
const splitSpawnType = (value: string): { readonly identifier: string; readonly event?: string } => {
    const match = /^(?<identifier>[^<]+)<(?<event>[^>]+)>$/.exec(value);
    if (match?.groups === undefined) return { identifier: value };
    return { identifier: match.groups.identifier!, event: match.groups.event! };
};

/** Draws an integer in the inclusive range, which is how every size and offset is picked. */
const between = (random: RandomSource, min: number, max: number): number =>
    max <= min ? min : min + random.nextInt(max - min + 1);

/**
 * Builds the permutation each herd member spawns as.
 *
 * `min_guaranteed` members take their permutation before the weighted draw
 * runs, which is what makes the pillager patrol's captain and the zombie
 * herd's one villager certain.
 */
const permutationsFor = (
    permutations: readonly SpawnPermutation[],
    size: number,
    random: RandomSource
): readonly (SpawnPermutation | undefined)[] => {
    const members: (SpawnPermutation | undefined)[] = [];
    for (const permutation of permutations) {
        for (let index = 0; index < permutation.minGuaranteed && members.length < size; index += 1)
            members.push(permutation);
    }

    const total = permutations.reduce((sum, permutation) => sum + Math.max(0, permutation.weight), 0);
    while (members.length < size) {
        if (total <= 0) {
            members.push(undefined);
            continue;
        }
        let roll = random.nextFloat() * total;
        let chosen: SpawnPermutation | undefined;
        for (const permutation of permutations) {
            roll -= Math.max(0, permutation.weight);
            if (roll < 0) {
                chosen = permutation;
                break;
            }
        }
        members.push(chosen ?? permutations[permutations.length - 1]);
    }

    return members;
};

/**
 * The event one herd member runs.
 *
 * `initial_event` wins for the first `initial_event_count` members, `event`
 * takes every member past `event_skip_count`, and a permutation's `<event>`
 * suffix or the condition's `minecraft:spawn_event` fills in for the rest.
 */
const eventForMember = (
    index: number,
    herd: HerdRule | undefined,
    permutationEvent: string | undefined,
    condition: SpawnCondition
): string | undefined => {
    if (herd?.initialEvent !== undefined && index < herd.initialEventCount) return herd.initialEvent;
    if (herd?.event !== undefined && index >= herd.eventSkipCount) return herd.event;
    return permutationEvent ?? condition.spawnEvent;
};

/** Runs the spawn loop for one world. */
export class Spawner {
    private readonly rulesByPool = new Map<string, SpawnRule[]>();
    private readonly world: SpawnWorld;
    private readonly random: RandomSource;
    private readonly constants: SpawnConstants;
    private readonly delays: SpawnDelays;
    private readonly engineRules: ReadonlyMap<string, EngineSpawnRule>;
    private readonly onUnanswered: EvaluateFilterOptions['onUnanswered'] | undefined;

    public constructor(options: SpawnerOptions) {
        this.world = options.world;
        this.random = options.random;
        this.constants = options.constants ?? SPAWN_CONSTANTS;
        this.delays = options.delays ?? new SpawnDelays();
        this.engineRules = options.engineRules ?? VANILLA_ENGINE_SPAWN_RULES;
        this.onUnanswered = options.onUnanswered;

        for (const rule of options.rules) {
            const pool = rule.populationControl;
            if (pool === undefined) continue;
            const existing = this.rulesByPool.get(pool);
            if (existing === undefined) this.rulesByPool.set(pool, [rule]);
            else existing.push(rule);
        }
    }

    /** The pools the loaded rules name, which is what {@link tick} cycles. */
    public get pools(): readonly string[] {
        return [...this.rulesByPool.keys()];
    }

    /**
     * Runs every pool whose cadence falls on this tick.
     *
     * @returns Every entity to create, in the order the cycles produced them.
     */
    public tick(tick: number): readonly SpawnRequest[] {
        const requests: SpawnRequest[] = [];
        for (const pool of this.rulesByPool.keys()) {
            const cadence = this.constants.pools[pool]?.cycleTicks;
            if (cadence === undefined || cadence <= 0 || tick % cadence !== 0) continue;
            requests.push(...this.cycle(pool, tick));
        }
        return requests;
    }

    /**
     * Runs one cycle of one pool, whatever the cadence says.
     *
     * @returns Every entity to create, never more than the pool's remaining cap.
     */
    public cycle(pool: string, tick: number): readonly SpawnRequest[] {
        const rules = this.rulesByPool.get(pool);
        if (rules === undefined || rules.length === 0) return [];

        const players = this.world.players();
        if (players.length === 0) return [];

        const cap = poolCapFor(pool, players.length, this.constants);
        let remaining = cap === undefined ? Number.POSITIVE_INFINITY : cap - this.world.poolCount(pool);
        if (remaining <= 0) return [];

        const requests: SpawnRequest[] = [];
        const { spawnRadiusChunks, chunksPerCycle, positionsPerChunk } = this.constants;

        for (const player of players) {
            const playerChunkX = Math.floor(player.position.x / 16);
            const playerChunkZ = Math.floor(player.position.z / 16);

            for (let sample = 0; sample < chunksPerCycle && remaining > 0; sample += 1) {
                const chunkX = playerChunkX + between(this.random, -spawnRadiusChunks, spawnRadiusChunks);
                const chunkZ = playerChunkZ + between(this.random, -spawnRadiusChunks, spawnRadiusChunks);

                for (let attempt = 0; attempt < positionsPerChunk && remaining > 0; attempt += 1) {
                    for (const pass of ['surface', 'underground'] as const) {
                        if (remaining <= 0) break;
                        const position = this.positionIn(chunkX, chunkZ, pass);
                        if (position === undefined) continue;
                        const spawned = this.attemptAt(pool, rules, position, pass, tick, remaining);
                        remaining -= spawned.length;
                        requests.push(...spawned);
                    }
                }
            }
        }

        return requests;
    }

    /**
     * Draws one position inside a chunk for one pass.
     *
     * @returns The position, or undefined when the column is unloaded or the draw landed
     *   somewhere no entity fits.
     */
    private positionIn(chunkX: number, chunkZ: number, pass: SpawnPass): SpawnPosition | undefined {
        const x = chunkX * 16 + this.random.nextInt(16);
        const z = chunkZ * 16 + this.random.nextInt(16);
        const top = this.world.surfaceY(x, z);
        if (top === undefined) return undefined;
        if (pass === 'surface') return { x, y: top, z };

        const floor = this.world.minY();
        if (top - 1 < floor) return undefined;

        // The draw is uniform over the column, so in a world with few caves most of it is
        // inside rock. One attempt, one draw, the way Java's `NaturalSpawner` rejects a
        // position rather than searching for a better one: a spawn inside a block is a mob
        // that can path nowhere, never despawns and fills the pool so nothing else can spawn.
        const at = { x, y: between(this.random, floor, top - 1), z };
        return this.fits(at) ? at : undefined;
    }

    /** Whether an entity fits at a position: its own block and the one over its head are free. */
    private fits(at: SpawnPosition): boolean {
        return !this.world.solid(at) && !this.world.solid({ ...at, y: at.y + 1 });
    }

    /**
     * Runs one attempt: collect the rules that pass here, draw one, and build
     * its herd.
     *
     * A rule with an engine condition is asked that first, because a condition
     * Bedrock keeps in code is a condition the file was never able to state.
     * `minecraft:slime` is the rule this matters to: its file names no
     * brightness and no height, so without the engine condition it is the only
     * monster that passes in daylight and it fills the pool on its own.
     */
    private attemptAt(
        pool: string,
        rules: readonly SpawnRule[],
        position: SpawnPosition,
        pass: SpawnPass,
        tick: number,
        remaining: number
    ): readonly SpawnRequest[] {
        const candidates: Candidate[] = [];
        let totalWeight = 0;

        for (const rule of rules) {
            const engineRule = this.engineRules.get(rule.identifier);
            if (engineRule !== undefined && !engineRule(position, { world: this.world, random: this.random })) continue;

            for (const condition of rule.conditions) {
                if (!evaluateSpawnCondition(condition, position, this.contextFor(rule, tick)).passed) continue;
                candidates.push({ rule, condition });
                totalWeight += Math.max(0, condition.weight.default);
            }
        }

        if (candidates.length === 0 || totalWeight <= 0) return [];

        let roll = this.random.nextFloat() * totalWeight;
        let chosen = candidates[candidates.length - 1]!;
        for (const candidate of candidates) {
            roll -= Math.max(0, candidate.condition.weight.default);
            if (roll < 0) {
                chosen = candidate;
                break;
            }
        }

        // `rarity` is documented by name only. This project reads it as a
        // one-in-N roll on top of the weight, which is the only reading that
        // makes a rarity of 2 or 3 rarer rather than more common.
        const { rarity } = chosen.condition.weight;
        if (rarity > 0 && this.random.nextFloat() * rarity >= 1) return [];

        if (chosen.condition.delay !== undefined) this.delays.scheduleFrom(chosen.condition.delay, tick, this.random);

        return this.herdAt(pool, chosen, position, pass, remaining);
    }

    /** Builds one herd around an anchor position. */
    private herdAt(
        pool: string,
        candidate: Candidate,
        anchor: SpawnPosition,
        pass: SpawnPass,
        remaining: number
    ): readonly SpawnRequest[] {
        const { condition, rule } = candidate;
        const herd =
            condition.herd.length === 0 ? undefined : condition.herd[this.random.nextInt(condition.herd.length)];
        const drawn = herd === undefined ? 1 : between(this.random, herd.minSize, herd.maxSize);
        const size = Math.max(0, Math.min(drawn, remaining));
        if (size === 0) return [];

        const permutations =
            condition.permutations === undefined
                ? undefined
                : permutationsFor(condition.permutations, size, this.random);

        const requests: SpawnRequest[] = [];
        for (let index = 0; index < size; index += 1) {
            const permutation = permutations?.[index];
            const swapped = permutation?.entityType === undefined ? undefined : splitSpawnType(permutation.entityType);
            const position = index === 0 ? anchor : this.herdMemberPosition(anchor, pass);
            const event = eventForMember(index, herd, swapped?.event, condition);

            const request: { -readonly [Key in keyof SpawnRequest]: SpawnRequest[Key] } = {
                identifier: swapped?.identifier ?? rule.identifier,
                position,
                pool,
                rule: rule.identifier,
                pass
            };
            if (event !== undefined) request.spawnEvent = event;
            requests.push(request);
        }

        return requests;
    }

    /** Places one herd member around the anchor, following the terrain on the surface pass. */
    private herdMemberPosition(anchor: SpawnPosition, pass: SpawnPass): SpawnPosition {
        const radius = this.constants.herdRadius;
        const x = anchor.x + between(this.random, -radius, radius);
        const z = anchor.z + between(this.random, -radius, radius);
        if (pass !== 'surface') return { x, y: anchor.y, z };
        return { x, y: this.world.surfaceY(x, z) ?? anchor.y, z };
    }

    private contextFor(rule: SpawnRule, tick: number): SpawnConditionContext {
        const context: { -readonly [Key in keyof SpawnConditionContext]: SpawnConditionContext[Key] } = {
            world: this.world,
            identifier: rule.identifier,
            random: this.random,
            tick,
            constants: this.constants,
            delays: this.delays
        };
        if (this.onUnanswered !== undefined) context.onUnanswered = this.onUnanswered;
        return context;
    }
}
