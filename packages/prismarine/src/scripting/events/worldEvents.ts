/**
 * The world events of a level's scripts that `ScriptGameEvent` describes, from the server's
 * events: each source turns the events of one game system into the Script API's, and guards the
 * actions their before-events are about, through the same cancelable server event a plugin
 * cancels ([ADR 0013](../../../../../docs/adr/0013-vetoable-actions-are-staged.md)).
 */
import type { ScriptGameEvent, ScriptGameEventGuard } from '@jsprismarine/script-host/host/world';

import type Server from '../../Server';
import type { Level } from '../../world/Level';
import { containerEvents } from './containers';
import { entityEvents } from './entities';
import { explosionEvents } from './explosions';
import { itemEvents } from './items';
import { itemUseEvents } from './itemUse';
import { miningEvents } from './mining';
import { projectileEvents } from './projectiles';
import { redstoneEvents } from './redstone';
import { ruleEvents } from './rules';
import { placementEvents } from './placement';
import { playerEvents } from './players';

/** One game system's world events. */
export interface WorldEventSource {
    /**
     * Adds a guard to the actions this system's before-events are about.
     * @returns A function that removes it.
     */
    guard?(guard: ScriptGameEventGuard): () => void;
    /**
     * Calls `listener` with each of this system's after-events, once the world has kept the change.
     * @returns A function that stops it.
     */
    events?(listener: (event: ScriptGameEvent) => void): () => void;
    /**
     * Compares the state this system's events are about with what the last call saw, and sends
     * the listener an after-event for each change, once a tick before the script flush.
     */
    poll?(): void;
}

/** What a level's scripts hear of the world events {@link WorldEventSource} describes. */
export interface ScriptWorldEvents {
    guard(guard: ScriptGameEventGuard): () => void;
    events(listener: (event: ScriptGameEvent) => void): () => void;
    /** Sends the changes of the state the sources compare, before the script flush takes the events. */
    poll(): void;
}

/** Joins the functions that stop each part into one. */
const stopAll =
    (stops: readonly (() => void)[]): (() => void) =>
    () => {
        for (const stop of stops) stop();
    };

/**
 * The world events of one level's scripts.
 * @param server - The server whose events carry the game systems' changes.
 * @param level - The level whose worlds the scripts see.
 */
export const levelWorldEvents = (server: Server, level: Level): ScriptWorldEvents => {
    const sources: readonly WorldEventSource[] = [
        placementEvents(server, level),
        playerEvents(server, level),
        entityEvents(server, level),
        explosionEvents(server, level),
        itemUseEvents(server, level),
        itemEvents(server, level),
        ruleEvents(server, level),
        miningEvents(server, level),
        projectileEvents(server, level),
        containerEvents(server, level),
        redstoneEvents(server, level)
    ];
    return {
        guard: (guard) => stopAll(sources.map((source) => source.guard?.(guard) ?? (() => {}))),
        events: (listener) => stopAll(sources.map((source) => source.events?.(listener) ?? (() => {}))),
        poll: () => {
            for (const source of sources) source.poll?.();
        }
    };
};
