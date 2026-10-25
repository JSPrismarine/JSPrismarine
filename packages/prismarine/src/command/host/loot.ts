/**
 * `/loot`, run against Java's own tables.
 *
 * The four sources are not four ways of naming a table. Only `loot <table>`
 * names one; `kill` rolls the table of the entity it points at, `mine` rolls
 * the table of the block at a position, and `fish` rolls a named table with
 * the position and tool its conditions read. So each one is resolved here
 * against the same index a mob dying and a block breaking already go through
 * - which is what makes `/loot spawn ~ ~ ~ mine ~ ~-1 ~` yield exactly what
 * breaking that block by hand would.
 *
 * Without a content build there are no tables at all, and the command says so
 * rather than reporting an empty roll: an empty roll is a real answer for
 * bedrock and for a mob Java gives no table, and the two must not read alike.
 */
import type { CommandSource, EntityRef, ItemSlot, LootDestination, LootSource } from '@jsprismarine/commands';
import { Vector3 } from '@jsprismarine/math';
import type { ItemStack as PredicateItemStack } from '@jsprismarine/predicates';

import type Server from '../../Server';
import { rollBlockDrops } from '../../block/blockLoot';
import type { ServerContent } from '../../content/ServerContent';
import type { ContentItemDrop } from '../../content/world/adapter';
import { rollMobDrops } from '../../entity/mobLoot';
import ContainerEntry from '../../inventory/ContainerEntry';
import { Item } from '../../item/Item';
import { lootLevelOf } from '../../world/lootLevel';
import { setItemSlot } from './inventory';
import { blockPositionOf, carryOut, refuse, resolveEntity, resolvePlayer, worldOf } from './support';

/**
 * Java's slot names as the Bedrock group and index `setItemSlot` writes.
 *
 * `/loot replace` is a Java command and writes `container.0`; `/replaceitem`
 * is Bedrock's and writes `slot.hotbar 0`. One of the two spellings had to be
 * the one the inventory speaks, and it is Bedrock's, because that is what the
 * client sends.
 */
const JAVA_SLOT_GROUPS: Readonly<Record<string, string>> = {
    container: 'slot.inventory',
    hotbar: 'slot.hotbar',
    inventory: 'slot.inventory',
    'weapon.mainhand': 'slot.weapon.mainhand',
    'weapon.offhand': 'slot.weapon.offhand',
    weapon: 'slot.weapon.mainhand',
    'armor.head': 'slot.armor.head',
    'armor.chest': 'slot.armor.chest',
    'armor.legs': 'slot.armor.legs',
    'armor.feet': 'slot.armor.feet'
};

/**
 * Reads a Java slot name into the group and index this server's inventories
 * address.
 *
 * `container.N` counts the whole 36-slot container from zero, which is what
 * `slot.inventory` is here; `hotbar.N` is the nine at the front.
 */
const slotOf = (slot: ItemSlot, offset: number): ItemSlot => {
    const dot = slot.name.lastIndexOf('.');
    const tail = dot < 0 ? '' : slot.name.slice(dot + 1);
    const indexed = tail.length > 0 && /^\d+$/.test(tail);
    const group = JAVA_SLOT_GROUPS[indexed ? slot.name.slice(0, dot) : slot.name];
    if (group === undefined) refuse(`${slot.name} is not a slot this server can write`);

    return { name: group, index: (indexed ? Number(tail) : 0) + offset };
};

/** What the predicates read of a tool, for a `mine` or `fish` source. */
const toolOf = (server: Server, source: CommandSource, tool: string | undefined): PredicateItemStack | undefined => {
    if (tool === undefined) return undefined;
    if (tool === 'mainhand' || tool === 'offhand') {
        const player = source.entity === undefined ? undefined : resolvePlayer(server, source.entity);
        if (player === undefined) return undefined;
        const held =
            tool === 'mainhand' ? player.getInventory().getItemInHand() : player.getInventory().getOffhand().getItem(0);
        return held?.asPredicateStack();
    }

    const registered = server.getItemManager().getItem(tool.includes(':') ? tool : `minecraft:${tool}`);
    return registered === null ? undefined : registered.asPredicateStack();
};

/** Rolls whichever of the four sources the command named. */
const rollLoot = (
    server: Server,
    content: ServerContent,
    loot: LootSource,
    source: CommandSource
): readonly ContentItemDrop[] => {
    if (loot.kind === 'kill') {
        const entity = resolveEntity(server, loot.entity);
        if (entity === undefined) return [];
        return rollMobDrops(content, entity.getType(), {
            position: loot.entity.position,
            level: lootLevelOf(worldOf(server, loot.entity.dimension))
        });
    }

    if (loot.kind === 'mine') {
        const world = worldOf(server, loot.dimension);
        const at = blockPositionOf(loot.position);
        const block = world.loadedBlockAt(at.getX(), at.getY(), at.getZ());
        if (block === undefined) refuse('There is no loaded block there');

        const tool = toolOf(server, source, loot.tool);
        return rollBlockDrops(
            content,
            { identifier: block.name, states: block.states },
            {
                position: { x: at.getX(), y: at.getY(), z: at.getZ() },
                ...(tool === undefined ? {} : { tool }),
                level: lootLevelOf(world)
            }
        );
    }

    const origin =
        loot.kind === 'fish'
            ? { x: loot.position.x, y: loot.position.y, z: loot.position.z }
            : { x: source.position.x, y: source.position.y, z: source.position.z };
    const tool = loot.kind === 'fish' ? toolOf(server, source, loot.tool) : undefined;

    if (content.loot.table(loot.table) === undefined) refuse(`There is no loot table called ${loot.table}`);

    return content.loot
        .roll(loot.table, {
            parameters: { origin, tool },
            level: lootLevelOf(worldOf(server, loot.kind === 'fish' ? loot.dimension : source.dimension))
        })
        .filter((stack) => stack.count > 0)
        .map((stack) => ({ identifier: stack.id, count: stack.count }));
};

/** One rolled drop as a stack this server can put somewhere, or null when it names nothing. */
const stackOf = (server: Server, drop: ContentItemDrop): Item | null => {
    const registered = server.getItemManager().getItem(drop.identifier);
    if (registered === null) return null;

    // A fresh stack rather than the registry's own, whose count the registry
    // shares with every other holder of that item.
    return new Item({
        id: registered.getId(),
        name: registered.getName(),
        meta: registered.getMeta(),
        count: drop.count
    });
};

/** Puts what was rolled into the players' inventories. */
const giveTo = (server: Server, players: readonly EntityRef[], drops: readonly ContentItemDrop[]): number => {
    let given = 0;
    for (const ref of players) {
        const player = resolvePlayer(server, ref);
        if (player === undefined) continue;

        for (const drop of drops) {
            const stack = stackOf(server, drop);
            if (stack === null) continue;

            const leftover = player.getInventory().addItem(new ContainerEntry({ item: stack, count: drop.count }));
            given += drop.count - leftover;
        }
        carryOut(player.getNetworkSession().sendInventory(), undefined);
    }
    return given;
};

/**
 * Runs `/loot`: rolls the source and delivers what came out.
 *
 * @returns How many items were delivered.
 * @throws {CommandSyntaxException} When no content is loaded, when the table
 *   does not exist, or when the destination needs something this server has
 *   not got.
 */
export const runLootCommand = (
    server: Server,
    loot: LootSource,
    source: CommandSource,
    destination: LootDestination
): number => {
    const content = server.getContent();
    if (content === undefined) {
        refuse('This server has loaded no loot tables; turn on content-packs to roll one');
    }

    const drops = rollLoot(server, content, loot, source);
    if (drops.length === 0) return 0;

    if (destination.kind === 'give') return giveTo(server, destination.players, drops);

    if (destination.kind === 'replace') {
        // Java writes consecutive slots from the one named, one stack each.
        let placed = 0;
        drops.forEach((drop, offset) => {
            if (destination.slot.count !== undefined && offset >= destination.slot.count) return;
            placed += setItemSlot(
                server,
                destination.target,
                slotOf(destination.slot, offset),
                drop.identifier,
                drop.count
            );
        });
        return placed;
    }

    if (destination.kind === 'insert') {
        refuse('This server has no container block entities, so there is nothing to insert into');
    }

    const world = worldOf(server, destination.dimension);
    const at = new Vector3(destination.position.x, destination.position.y, destination.position.z);
    const stacks = drops.map((drop) => stackOf(server, drop));
    const dropped = stacks.filter((stack) => stack !== null).length;
    if (dropped === 0) return 0;

    return carryOut(
        world.dropContents(at, stacks),
        drops.reduce((total, drop) => total + drop.count, 0)
    );
};
