/**
 * The vanilla command set as data-driven definitions over the Brigadier port.
 *
 * `registerVanillaCommands` builds one registry holding the 46 command names
 * Java and Bedrock share plus the four Java-only ones the datapack runtime
 * needs, `/data`, `/item`, `/attribute` and `/random`. Every command's body
 * is one or more calls into the injected `CommandHost`, so the package holds
 * no world state.
 */
import type { CommandSource } from '../host';
import { CommandRegistry } from '../tree';
import { registerDataCommands } from './data';
import { registerEntityCommands } from './entities';
import { registerExecute, storeCommandResults } from './execute';
import { registerServerCommands } from './server';
import { registerWorldCommands } from './world';

/**
 * The 46 command names Java 26.3 and Bedrock 1.26.50 both have, from the
 * research note's comparison of Mojang's two command sets.
 */
export const SHARED_COMMAND_NAMES: readonly string[] = [
    'clear',
    'clone',
    'damage',
    'deop',
    'difficulty',
    'effect',
    'enchant',
    'execute',
    'fill',
    'function',
    'gamemode',
    'gamerule',
    'give',
    'help',
    'kick',
    'kill',
    'list',
    'locate',
    'loot',
    'me',
    'op',
    'particle',
    'place',
    'playsound',
    'recipe',
    'reload',
    'ride',
    'say',
    'schedule',
    'scoreboard',
    'setblock',
    'setworldspawn',
    'spawnpoint',
    'spreadplayers',
    'stop',
    'stopsound',
    'summon',
    'tag',
    'teleport',
    'tell',
    'tellraw',
    'time',
    'title',
    'transfer',
    'weather',
    'xp'
];

/**
 * The Java-only commands this package implements because the datapack
 * runtime cannot work without them. Bedrock has no parameter type for any of
 * their arguments, so the flattener degrades each one to a string and says so.
 */
export const JAVA_ONLY_COMMAND_NAMES: readonly string[] = ['attribute', 'data', 'item', 'random'];

/**
 * Builds a registry holding the whole command set.
 *
 * The dispatcher's `ResultConsumer` is wired to the `execute store` sinks, so
 * `execute store result score ... run ...` captures what the last command
 * returned.
 *
 * @returns The registry, ready to dispatch and to flatten into a packet.
 */
export const registerVanillaCommands = (
    registry: CommandRegistry<CommandSource> = new CommandRegistry<CommandSource>()
): CommandRegistry<CommandSource> => {
    registerExecute(registry);
    registerEntityCommands(registry);
    registerWorldCommands(registry);
    registerDataCommands(registry);
    registerServerCommands(registry);
    storeCommandResults(registry.getDispatcher());
    return registry;
};
