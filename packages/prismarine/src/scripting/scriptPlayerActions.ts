/**
 * A player's item use and block break as a level's scripts see them: the guards of
 * `world.beforeEvents.itemUse` and `playerBreakBlock` on the server's `playerUseItem` and
 * `playerBreakBlock` events, and the after-events from `playerItemUsed` and `playerBlockBroken`.
 * A plugin and a script cancel the same action, through the same event
 * ([ADR 0013](../../../../docs/adr/0013-vetoable-actions-are-staged.md)).
 */
import type {
    BlockBreakIntent,
    ItemUseIntent,
    ScriptItem,
    ScriptWorldEvent,
    VetoGuard
} from '@jsprismarine/script-host/host/world';

import type { BrokenBlock } from '../events/player/PlayerBreakBlockEvent';
import type { Item } from '../item/Item';
import type Server from '../Server';
import type { Level } from '../world/Level';
import type { World } from '../world/World';
import { scriptItemOf } from './levelScriptAccess';

/** The after-events of a player's actions. */
export type ScriptPlayerActionEvent = Extract<ScriptWorldEvent, { type: 'playerBreakBlock' | 'itemUse' }>;

/** What a level's scripts reach of its players' item use and block breaking. */
export interface ScriptPlayerActions {
    /** @returns A function that removes the guard. */
    guardBlockBreak(guard: VetoGuard<BlockBreakIntent>): () => void;
    /** @returns A function that removes the guard. */
    guardItemUse(guard: VetoGuard<ItemUseIntent>): () => void;
    /**
     * Calls `listener` with each block a player of the level broke and each item one used.
     * @returns A function that stops it.
     */
    events(listener: (event: ScriptPlayerActionEvent) => void): () => void;
}

/** A stack as a script reads it, or undefined for an empty hand. */
const itemOf = (item: Item | null): ScriptItem | undefined => scriptItemOf(item) ?? undefined;

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
    return {
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
