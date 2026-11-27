/** The weather in Bedrock's level events, which start and stop rain and storms. */
import type { Weather } from '@jsprismarine/engine-systems';
import { LevelEvent } from '@jsprismarine/minecraft';
import LevelEventPacket from '@jsprismarine/protocol/bedrock/packet/LevelEventPacket';

/**
 * The intensity a level event carries, which the client reads as a fraction of this.
 *
 * Java fades its rain in over a hundred ticks through a float per level. Nothing here carries
 * a partial level, so the rain is either falling or not and the client is told the full
 * amount.
 */
const FULL_INTENSITY = 65535;

/**
 * The level events that take a client from one weather to another.
 *
 * Bedrock has a start and a stop event per kind and no way to set both at once, so going
 * from a storm to clear skies is two events and the order matters: the client keeps a
 * lightning level of its own, and stopping the rain without stopping the storm leaves it
 * flashing over a blue sky. A client that may hold any weather is sent both stops first.
 * @param from - The weather the client was last shown, or undefined when it may hold any.
 * @param to - The weather now.
 * @returns The events with their data, in the order they go out.
 */
export const weatherEventsOf = (from: Weather | undefined, to: Weather): (readonly [LevelEvent, number])[] => {
    const events: (readonly [LevelEvent, number])[] = [];
    if (from === undefined || (from === 'thunder' && to !== 'thunder')) events.push([LevelEvent.STOP_THUNDERSTORM, 0]);
    if (from === undefined || (from !== 'clear' && to === 'clear')) events.push([LevelEvent.STOP_RAINING, 0]);

    if (to !== 'clear') events.push([LevelEvent.START_RAINING, FULL_INTENSITY]);
    if (to === 'thunder') events.push([LevelEvent.START_THUNDERSTORM, FULL_INTENSITY]);
    return events;
};

/**
 * The packets of {@link weatherEventsOf}.
 * @param from - The weather the client was last shown, or undefined when it may hold any.
 * @param to - The weather now.
 * @returns The packets, in the order they go out.
 */
export const weatherPacketsOf = (from: Weather | undefined, to: Weather): LevelEventPacket[] =>
    weatherEventsOf(from, to).map(([eventId, data]) => new LevelEventPacket({ eventId, position: null, data }));
