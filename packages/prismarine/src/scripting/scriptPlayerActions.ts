/**
 * A player's item use, block break and clicks as a level's scripts see them: the guards of
 * `world.beforeEvents.itemUse`, `playerBreakBlock`, `playerInteractWithBlock` and
 * `playerInteractWithEntity` on the server's `playerUseItem`, `playerBreakBlock`,
 * `playerInteractBlock` and `playerInteractEntity` events, and the after-events from
 * `playerItemUsed`, `playerBlockBroken`, `playerBlockInteracted` and `playerEntityInteracted`.
 * A plugin and a script cancel the same action, through the same event
 * ([ADR 0013](../../../../docs/adr/0013-vetoable-actions-are-staged.md)).
 */
import type { BlockFace } from '@jsprismarine/blocks';
import type {
    BlockBreakIntent,
    BlockInteractIntent,
    EntityInteractIntent,
    ItemUseIntent,
    ScriptDirection,
    ScriptItem,
    ScriptWorldEvent,
    VetoGuard
} from '@jsprismarine/script-host/host/world';

import type { BrokenBlock } from '../events/player/PlayerBreakBlockEvent';
import type PlayerInteractBlockEvent from '../events/player/PlayerInteractBlockEvent';
import type PlayerInteractEntityEvent from '../events/player/PlayerInteractEntityEvent';
import type { Item } from '../item/Item';
import type Server from '../Server';
import type { Level } from '../world/Level';
import type { World } from '../world/World';
import { scriptItemOf } from './levelScriptAccess';

/** The after-events of a player's actions. */
export type ScriptPlayerActionEvent = Extract<
    ScriptWorldEvent,
    { type: 'playerBreakBlock' | 'itemUse' | 'playerInteractWithBlock' | 'playerInteractWithEntity' }
>;

/** What a level's scripts reach of its players' item use and block breaking. */
export interface ScriptPlayerActions {
    /** @returns A function that removes the guard. */
    guardBlockBreak(guard: VetoGuard<BlockBreakIntent>): () => void;
    /** @returns A function that removes the guard. */
    guardItemUse(guard: VetoGuard<ItemUseIntent>): () => void;
    /** @returns A function that removes the guard. */
    guardBlockInteract(guard: VetoGuard<BlockInteractIntent>): () => void;
    /** @returns A function that removes the guard. */
    guardEntityInteract(guard: VetoGuard<EntityInteractIntent>): () => void;
    /**
     * Calls `listener` with each block a player of the level broke, each item one used and each
     * click on a block or an entity that did something.
     * @returns A function that stops it.
     */
    events(listener: (event: ScriptPlayerActionEvent) => void): () => void;
}

/** A stack as a script reads it, or undefined for an empty hand. */
const itemOf = (item: Item | null): ScriptItem | undefined => scriptItemOf(item) ?? undefined;

/** A block face as the Script API's `Direction` names it. */
const DIRECTIONS: Readonly<Record<BlockFace, ScriptDirection>> = {
    down: 'Down',
    up: 'Up',
    north: 'North',
    south: 'South',
    west: 'West',
    east: 'East'
};

/**
 * Builds the player actions of one level's scripts.
 * @param server - The server whose events carry the actions.
 * @param level - The level whose players the scripts see.
 */
export const levelPlayerActions = (server: Server, level: Level): ScriptPlayerActions => {
    const { events } = server.getKernel();
    const here = (world: World): boolean => world.getLevel() === level;
    const location = (world: World, { x, y, z }: BrokenBlock) => ({
        dimension: world.getDimension().bedrockName,
        x,
        y,
        z
    });
    const blockClick = (event: PlayerInteractBlockEvent): BlockInteractIntent => {
        const item = itemOf(event.getItem());
        const { x, y, z } = event.getFaceLocation();
        return {
            player: String(event.getPlayer()),
            block: location(event.getWorld(), event.getBlock()),
            face: DIRECTIONS[event.getFace()],
            faceLocation: { x, y, z },
            ...(item === undefined ? {} : { item })
        };
    };
    const entityClick = (event: PlayerInteractEntityEvent): EntityInteractIntent => {
        const item = itemOf(event.getItem());
        const target = event.getTarget();
        return {
            player: String(event.getPlayer()),
            target: { id: String(target.runtimeId), typeId: target.type },
            ...(item === undefined ? {} : { item })
        };
    };
    return {
        guardBlockInteract: (guard) =>
            events.on('playerInteractBlock', (event) => {
                if (!here(event.getWorld()) || event.isCanceled()) return;
                if (guard(blockClick(event)).veto) event.preventDefault();
            }),
        guardEntityInteract: (guard) =>
            events.on('playerInteractEntity', (event) => {
                if (!here(event.getWorld()) || event.isCanceled()) return;
                if (guard(entityClick(event)).veto) event.preventDefault();
            }),
        guardBlockBreak: (guard) =>
            events.on('playerBreakBlock', (event) => {
                const world = event.getWorld();
                if (!here(world) || event.isCanceled()) return;
                const item = itemOf(event.getItem());
                const verdict = guard({
                    player: String(event.getPlayer()),
                    block: location(world, event.getBlock()),
                    ...(item === undefined ? {} : { item })
                });
                if (verdict.veto) event.preventDefault();
            }),
        guardItemUse: (guard) =>
            events.on('playerUseItem', (event) => {
                const world = event.getWorld();
                const item = itemOf(event.getItem());
                if (!here(world) || event.isCanceled() || item === undefined) return;
                if (guard({ player: String(event.getPlayer()), item }).veto) event.preventDefault();
            }),
        events: (listener) => {
            const stops = [
                events.on('playerBlockBroken', (event) => {
                    const world = event.getWorld();
                    if (!here(world)) return;
                    const broken = event.getBlock();
                    const itemBefore = itemOf(event.getItemBefore());
                    const itemAfter = itemOf(event.getItemAfter());
                    listener({
                        type: 'playerBreakBlock',
                        player: String(event.getPlayer()),
                        block: location(world, broken),
                        brokenBlockPermutation: { typeId: broken.name, states: broken.states },
                        ...(itemBefore === undefined ? {} : { itemBefore }),
                        ...(itemAfter === undefined ? {} : { itemAfter })
                    });
                }),
                events.on('playerBlockInteracted', (event) => {
                    if (!here(event.getWorld())) return;
                    const itemAfter = itemOf(event.getItemAfter());
                    listener({
                        type: 'playerInteractWithBlock',
                        ...blockClick(event),
                        ...(itemAfter === undefined ? {} : { itemAfter })
                    });
                }),
                events.on('playerEntityInteracted', (event) => {
                    if (!here(event.getWorld())) return;
                    const itemAfter = itemOf(event.getItemAfter());
                    listener({
                        type: 'playerInteractWithEntity',
                        ...entityClick(event),
                        ...(itemAfter === undefined ? {} : { itemAfter })
                    });
                }),
                events.on('playerItemUsed', (event) => {
                    const item = itemOf(event.getItem());
                    if (!here(event.getWorld()) || item === undefined) return;
                    listener({ type: 'itemUse', player: String(event.getPlayer()), item });
                })
            ];
            return () => {
                for (const stop of stops) stop();
            };
        }
    };
};
