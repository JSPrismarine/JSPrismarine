/**
 * The vanilla command set this server runs, and the part of it that it does not.
 *
 * `@jsprismarine/commands` implements 59 commands against its `CommandHost`
 * seam. This server can answer the verbs of 42 of them. The other 17 call into
 * a subsystem that does not exist - there is no scoreboard, no status effect
 * system, no loot runtime, no experience model - and a command whose body
 * cannot do anything is worse than one the client was never offered: the
 * player types it, the server accepts it, and nothing happens.
 *
 * So the registry is built with an include filter. An excluded command is not
 * registered, so nothing can parse it and the flattener never puts it in
 * `AvailableCommandsPacket`. {@link UNWIRED_COMMANDS} is the list, with the
 * reason for each, and `vanillaCommands.test.ts` asserts the two halves add up
 * to the set the package implements.
 */
import type { CommandSource } from '@jsprismarine/commands';
import { CommandRegistry, registerVanillaCommands } from '@jsprismarine/commands';

/**
 * The commands this server does not advertise, and what each one would need.
 *
 * Keyed by command name so a reader can answer "why can I not use /effect"
 * from one place, and so the gap closes by deleting a row rather than by
 * finding the filter.
 */
export const UNWIRED_COMMANDS: Readonly<Record<string, string>> = {
    attribute: 'attribute modifiers; this server stores base values only',
    data: 'reading and writing NBT by path',
    effect: 'a status effect system',
    item: 'item modifiers and addressable inventory slots',
    locate: 'a structure, biome and point-of-interest index',
    loot: 'the loot table runtime',
    place: 'runtime feature, jigsaw and structure placement',
    recipe: 'per-player recipe unlocking',
    ride: 'entity riding',
    spawnpoint: 'per-player spawn points',
    weather: 'a weather cycle'
};

/**
 * Builds the registry this server dispatches and advertises.
 *
 * The host is not a parameter: a command reaches it through the
 * `CommandSource` it runs with, which is built per dispatch, so one registry
 * serves every sender.
 *
 * @returns The registry, with {@link UNWIRED_COMMANDS} left out.
 */
export const buildVanillaCommands = (): CommandRegistry<CommandSource> =>
    registerVanillaCommands(
        new CommandRegistry<CommandSource>({ include: (name) => !Object.hasOwn(UNWIRED_COMMANDS, name) })
    );
