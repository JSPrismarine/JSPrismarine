/**
 * The vanilla command set this server runs, and the part of it that it does not.
 *
 * `@jsprismarine/commands` implements 59 commands against its `CommandHost`
 * seam. The ones this server cannot answer call into a subsystem that does not
 * exist, and a command whose body cannot do anything is worse than one the
 * client was never offered: the player types it, the server accepts it, and
 * nothing happens.
 *
 * So the registry is built with an include filter. An excluded command is not
 * registered, so nothing can parse it, no alias is registered for it, and the
 * flattener never puts it in `AvailableCommandsPacket`.
 * {@link UNWIRED_COMMANDS} and {@link CONTENT_ONLY_COMMANDS} are the two
 * lists, with the reason for each, and `vanillaCommands.test.ts` asserts that
 * they and the registered set add up to what the package implements.
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
    attribute: "attribute modifiers; this server's `Attribute` holds one value and no modifier stack",
    data: 'reading and writing NBT by path',
    effect: 'a status effect system; `MobEffectPacket` is a wire type with nothing behind it',
    item: 'item modifiers and Java-addressable inventory slots',
    locate: 'a radial search; the generator places structures and never looks one up by position',
    place: 'feature, jigsaw and structure placement outside the generator, which places them as it writes a chunk',
    ride: 'entity riding outside the data-driven entity runtime',
    spawnpoint: 'per-player spawn points; a respawn reads the world spawn',
    weather: 'a weather cycle; nothing raises rain or thunder'
};

/**
 * The commands whose whole subsystem is the pack stack, and which are
 * therefore advertised only when `content-packs` is on.
 *
 * `/loot` rolls Java's tables and `/recipe` unlocks out of Java's book, and
 * there is neither without a content build, so with the packs off the two
 * could do nothing at all. The rest of the set either works without content
 * or reports the same thing Java reports for an empty datapack: `/function`
 * on a server with no functions answers that the function does not exist,
 * which is the truth and is useful.
 */
export const CONTENT_ONLY_COMMANDS: Readonly<Record<string, string>> = {
    loot: "Java's loot tables, which come from the pack stack; turn on content-packs",
    recipe: "Java's recipe book, which comes from the pack stack; turn on content-packs"
};

/**
 * Every command this server leaves out, with the reason.
 *
 * @param contentLoaded - Whether a content build exists, which decides the
 * {@link CONTENT_ONLY_COMMANDS} half.
 * @returns {Readonly<Record<string, string>>} Command name to reason.
 */
export const unwiredCommands = (contentLoaded: boolean): Readonly<Record<string, string>> =>
    contentLoaded ? UNWIRED_COMMANDS : { ...UNWIRED_COMMANDS, ...CONTENT_ONLY_COMMANDS };

/**
 * Builds the registry this server dispatches and advertises.
 *
 * The host is not a parameter: a command reaches it through the
 * `CommandSource` it runs with, which is built per dispatch, so one registry
 * serves every sender.
 *
 * @param contentLoaded - Whether the pack stack was built, which decides
 * whether the content-backed commands are offered.
 * @returns {CommandRegistry<CommandSource>} The registry, with
 * {@link unwiredCommands} left out.
 */
export const buildVanillaCommands = (contentLoaded = false): CommandRegistry<CommandSource> => {
    const unwired = unwiredCommands(contentLoaded);
    return registerVanillaCommands(
        new CommandRegistry<CommandSource>({ include: (name) => !Object.hasOwn(unwired, name) })
    );
};
