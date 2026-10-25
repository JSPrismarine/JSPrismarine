/**
 * The vanilla command set this server runs, and the part of it that it does not.
 *
 * `@jsprismarine/commands` implements 60 commands against its `CommandHost`
 * seam. The ones this server cannot answer call into a subsystem that does not
 * exist, and a command whose body cannot do anything is worse than one the
 * client was never offered: the player types it, the server accepts it, and
 * nothing happens.
 *
 * So the registry is built with an include filter. An excluded command is not
 * registered, so nothing can parse it, no alias is registered for it, and the
 * flattener never puts it in `AvailableCommandsPacket`.
 * {@link UNWIRED_COMMANDS} is that list, with the reason for each, and
 * `vanillaCommands.test.ts` asserts that it and the registered set add up to
 * what the package implements.
 */
import type { CommandSource, ContentRegistryIds } from '@jsprismarine/commands';
import { CommandRegistry, registerVanillaCommands } from '@jsprismarine/commands';

import type { ServerContent } from '../content/ServerContent';

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
    place: 'feature, jigsaw and structure placement outside the generator, which places them as it writes a chunk',
    ride: 'entity riding outside the data-driven entity runtime'
};

/**
 * The four registries whose contents a command argument validates against.
 *
 * Mojang's published command enums are frozen at the version the table was
 * generated from, so validating against them alone refuses a pack's own
 * `mypack:dragon` at parse for an entity this server can spawn. These four
 * are the registries a host verb resolves an id against and a pack can
 * extend, so each is offered alongside Mojang's list rather than instead of
 * it.
 *
 * The registries left out fail that test for their own reasons.
 * `minecraft:damage_type` has no registry on this server at all, and
 * `/effect` is unwired, so `minecraft:mob_effect` is never dispatched;
 * Mojang's list is the only list either has. `minecraft:attribute`,
 * `minecraft:particle_type` and `minecraft:worldgen/biome` are not validated
 * by anybody: Bedrock publishes no enum for them, so they already reach a
 * command body as an unchecked string.
 *
 * @param content - The server's content build.
 * @returns {ContentRegistryIds} One id list per validated registry.
 */
export const contentRegistryIds = (content: ServerContent): ContentRegistryIds => ({
    entityTypes: content.entities.registry.keys(),
    blocks: [...content.blocks.types.keys()],
    items: [...content.items.types.keys()],
    enchantments: content.enchantments.ids
});

/**
 * Builds the registry this server dispatches and advertises.
 *
 * The host is not a parameter: a command reaches it through the
 * `CommandSource` it runs with, which is built per dispatch, so one registry
 * serves every sender.
 *
 * @param content - What the pack stack holds, from
 * {@link contentRegistryIds}. Its lists are what the registry arguments
 * accept on top of Mojang's. Left out before the content build has run, which
 * is the registry `CommandManager`'s constructor holds until `enable`
 * replaces it.
 * @returns {CommandRegistry<CommandSource>} The registry, with
 * {@link UNWIRED_COMMANDS} left out.
 */
export const buildVanillaCommands = (content?: ContentRegistryIds): CommandRegistry<CommandSource> =>
    registerVanillaCommands(
        new CommandRegistry<CommandSource>({
            include: (name) => !Object.hasOwn(UNWIRED_COMMANDS, name),
            ...(content === undefined ? {} : { content })
        })
    );
