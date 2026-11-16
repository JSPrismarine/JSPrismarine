import type { EntityPosition } from '@jsprismarine/entities';
import { EntityRuntime } from '@jsprismarine/prismarine/entity/data/EntityRuntime';
import { TestEntityWorld } from '@jsprismarine/prismarine/entity/data/testing';

import { serverContent } from '../serverStack.ts';

/**
 * A runtime of its own for the scenarios that stand one entity somewhere and watch what the
 * server does to it: the real content and the real entity runtime, in a flat world under an open
 * sky at dawn. It is apart from the shared stack, so a mob that burns here burns no other
 * theme's subject, and nothing another theme placed stands in its way.
 *
 * The content's goals are wired to the shared stack, so an entity here runs no goals and stays
 * where it is put. What these scenarios watch, breath, sunlight, feeding and the engine
 * entities' own updates, runs in the runtime's entity pass and the components, not in goals.
 */
export interface Stage {
    readonly runtime: EntityRuntime;
    readonly world: TestEntityWorld;
}

/** An entity the runtime spawned, as its `spawn` hands it back. */
export type StagedEntity = NonNullable<ReturnType<EntityRuntime['spawn']>>;

let built: Stage | undefined;

/** The stage, built on first use. */
export const stage = (): Stage => {
    if (built !== undefined) return built;
    const world = new TestEntityWorld({ skyLight: true });
    const runtime = new EntityRuntime({
        content: serverContent,
        world: world.world,
        host: world.host,
        report: () => undefined
    });
    built = { runtime, world };
    return built;
};

/** The id the scenarios give a player that feeds or owns a mob; no entity in the stage has it. */
export const STAGE_PLAYER_ID = 1_000_000;

/** The next stage tick, so every scenario's ticks follow the last ones. */
let clock = 0;

/** Runs the stage's entity pass once. */
export const tickStage = (): void => {
    clock += 1;
    stage().world.advance();
    stage().runtime.tick(clock);
};

/**
 * Spawns an entity on the stage, as an adult, and hands it to `use`, removing it afterwards.
 *
 * @returns What `use` returned, or a sentence saying the type would not spawn.
 */
export const withEntity = <Result>(
    identifier: string,
    at: EntityPosition,
    use: (entity: StagedEntity) => Result
): Result | string => {
    const { runtime } = stage();
    const entity = runtime.spawn(identifier, at);
    if (entity === undefined) return `the server would not spawn ${identifier}`;
    try {
        if (entity.instance.hasComponent('minecraft:is_baby')) {
            entity.instance.fire('minecraft:ageable_grow_up');
            entity.instance.applyQueuedEvents();
        }
        return use(entity);
    } finally {
        runtime.remove(entity.id, 'parity scenario complete');
    }
};
