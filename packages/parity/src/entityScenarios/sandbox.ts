import type { EntityPosition } from '@jsprismarine/entities';
import type { DamageCommit } from '@jsprismarine/prismarine/entity/data/host';
import { FLOOR_Y } from '@jsprismarine/prismarine/entity/data/testing';

import type { RealStack } from '../serverStack.ts';
import { realStack } from '../serverStack.ts';

/**
 * A corner of the shared real stack's world where the damage scenarios put one entity at a time:
 * a fluid pool walled in glass, which no silverfish can hide in, or open ground, far from the other themes' fixtures.
 */

/** A data-driven entity the runtime holds, as a damage commit names its target. */
type DataEntity = DamageCommit['target'];

/** The block the sandbox stands an entity on, on the stone floor. */
const ORIGIN: EntityPosition = { x: 48_000, y: FLOOR_Y + 1, z: 48_000 };

/** Half the pool's width, and its depth, which a ghast's four-block box fits inside. */
const POOL_HALF = 3;
const POOL_DEPTH = 6;

/** What a sandbox run fills the space around the entity with: `air`, or a block such as `minecraft:water`. */
export type SandboxMedium = string;

/** One commit the runtime made against the sandboxed entity, with the tick it landed on. */
export interface SandboxHit {
    readonly tick: number;
    readonly cause: string;
    readonly amount: number;
    readonly taken: number;
    readonly died: boolean;
}

/** How a sandbox run places its entity. */
export interface SandboxOptions {
    /** How many blocks above the floor the entity spawns, for a projectile that should fly before it lands. */
    readonly lift?: number;
    /** The stack to run in, such as one whose random varies; the shared real stack by default. */
    readonly stack?: RealStack;
}

/** Where a sandbox run's entity spawns, for a scenario that puts something beside it. */
export const SANDBOX_ORIGIN: EntityPosition = { x: ORIGIN.x + 0.5, y: ORIGIN.y, z: ORIGIN.z + 0.5 };

/** What a sandbox run gives the scenario to read. */
export interface SandboxRun {
    readonly stack: RealStack;
    readonly entity: DataEntity;
    /** Runs `ticks` world ticks and returns the commits against the entity they made. */
    readonly tick: (ticks: number, each?: (tick: number) => void) => readonly SandboxHit[];
}

/**
 * Fills the pool's inside with a medium and floors, walls and roofs it in glass, or puts the
 * stone floor and the air back.
 */
const shapePool = (stack: RealStack, medium: SandboxMedium | undefined): void => {
    for (let dx = -POOL_HALF - 1; dx <= POOL_HALF + 1; dx += 1)
        for (let dz = -POOL_HALF - 1; dz <= POOL_HALF + 1; dz += 1)
            for (let dy = -1; dy <= POOL_DEPTH; dy += 1) {
                const at = { x: ORIGIN.x + dx, y: ORIGIN.y + dy, z: ORIGIN.z + dz };
                if (medium === undefined) {
                    stack.world.setBlock(at, dy < 0 ? 'minecraft:stone' : 'minecraft:air');
                    continue;
                }
                const shell = dy < 0 || Math.abs(dx) > POOL_HALF || Math.abs(dz) > POOL_HALF || dy === POOL_DEPTH;
                // Open ground keeps the glass floor, so nothing stands on stone it could burrow into.
                if (medium === 'air') stack.world.setBlock(at, dy < 0 ? 'minecraft:glass' : 'minecraft:air');
                else stack.world.setBlock(at, shell ? 'minecraft:glass' : medium);
            }
};

const hitOf = (commit: DamageCommit, tick: number): SandboxHit => ({
    tick,
    cause: commit.intent.cause,
    amount: commit.intent.amount,
    taken: commit.taken,
    died: commit.died
});

/**
 * Spawns one entity in the sandbox, in a pool of `medium`, runs a scenario against it and takes
 * the entity and the pool out again whatever the scenario does.
 * @returns What the scenario returned, or a sentence saying the server would not spawn it.
 */
export const inSandbox = <Result>(
    bedrock: string,
    medium: SandboxMedium,
    run: (sandbox: SandboxRun) => Result,
    options: SandboxOptions = {}
): Result | string => {
    const stack = options.stack ?? realStack();
    const players = stack.world.players;
    stack.world.players = [];
    shapePool(stack, medium);
    const entity = stack.runtime.spawn(bedrock, {
        x: ORIGIN.x + 0.5,
        y: ORIGIN.y + (options.lift ?? 0),
        z: ORIGIN.z + 0.5
    });
    try {
        if (entity === undefined) return `the server does not spawn ${bedrock}`;
        return run({
            stack,
            entity,
            tick: (ticks, each) => {
                const hits: SandboxHit[] = [];
                for (let tick = 1; tick <= ticks; tick += 1) {
                    const before = stack.world.commits.length;
                    stack.world.advance();
                    stack.runtime.tick(stack.world.world.level.gameTime());
                    for (const commit of stack.world.commits.slice(before))
                        if (commit.target.id === entity.id) hits.push(hitOf(commit, tick));
                    each?.(tick);
                }
                return hits;
            }
        });
    } finally {
        // Everything the run left in the sandbox goes, the entity and whatever it spawned or shot.
        const reach = POOL_HALF + 8;
        for (const left of stack.runtime.inBox(
            { x: ORIGIN.x - reach, y: ORIGIN.y - reach, z: ORIGIN.z - reach },
            { x: ORIGIN.x + reach, y: ORIGIN.y + POOL_DEPTH + reach, z: ORIGIN.z + reach }
        ))
            if (stack.runtime.byId(left.id) !== undefined) stack.runtime.remove(left.id, 'parity sandbox run complete');
        if (entity !== undefined && stack.runtime.byId(entity.id) !== undefined)
            stack.runtime.remove(entity.id, 'parity sandbox run complete');
        shapePool(stack, undefined);
        stack.world.players = players;
    }
};
