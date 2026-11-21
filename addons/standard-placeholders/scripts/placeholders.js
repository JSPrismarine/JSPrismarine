/**
 * What the addon provides, and how it renders a clock and an uptime. Nothing here imports a
 * module, so the docs build reads the key table from this file too.
 */

/** The keys of each namespace, with what each renders. The script registers the keys from here. */
export const PLACEHOLDERS = {
    player: {
        name: "The player's name.",
        ping: "The player's round trip time in milliseconds, rounded. Left as written until the connection has a sample.",
        health: "The player's health, rounded to a whole number.",
        max_health: 'The most health the player can have.',
        gamemode: "The player's game mode: `Survival`, `Creative`, `Adventure` or `Spectator`.",
        dimension: "The player's dimension without its `minecraft:` prefix, such as `overworld`.",
        x: "The player's x coordinate, rounded down.",
        y: "The player's y coordinate, rounded down.",
        z: "The player's z coordinate, rounded down.",
        level: "The player's experience level."
    },
    server: {
        tps: 'Ticks per second over the last second, with one decimal.',
        mspt: "The milliseconds a tick's work has taken lately, with one decimal.",
        online: 'How many players are online.',
        max: 'How many players may be online at once.',
        version: 'The JSPrismarine version.',
        uptime: 'How long the scripts have run, such as `1d 2h 3m`. A `/reload` starts it over.'
    },
    world: {
        time: "The time of day as a 24-hour clock, such as `06:00` at a day's start.",
        day: 'How many days the world has seen.',
        weather:
            "The weather in the player's dimension, or the Overworld's: `Clear`, `Rain` or `Thunder`. Left as written until the weather has changed once since the scripts started."
    }
};

/** Ticks in a Minecraft day. */
const DAY_TICKS = 24_000;
/** The clock hour at tick 0 of a day. */
const DAWN_HOUR = 6;
/** Ticks in a minute of real time at 20 ticks per second. */
export const TICKS_PER_MINUTE = 1200;

/** Two digits, zero padded. */
const pad = (number) => String(number).padStart(2, '0');

/**
 * The time of day as a clock, the way the in-game clock reads it: a day starts at 06:00.
 * @param timeOfDay - Ticks into the day, from 0 to 23999.
 * @returns `HH:MM`.
 */
export const clockOf = (timeOfDay) => {
    const ticks = ((timeOfDay % DAY_TICKS) + DAY_TICKS) % DAY_TICKS;
    const hours = (Math.floor(ticks / 1000) + DAWN_HOUR) % 24;
    const minutes = Math.floor(((ticks % 1000) / 1000) * 60);
    return `${pad(hours)}:${pad(minutes)}`;
};

/**
 * Ticks as days, hours and minutes, without the units that are zero ahead of the first one that
 * is not, so a fresh server reads `0m` and an old one `1d 2h 3m`.
 */
export const uptimeOf = (ticks) => {
    const minutes = Math.floor(Math.max(0, ticks) / TICKS_PER_MINUTE);
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor(minutes / 60) % 24;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (parts.length > 0 || hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes % 60}m`);
    return parts.join(' ');
};
