/**
 * What the three AI projections read back out of the runtime.
 *
 * `EntityRuntime` implements this; `goalWorld.ts` and `brainWorld.ts` take it.
 * It exists so the projections can be written and tested without the runtime,
 * and so the dependency runs one way: the runtime knows the projections, the
 * projections know only this.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import type { BlockQuery, GoalBlock, GoalItem, GoalMob, NavigationView } from '@jsprismarine/entity-goals';

import type { ServerContent } from '../../content/ServerContent';
import type { DataEntity, MobBody } from './DataEntity';
import type { EntityHostFacts, EntityWorldFacts } from './host';

/** How an entity came to exist, which decides the spawn event it runs. */
export interface SpawnOptions {
    /** The event to run instead of the built-in one for the cause. */
    readonly event?: string;
    /** `born` for breeding, `transformed` for a transformation, `primed` for TNT. */
    readonly cause?: 'spawned' | 'born' | 'transformed' | 'primed';
    /** The pool whose cap the spawn counts against, when a spawn rule produced it. */
    readonly pool?: string;
}

/** The runtime as the AI projections read it. */
export interface EntityScene {
    readonly world: EntityWorldFacts;
    readonly host: EntityHostFacts;
    /** The built content, read back lazily because the adapter exists before the content does. */
    content(): ServerContent;
    /** Every live entity, in spawn order. */
    all(): readonly DataEntity[];
    /** Every live entity within a radius of a position, unsorted. */
    near(center: EntityPosition, radius: number): readonly DataEntity[];
    byId(id: number): DataEntity | undefined;
    spawn(identifier: string, at: EntityPosition, options?: SpawnOptions): DataEntity | undefined;
    remove(id: number, reason: string): void;
    /** The blocks as the path finder reads them. */
    navigation(): NavigationView;
    /** Item stacks lying within a radius, nearest first. */
    items(center: EntityPosition, radius: number): readonly GoalItem[];
    /** Blocks matching a query around a position, nearest first. */
    blocks(center: EntityPosition, query: BlockQuery): readonly GoalBlock[];
    /** Deals one entity's melee damage to another. */
    attack(attacker: MobBody, target: GoalMob): void;
    /** Knocks a mob away from the entity. */
    knockback(source: MobBody, target: GoalMob, horizontal: number, vertical: number): void;
    /** Rolls a loot table and drops what it produced. */
    dropLoot(table: string, at: EntityPosition): void;
    /** Fires an entity event on a named subject, which `trigger` with a target does. */
    trigger(source: MobBody, event: string, target: string): void;
    /** Records what the runtime met and could not carry out. */
    report(message: string): void;
}
