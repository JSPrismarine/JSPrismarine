/**
 * The vanilla command set as data-driven definitions over the Brigadier port.
 *
 * `registerVanillaCommands` builds one registry holding the 46 command names
 * Java and Bedrock share, the five Java-only ones the datapack runtime needs -
 * `/data`, `/item`, `/attribute`, `/random` and `/return` - and the nine
 * Bedrock-only ones a Bedrock operator reaches for. Every command's body is
 * one or more calls into the injected `CommandHost`, so the package holds no
 * world state.
 */
import type { CommandSource } from '../host';
import { CommandRegistry } from '../tree';
import { registerBedrockCommands } from './bedrock';
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
 * runtime cannot work without them. Bedrock has no parameter type for most of
 * their arguments, so the flattener degrades those to a string and says so.
 */
export const JAVA_ONLY_COMMAND_NAMES: readonly string[] = ['attribute', 'data', 'item', 'random', 'return'];

/**
 * The Bedrock commands Java has no counterpart for that this package
 * implements, from Bedrock's other 38.
 *
 * Four are older spellings of something Java says differently and run the same
 * host verbs as the Java form; the rest are Bedrock's own. See
 * {@link registerBedrockCommands} for why these and not the other 29.
 */
export const BEDROCK_ONLY_COMMAND_NAMES: readonly string[] = [
    'camerashake',
    'daylock',
    'fog',
    'playanimation',
    'replaceitem',
    'testfor',
    'testforblock',
    'testforblocks',
    'titleraw'
];

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
    registerBedrockCommands(registry);
    storeCommandResults(registry.getDispatcher());
    return registry;
};
