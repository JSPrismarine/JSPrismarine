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
    /**
     * Which way the entity faces, in degrees, for a caller that knows.
     *
     * Applied before the spawn event runs, so the body a client is first sent
     * already faces the right way. A spawn rule names no rotation and gets 0,
     * which is what every mob the spawner places has always had.
     */
    readonly yaw?: number;
    readonly pitch?: number;
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
    /**
     * One entity or player, by runtime id, as a goal sees it.
     *
     * The two live in different indexes, so this is the one place that looks
     * in both: a damager, an owner or a rider is a runtime id and the goal
     * does not care which index answered.
     */
    mobById(id: number): GoalMob | undefined;
    /** Item stacks lying within a radius, nearest first. */
    items(center: EntityPosition, radius: number): readonly GoalItem[];
    /** Blocks matching a query around a position, nearest first. */
    blocks(center: EntityPosition, query: BlockQuery): readonly GoalBlock[];
    /** The nearest point of interest of a kind, for the eleven goals that ask. */
    poi(kind: string, center: EntityPosition, radius: number): EntityPosition | undefined;
    /** Deals one entity's melee damage to another. */
    attack(attacker: MobBody, target: GoalMob): void;
    /** Fires one entity's projectile at a mob. */
    shoot(shooter: MobBody, target: GoalMob, projectile: string | undefined): void;
    /** Knocks a mob away from the entity. */
    knockback(source: MobBody, target: GoalMob, horizontal: number, vertical: number): void;
    /** Detonates an entity, which is what its `minecraft:explode` component declares. */
    explode(source: MobBody): void;
    /** Puts an entity on a mob as a rider, if the mob has a seat free for it. */
    mount(rider: MobBody, vehicle: GoalMob): void;
    /** Takes an entity off whatever it rides. */
    dismount(rider: MobBody): void;
    /** What an entity rides, or undefined when it rides nothing. */
    vehicleOf(rider: MobBody): GoalMob | undefined;
    /** Who rides an entity, in the order they got on. */
    ridersOf(vehicle: MobBody): readonly GoalMob[];
    /** Takes an item stack lying in the world into an entity's inventory. */
    pickUp(taker: MobBody, item: GoalItem): void;
    /** Moves one item from an entity's inventory to another entity. */
    giveItem(giver: MobBody, taker: GoalMob, identifier: string): void;
    /** Breaks a block and drops what its loot table rolls. */
    breakBlock(at: EntityPosition): void;
    /** Opens one entity's trade screen for a player. */
    openTrade(trader: MobBody, player: GoalMob): void;
    /** Whether two entities may breed with each other now. */
    canBreedWith(parent: MobBody, mate: GoalMob): boolean;
    /** Produces the offspring of a successful breeding. */
    breedWith(parent: MobBody, mate: GoalMob): void;
    /** Rolls a loot table and drops what it produced. */
    dropLoot(table: string, at: EntityPosition): void;
    /** Fires an entity event on a named subject, which `trigger` with a target does. */
    trigger(source: MobBody, event: string, target: string): void;
    /** Records what the runtime met and could not carry out. */
    report(message: string): void;
}
