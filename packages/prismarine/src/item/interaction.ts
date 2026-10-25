/**
 * A player's right click, run through the content hooks.
 *
 * `World.useItemOn` is the path this server has always had: it finds the block the item names
 * and writes it. It raises no hook, so with the content on, a door clicked by a player did not
 * open and a chest placed by one got no block entity, even though both behavior families were
 * loaded and working.
 *
 * This module is the content path for the same click, in vanilla's order. The block the player
 * clicked gets `onPlayerInteract` first, unless the player is sneaking with something in hand,
 * which is the rule that lets a player place a block against a chest. Then, for a block with a
 * screen, the screen opens. Then the item in hand gets `onUseOn`. Any of the three may consume
 * the click. Only when all decline does the item place the block it names, through the content
 * block adapter, so `onPlace` runs and a container gets its record.
 *
 * The screen is here and not in a block behavior family because a family has no client to send
 * to; `jsprismarine:utility` says in as many words that the screens its workstations open belong
 * to the server. Before this, no block opened a container anywhere in this server.
 *
 * It reports whether it handled the click. A false sends the caller back to `World.useItemOn`,
 * which is also what happens with `content-packs` off, so the path a server without content runs
 * is unchanged.
 */
import { BLOCK_FACES } from '@jsprismarine/blocks';
import type { BlockFace, FaceLocation, HookBlock } from '@jsprismarine/blocks';
import { relative } from '@jsprismarine/engine-systems';
import { ItemStack } from '@jsprismarine/items';
import type { ItemSource } from '@jsprismarine/items';
import { Vector3 } from '@jsprismarine/math';
import { WindowTypes } from '@jsprismarine/minecraft';

import { advancementBlockUsed, advancementItemUsedOnBlock } from '../advancement/triggers';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { showEnchantingTable } from '../enchantment/enchantingTable';
import { blockContainerOf } from '../inventory/blockContainers';
import { isRespawnBlock } from '../world/RespawnPoint';
import TextPacketType from '../network/type/TextPacketType';
import { fillContainerLoot } from '../inventory/containerLoot';
import { openContainerContents, restorePlacedContents } from '../inventory/containerStore';
import type { ContentPosition } from '../content/world/adapter';
import type { ServerContent } from '../content/ServerContent';
import type { ServerItemActorPort } from './actorPort';
import type { Item } from './Item';
import type Player from '../Player';

/** What {@link useItemOnBlock} is given about one click. */
export interface BlockInteraction {
    /** Every content registry, which is what makes this path available at all. */
    readonly content: ServerContent;
    /** The item actor port of the player's dimension; see {@link ServerItemActorPort}. */
    readonly actors: ServerItemActorPort;
    readonly player: Player;
    /** The block the client says was clicked. */
    readonly position: ContentPosition;
    /** Which of the block's six faces, as the client numbers them. */
    readonly face: number;
    /** Where on the face, each coordinate from 0 to 1. */
    readonly faceLocation: FaceLocation;
}

/** What the content path did with a click. */
export type InteractionResult =
    /** A behavior consumed it, or a block was placed. Nothing else should run. */
    | 'handled'
    /** Nothing in the content wanted it, so the legacy path should run. */
    | 'declined';

/** What {@link useItemOnEntity} is given about one click on an entity. */
export interface EntityInteraction {
    readonly content: ServerContent;
    readonly actors: ServerItemActorPort;
    readonly player: Player;
    /** The entity the click landed on, which is what `targetOf` answers with. */
    readonly target: ItemSource;
}

/** The item in hand as the item runtime's own stack, or undefined when no type covers it. */
const heldStack = (content: ServerContent, identifier: string, count: number): ItemStack | undefined =>
    content.items.registry.has(identifier)
        ? new ItemStack(content.items.registry.holder(identifier), count)
        : undefined;

/** The block a hook reads, out of the live world, or undefined when its chunk is not loaded. */
const hookBlockAt = (player: Player, dimension: string, at: ContentPosition): HookBlock | undefined => {
    const block = player.getWorld().loadedBlockAt(at.x, at.y, at.z);
    return block && { identifier: block.name, position: at, dimension, states: block.states };
};

/**
 * Puts the block an item names into the world, through the content adapter.
 *
 * The position is the clicked one when what stands there can be replaced, as grass and snow can,
 * and the position against the clicked face otherwise. Whether a block may be replaced is the
 * block manager's own answer rather than a second list kept here.
 *
 * @returns True when a block went down.
 */
const placeBlock = (interaction: BlockInteraction, placed: Item, face: BlockFace): boolean => {
    const identifier = placed.getName();
    const { player, content } = interaction;
    const blocks = content.world.blockWorld.at(player.getWorld().getDimension().name);
    const manager = player.getServer().getBlockManager();

    // Not a block: a sword, a bucket, a spawn egg. Nothing to place, and nothing refused either.
    if (BlockRuntimeIds.tryGetByName(identifier) === null) return false;
    if (manager.findBlock(identifier)?.canBePlaced() !== true) return false;

    const clicked = player
        .getWorld()
        .loadedBlockAt(interaction.position.x, interaction.position.y, interaction.position.z);
    if (clicked === undefined) return false;

    const replaceClicked = manager.findBlock(clicked.name)?.canBeReplaced() === true;
    const target = replaceClicked ? interaction.position : relative(interaction.position, face);

    const standing = player.getWorld().loadedBlockAt(target.x, target.y, target.z);
    if (standing === undefined) return false;
    if (standing.name !== 'minecraft:air' && manager.findBlock(standing.name)?.canBeReplaced() !== true) return false;

    // Through the adapter rather than through the world, so the write raises `onPlace` and the
    // neighbors are told. That hook is what gives a chest its block entity record.
    blocks.setBlock(target, identifier);
    // After the hook, which gave a container an empty record: a shulker box put back down
    // holds what it was carrying rather than what a fresh one holds.
    restorePlacedContents(blocks, target, identifier, placed);
    blocks.playSound(target, 'place');
    return true;
};

/** The clicked block's position as the advancement conditions read one. */
const origin = (interaction: BlockInteraction) => ({
    x: interaction.position.x,
    y: interaction.position.y,
    z: interaction.position.z
});

/**
 * Opens the screen the clicked block draws, and clears an enchanting table's three rows.
 *
 * Fire and forget, because the click is decided synchronously and the packets are not: the
 * caller has to answer the transaction now, and a window that arrives a tick later still
 * arrives. A throw on the way reaches the log rather than the caller, for the same reason a
 * behavior that throws must not cost the player the click.
 *
 * @returns Whether the block has a screen at all, which is what makes the click handled.
 */
const openContainer = (interaction: BlockInteraction, block: HookBlock): boolean => {
    const { player } = interaction;
    const container = blockContainerOf(block.identifier);
    if (container === undefined) return false;

    const at = new Vector3(interaction.position.x, interaction.position.y, interaction.position.z);
    // Before the read, because this is the open that fills a generated chest: a structure
    // leaves the table and the seed on the block entity and the first open rolls them.
    fillContainerLoot(interaction.content, player.getWorld(), interaction.position, block.identifier);

    // Read through the same module the request path writes through, so the slots a player is
    // shown and the slots they can then move a stack through are one list in one order.
    const contents = container.slots === 0 ? [] : openContainerContents(player, interaction.position, block.identifier);
    const session = player.getNetworkSession();

    void (async () => {
        await session.openBlockContainer(at, block.identifier, contents);

        // A table's offers depend on the stack in its input slot, and nothing is in it the
        // moment it opens - so this clears the rows rather than leaving the client's own
        // placeholders, and `showEnchantingTable` is called again once something goes in.
        if (container.screen === WindowTypes.ENCHANTMENT) {
            await showEnchantingTable(player, undefined, interaction.position);
        }
    })().catch((error: unknown) => player.getServer().getLogger().error(error));

    return true;
};

/**
 * Moves the player's spawn point to a bed or a respawn anchor they clicked.
 *
 * This is the server's job rather than a block behavior's for the same reason the screens are:
 * a behavior family has no player to move the spawn of and no client to tell. The bed family's
 * own `onPlayerInteract` does the block half, setting `occupied_bit` when it is dark enough.
 *
 * Vanilla moves the point on use, day or night, and says so. Sleeping itself is not modeled, so
 * nothing here waits for morning.
 *
 * @returns Whether the block was one that holds a spawn.
 */
const claimRespawnBlock = (interaction: BlockInteraction, block: HookBlock): boolean => {
    if (!isRespawnBlock(block.identifier)) return false;

    const { player, position } = interaction;
    const already = player.getSpawnPoint();
    const dimension = player.getWorld().getDimension().name;
    player.setSpawnPoint({ x: position.x, y: position.y, z: position.z, dimension });

    // Only when it moved. Vanilla says it once, and a player clicking the same bed twice is the
    // ordinary way to find out whether it took.
    const moved =
        already === undefined ||
        already.x !== position.x ||
        already.y !== position.y ||
        already.z !== position.z ||
        already.dimension !== dimension;
    if (!moved) return true;

    void player
        .getNetworkSession()
        .sendMessage({ message: 'tile.bed.respawnSet', type: TextPacketType.Translate, needsTranslation: true })
        .catch((error: unknown) => player.getServer().getLogger().error(error));

    return true;
};

/**
 * Runs the content hooks for one right click on a block.
 *
 * @returns Whether the content consumed the click, or `declined` for the caller to fall back to
 *   {@link import('../world/World').World.useItemOn}.
 */
export const useItemOnBlock = (interaction: BlockInteraction): InteractionResult => {
    const { content, actors, player } = interaction;

    const face = BLOCK_FACES[interaction.face];
    if (face === undefined) return 'declined';

    const dimension = player.getWorld().getDimension().name;
    const block = hookBlockAt(player, dimension, interaction.position);
    if (block === undefined) return 'declined';

    const held = player.getInventory().getItemInHand();
    const stack = heldStack(content, held.getName(), held.getAmount());
    const source = { identifier: 'minecraft:player', runtimeId: Number(player.getRuntimeId()) };
    const position = player.getPosition();

    // A block interaction landed on no entity, which is what `targetOf` has to say while the
    // hooks below run. Recorded for the length of the click rather than kept.
    return actors.duringInteraction(source, undefined, () => {
        // Vanilla's rule: sneaking with something in hand skips the block, which is how a player
        // places a block against a chest instead of opening it.
        const skipBlock = player.isSneaking() && stack !== undefined;

        if (!skipBlock) {
            const hooks = content.blocks.types.get(block.identifier)?.state(block.states).content.hooks;
            const consumed = hooks?.dispatchFirst('onPlayerInteract', {
                block,
                player: {
                    identifier: 'minecraft:player',
                    position: { x: position.getX(), y: position.getY(), z: position.getZ() }
                },
                face,
                faceLocation: interaction.faceLocation,
                itemStack: stack
            });

            // After the hook and whatever the hook said, because for a container block the two
            // are different halves of one click: a barrel's family sets `open_bit` and returns
            // `true`, a chest's plays the open sound and declines, and neither opens a screen -
            // `jsprismarine:utility` says in as many words that the screens belong here.
            const opened = openContainer(interaction, block);
            const claimed = claimRespawnBlock(interaction, block);
            if (opened || claimed || consumed === true) {
                advancementBlockUsed(player, { origin: origin(interaction), block: block.identifier }, true);
                return 'handled';
            }
        }

        if (stack !== undefined) {
            const used = stack.dispatchFirst('onUseOn', {
                itemStack: stack,
                source,
                useDuration: 0,
                block: { identifier: block.identifier, states: block.states, position: block.position },
                blockFace: face,
                faceLocation: interaction.faceLocation
            });
            if (used !== undefined) {
                // Java raises both: `any_block_use` for every interaction with a block, and
                // `item_used_on_block` for the item that did it, whose conditions see the tool.
                const event = { origin: origin(interaction), block: block.identifier, tool: held };
                advancementBlockUsed(player, event, false);
                advancementItemUsedOnBlock(player, event);
                return 'handled';
            }
        }

        return placeBlock(interaction, held, face) ? 'handled' : 'declined';
    });
};

/**
 * Runs the content hooks for one right click on an entity.
 *
 * There is no entity hook to dispatch: Mojang's `ItemCustomComponent` has none, so a behavior
 * that acts on an entity reads `targetOf` from inside `onUse` instead. That is why this records
 * the target and dispatches `onUse` rather than something named for the entity.
 *
 * @returns Whether a behavior consumed the click.
 */
export const useItemOnEntity = (interaction: EntityInteraction): InteractionResult => {
    const { content, actors, player, target } = interaction;

    const held = player.getInventory().getItemInHand();
    const stack = heldStack(content, held.getName(), held.getAmount());
    if (stack === undefined) return 'declined';

    const source = { identifier: 'minecraft:player', runtimeId: Number(player.getRuntimeId()) };

    return actors.duringInteraction(source, target, () =>
        stack.dispatchFirst('onUse', { itemStack: stack, source, useDuration: 0 }) === undefined
            ? 'declined'
            : 'handled'
    );
};
