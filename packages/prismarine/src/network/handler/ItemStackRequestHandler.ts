import type { Vector3 } from '@jsprismarine/math';
import { itemTypesTable } from '@jsprismarine/items';
import { javaItemToBedrock } from '@jsprismarine/mapping';
import type { ItemStackData } from '@jsprismarine/protocol';
import type { RecipeItemStack } from '@jsprismarine/recipes';
import { WindowTypes } from '@jsprismarine/minecraft';

import type { PlayerSession } from '../../';
import type Player from '../../Player';
import type Server from '../../Server';
import { advancementItemCrafted } from '../../advancement/triggers';
import CraftingInput from '../../crafting/CraftingInput';
import ContainerEntry from '../../inventory/ContainerEntry';
import type HumanInventory from '../../inventory/HumanInventory';
import { blockSlotName, blockSlotOf, isTakeOnlySlot, screenStoresSlots } from '../../inventory/containerSlots';
import { containerAnchorOf, isPerPlayerContainer, openContainerSlots } from '../../inventory/containerStore';
import type { OpenContainerSlots } from '../../inventory/containerStore';
import { Item } from '../../item/Item';
import { joinContentPayloads } from '../contentPayloads';
import type ItemStackRequestPacket from '../packet/ItemStackRequestPacket';
import type {
    ItemStackResponse,
    ItemStackResponseContainerInfo,
    ItemStackResponseSlotInfo
} from '../packet/ItemStackResponsePacket';
import ItemStackResponsePacket, { ItemStackResponseResult } from '../packet/ItemStackResponsePacket';
import type { ItemStackRequest, ItemStackRequestSlotInfo } from '../type/ItemStackRequest';
import { ContainerUiId, ItemStackRequestActionType } from '../type/ItemStackRequest';
import type { OpenBlockContainer } from '../PlayerSession';
import type PacketHandler from './PacketHandler';
import {
    refreshEnchantOptions,
    takeAnvilResult,
    takeEnchantOption,
    WORKSTATION_ITEM,
    WORKSTATION_MATERIAL,
    workstationContainerId,
    workstationSlotOf
} from './workstation';

/** Helmet, chestplate, leggings, boots - the four the client numbers head to feet. */
const ARMOR_SLOTS = 4;

/** The containers that are all views onto the one player inventory. */
const PLAYER_CONTAINERS = new Set<number>([
    ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY,
    ContainerUiId.HOTBAR,
    ContainerUiId.INVENTORY
]);

/**
 * The item a creative pick names.
 *
 * The client answers with the position of the entry it was shown, so this
 * has to read the list `CreativeContentPacket` sent: the content build's menu
 * when there is one, and the server's own `CreativeInventory` otherwise. Reading the other
 * one hands the player an item they did not click.
 *
 * @param netId - The one-based creative net id the client sent back.
 * @returns The item, or null when the id names no entry.
 */
const creativePick = (server: Server, netId: number): Item | null => {
    const payloads = joinContentPayloads(server.getContent(), server.getLogger());
    if (payloads === undefined) return server.getCreativeInventory().get(netId);

    const picked = payloads.creativeItems[netId - 1];
    if (picked === undefined) return null;

    // The registry's runtime id is what `getRuntimeId` uses for a name the
    // committed item table does not have. That is how a pack's own item
    // reaches the wire at all.
    return new Item({ runtimeId: picked.runtimeId, name: picked.name, meta: picked.meta });
};

/**
 * The store id {@link ItemStackRequestHandler.locate} answers with for a workstation slot.
 *
 * Negative on purpose: every `ContainerUiId` is zero or above, and an anvil's input container
 * is id 0, so a tagged value is the only thing that tells the two apart.
 */
const WORKSTATION = -1;

/**
 * The store id {@link ItemStackRequestHandler.locate} answers with for a block's own slot.
 *
 * Negative for the same reason {@link WORKSTATION} is, and a different number because the two
 * are different stores: a furnace has both, its fuel slot belonging to the block and its screen
 * belonging to nothing.
 */
const BLOCK_CONTAINER = -2;

/**
 * A slot a request named: which store holds it and the index there, then the `Container Name`
 * and the slot number the request used.
 *
 * The answer repeats the last two. A Bedrock Dedicated Server 1.26.52 answers a move out of
 * `HOTBAR` slot 2 about `HOTBAR` slot 2, not about the combined inventory the slot also belongs
 * to, and the offhand's one slot is slot 1 to the client and index 0 here.
 */
type Located = readonly [store: number, index: number, container: number, slot: number];

/**
 * The block's own slots, read on demand.
 *
 * A function rather than the slots themselves, because reading them means reading the chunk's
 * block entity back out of its NBT, and most requests - every craft, every move inside the
 * player's own inventory - never go near a block at all.
 */
type OpenContainerLookup = () => OpenContainerSlots | null;

/** What one request may reach into besides the player's own containers. */
interface WorkstationContext {
    readonly session: PlayerSession;
    /** Workstation slots the whole packet changed, so the table's rows can be redrawn once. */
    readonly changed: Set<number>;
    /** Block slots the whole packet changed, so every other player at the block can be told. */
    readonly containerChanged: Set<number>;
    /** Accepted item drops, spawned after the batch response is sent. */
    readonly drops: Item[];
}

/** Amount, as the docs bound it: a request moves between one item and a full stack of 64. */
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 64;

/** A window's block position as the content packages take one, which is whole numbers. */
const blockPositionOf = (position: Vector3) => ({
    x: Math.floor(position.getX()),
    y: Math.floor(position.getY()),
    z: Math.floor(position.getZ())
});

/**
 * Whether an id is one a client makes up: negative and odd. A positive value is a stack id
 * the server handed out and a negative even one is a legacy request id, so either in this
 * position is a request from something other than the game client.
 */
const isClientRequestId = (id: number): boolean => Number.isInteger(id) && id < 0 && id % 2 !== 0;

/** Two stacks that can be one: the same item in the same variant. */
const sameItem = (a: Item, b: Item): boolean =>
    a.getName() === b.getName() && a.meta === b.meta && a.getBlockRuntimeId() === b.getBlockRuntimeId();

/**
 * Part of a stack, split off as a stack of its own.
 *
 * Without the stack network id, which stays with what is left: a Bedrock Dedicated Server
 * 1.26.52 gives the part a new one, and so does the answer that first names it here.
 */
const splitOff = (item: Item, count: number): Item => {
    const part = item.withCount(count);
    part.stackNetworkId = 0;
    return part;
};

/** Resolves a Bedrock stack's name and legacy data back to its Java recipe identity. */
const javaStackOf = (item: Item): RecipeItemStack | undefined => {
    let id = item.getName();
    if (id.startsWith('minecraft:')) {
        const row = itemTypesTable.items[id];
        if (row === undefined) return undefined;

        const merged = row.merged?.find((variant) => variant.data === item.meta);
        if (merged !== undefined) id = merged.java;
        else {
            // `data` on a uniquely named Bedrock item is its legacy wire value, not a
            // selector: birch planks remain birch planks even when the content stack's
            // metadata is zero. Only a shared identifier needs metadata to identify a
            // different Java item.
            if (row.merged !== undefined && row.data !== undefined && row.data !== item.meta) return undefined;
            if (row.merged !== undefined && row.data === undefined && item.meta !== 0) return undefined;
            id = row.java;
        }
    }

    const components = Object.fromEntries(item.asPredicateStack().components);
    return {
        id,
        count: item.getAmount(),
        ...(Object.keys(components).length === 0 ? {} : { components })
    };
};

/** Builds the server stack from the exact result advertised in CraftingDataPacket. */
const bedrockRecipeResult = (javaId: string, result: ItemStackData, server: Server): Item | undefined => {
    const mapped = javaItemToBedrock(javaId);
    if (mapped.kind === 'unknown') return undefined;

    const name = mapped.bedrock.identifier;
    return new Item({
        runtimeId: result.runtimeId,
        name,
        meta: result.meta,
        count: result.count,
        blockRuntimeId: result.blockRuntimeId,
        content: server.getContent()
    });
};

export default class ItemStackRequestHandler implements PacketHandler<ItemStackRequestPacket> {
    public static PacketName = 'ItemStackRequestPacket';
    public readonly phases = ['play'] as const;

    /**
     * Applies what the client asked for, and says so.
     *
     * Every request is answered, accepted or not. With the new inventory system the client
     * holds its change back until the server agrees, so silence is what left a creative pick
     * refusing to go anywhere - and an answer of `ERROR` is a clean refusal, the client
     * putting back what it had rather than drifting out of step. A step that throws is
     * answered the same way, once the request has been rolled back.
     */
    public async handle(packet: ItemStackRequestPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const inventory = player.getInventory();

        // What the client actually asked for, by name: what a client sends for a given gesture
        // is not written down anywhere, and the log is where it shows.
        for (const request of packet.requests) {
            server
                .getLogger()
                .debug(
                    `Item stack request ${request.requestId}: ` +
                        request.actions
                            .map((action) => ItemStackRequestActionType[action.type] ?? action.type)
                            .join(', '),
                    'ItemStackRequestHandler/handle'
                );
        }

        const craftingInput = player.getCraftingInput();

        // The workstation input slots a request moved something into or out of, gathered across
        // the whole packet: the table's offers depend on what is in it.
        const workstationChanged = new Set<number>();

        // The block's own slots a request moved something into or out of, gathered so that every
        // other player with the same block open can be told once the packet has been answered.
        const containerChanged = new Set<number>();
        const drops: Item[] = [];

        const response = new ItemStackResponsePacket();
        response.responses = packet.requests.map((request) =>
            this.apply(request, server, player, inventory, craftingInput, {
                session,
                changed: workstationChanged,
                containerChanged,
                drops
            })
        );

        await session.send(response);

        if (drops.length > 0) await player.getWorld().dropFromPlayer(player, drops);

        // Redrawn whenever the item in the table changed, which is what `showEnchantingTable`
        // says it has to be called for: the three rows are a function of the stack.
        const open = session.getOpenBlockContainer();
        if (open !== undefined && open.screen === WindowTypes.ENCHANTMENT && workstationChanged.size > 0) {
            await refreshEnchantOptions(player, open);
        }

        // Everyone else standing at the same chest. Their client holds its own copy of the
        // slots and nothing in the exchange above goes anywhere near them, so without this two
        // players sharing a chest each see only their own half of what is in it.
        if (open !== undefined && containerChanged.size > 0) {
            await this.tellOtherViewers(player, open, containerChanged);
        }
    }

    /**
     * Tells every other player with the same block open what changed in it.
     *
     * One `InventorySlot` per slot rather than the whole container, because each viewer opened
     * the block under a window id of their own and the slots that moved are usually one or two.
     * The player who made the change is left out: their client has already been answered by the
     * `ItemStackResponse`, and telling it again would overwrite what it just drew.
     *
     * The stacks go out with no stack network id. Each viewer's slots are read back out of the
     * block entity, which keeps no ids, and the only ids at hand are the acting player's: they
     * count per player, so they would name nothing the other client knows.
     */
    private async tellOtherViewers(
        player: Player,
        open: OpenBlockContainer,
        slots: ReadonlySet<number>
    ): Promise<void> {
        // Nobody else is looking at an ender chest: two players at one are looking at two
        // different inventories, and the block holds neither.
        if (isPerPlayerContainer(open.identifier)) return;

        // Which block the slots belong to, rather than which block was clicked: either half of a
        // double chest opens the same 54 slots, so the two have to compare as one container.
        const changed = containerAnchorOf(player, blockPositionOf(open.position), open.identifier);

        for (const other of player.getWorld().getPlayers()) {
            if (other === player) continue;

            const theirs = other.getNetworkSession().getOpenBlockContainer();
            if (theirs === undefined) continue;

            const at = blockPositionOf(theirs.position);
            const anchor = containerAnchorOf(other, at, theirs.identifier);
            if (anchor.x !== changed.x || anchor.y !== changed.y || anchor.z !== changed.z) continue;

            const held = openContainerSlots(other, at, theirs.identifier);
            if (held === undefined) continue;

            for (const slot of slots) {
                const named = blockSlotName(theirs.screen, slot);
                await other
                    .getNetworkSession()
                    .sendContainerSlot(theirs.windowId, named.containerId, named.slotId, held.get(slot));
            }
        }
    }

    /**
     * Runs one request's steps, and describes the slots they left behind.
     *
     * Measured against a Bedrock Dedicated Server 1.26.52 through the proxy, which this
     * follows:
     *
     * - a stack that moves whole keeps its stack network id; the part split off a stack gets a
     *   new one, and the part left behind keeps the old one;
     * - a stack merged onto another of the same item takes the destination's id;
     * - what a craft or a creative pick makes is a new stack, unless it lands on one of the
     *   same item, which keeps its id - three crafts onto the pointer are one stack of three;
     * - a craft spends the grid through the `CRAFTING_CONSUME_INPUT` steps that follow it, one
     *   per slot, by the amount each names;
     * - the answer lists each container the request touched, in the order it touched them,
     *   named and numbered as the request named them, and leaves out the craft's output slot.
     */
    private apply(
        request: ItemStackRequest,
        server: Server,
        player: Player,
        inventory: HumanInventory,
        craftingInput: CraftingInput,
        context: WorkstationContext
    ): ItemStackResponse {
        const open = context.session.getOpenBlockContainer();

        // The block's own slots, read lazily: most requests never go near them, and reading them
        // means reading the chunk's block entity back out of its NBT.
        let store: OpenContainerSlots | null | undefined;
        const container: OpenContainerLookup = () =>
            (store ??=
                open === undefined || !screenStoresSlots(open.screen)
                    ? null
                    : (openContainerSlots(player, blockPositionOf(open.position), open.identifier) ?? null));

        // Everything this request may change, as it stands before it runs.
        //
        // A request is all or nothing. Its steps were applied as they were read and a refusal
        // simply returned, so a request that failed on its last action kept everything the
        // earlier ones had done - while the client, which is told only that the whole request
        // failed, put all of it back. The two then disagreed for good: a plank left in the
        // crafting grid on the server and not on the screen made every later craft match
        // against a grid the player could not see and could not empty.
        const before = this.snapshot(inventory, craftingInput, open);

        // The slots the request touched, by how the client named them, in the order touched.
        const touched = new Map<string, Located>();
        const touch = (at: Located): void => {
            touched.set(`${at[2]}:${at[3]}`, at);
        };

        // What a `CREATIVE_CREATE` conjured, or what a craft yielded: a stack of this request's
        // own, held in the created output until the steps that say where it goes take it.
        let created: Item | null = null;

        // What a craft still owes the grid, by grid index, while its `CRAFTING_CONSUME_INPUT`
        // steps are paying it.
        let owed: Map<number, number> | null = null;
        const unpaid = (): boolean => owed !== null && [...owed.values()].some((due) => due > 0);

        /**
         * Refuses the request, and says why.
         *
         * A refusal is invisible from the client's side - it simply puts back what it had -
         * so without this a slot that will not budge looks the same whether the container was
         * one this server does not keep, the slot was out of range, or the action type was one
         * nothing acts on. Those want different fixes, and the log is the only place the
         * difference shows.
         */
        const deny = (reason: string): ItemStackResponse => {
            server
                .getLogger()
                .debug(`Refused item stack request ${request.requestId}: ${reason}`, 'ItemStackRequestHandler/apply');

            this.restore(before, inventory, craftingInput, open);
            // Thrown away rather than written: the block's slots are only ever read from the
            // block entity at the start of a request, so forgetting what this one did to them
            // puts the container back as it stands.
            store?.rollBack();

            return this.reject(request);
        };

        // Malformed before anything is looked at. Mojang's 2193 note lists these among what
        // its own decoder refuses: an id a client could not have made up, and a request that
        // asks for nothing. Each is still answered, so the client lets go of its prediction.
        if (!isClientRequestId(request.requestId)) {
            return deny(`request id ${request.requestId} is not a negative odd client request id`);
        }
        if (request.actions.length === 0) return deny('no actions');

        const locate = (info: ItemStackRequestSlotInfo): Located | null =>
            this.locate(info, craftingInput, open, container);
        const read = (at: Located): Item | null => this.readAt(at, inventory, craftingInput, open, container);
        const write = (at: Located, item: Item | null): void => {
            this.writeAt(at, item, inventory, craftingInput, open, container);
        };

        /** Takes `amount` off a slot, keeping what is left and its id. */
        const take = (at: Located, amount: number): boolean => {
            const held = read(at);
            if (!held || amount > held.getAmount()) return false;

            const left = held.getAmount() - amount;
            write(at, left > 0 ? held.withCount(left) : null);
            touch(at);
            return true;
        };

        /**
         * `item` as a stack of this request's own.
         *
         * Built fresh rather than handed over: the creative list and the recipe table are each
         * one set of items shared by every player, and putting one of them in an inventory would
         * give everybody the same object to mutate, stack network id and all.
         *
         * With the server's content, which is where an item reads its tags: without it a crafted
         * or picked pickaxe matched no `#minecraft:mineable/pickaxe` rule, so it did not harvest
         * stone and cracked it at a fist's pace.
         */
        const ownStack = (item: Item, count: number): Item => {
            const stack = new Item({
                runtimeId: item.getRuntimeId(),
                name: item.getName(),
                meta: item.meta,
                count,
                blockRuntimeId: item.getBlockRuntimeId(),
                content: server.getContent(),
                enchantments: item.getEnchantments(),
                customName: item.getCustomName(),
                lore: item.getLore(),
                contents: item.getContents()
            });
            stack.durability = item.getDurability();
            stack.stackNetworkId = 0;
            return stack;
        };

        // Effects stay local until every action passes. A later refusal restores the inventory
        // and must not leave the item entity that an accepted drop would have spawned.
        const requestDrops: Item[] = [];

        // A craft whose request names no slot to spend is spent by the server, from the grid it
        // matched. The retail client at 1.26.52 names each one, but nothing says every client
        // does.
        const spendsByStep = request.actions.some(
            (action) => action.type === ItemStackRequestActionType.CRAFTING_CONSUME_INPUT
        );

        try {
            for (const action of request.actions) {
                // Amount is a byte on the wire and 1 to 64 in the docs. A zero would move nothing
                // and claim a slot changed; anything above a stack is a request no client sent.
                if (action.count !== undefined && (action.count < MIN_AMOUNT || action.count > MAX_AMOUNT)) {
                    return deny(`amount ${action.count} is outside ${MIN_AMOUNT} to ${MAX_AMOUNT}`);
                }

                switch (action.type) {
                    case ItemStackRequestActionType.CREATIVE_CREATE: {
                        const picked = creativePick(server, action.creativeItemNetId!);
                        if (!picked) return deny(`no creative entry ${action.creativeItemNetId}`);

                        // A full stack, of which the steps that follow take what they name.
                        const stack = ownStack(picked, 1);
                        created = stack.withCount(stack.getMaxAmount());
                        break;
                    }

                    case ItemStackRequestActionType.TAKE:
                    case ItemStackRequestActionType.PLACE: {
                        // What a creative pick or a craft made is in the created output, which the
                        // client numbers 50, and only a step naming it as the source takes from it.
                        // A step naming a grid slot moves what is in that slot, not the result.
                        if (action.source!.container.containerId === ContainerUiId.CREATED_OUTPUT) {
                            if (!created) return deny('the created output holds nothing');

                            // Where it lands is usually the pointer, not a slot, because that is
                            // what dragging one out of the menu means.
                            const to = locate(action.destination!);
                            if (!to) {
                                return deny(
                                    `what was made has nowhere to land: container ${action.destination!.container.containerId} slot ${action.destination!.slotId}`
                                );
                            }

                            if (open !== undefined && to[0] === BLOCK_CONTAINER && isTakeOnlySlot(open.screen, to[1])) {
                                return deny(`slot ${to[1]} of a ${WindowTypes[open.screen]} only ever gives items out`);
                            }

                            const amount = Math.min(action.count ?? created.getAmount(), created.getAmount());
                            const held = read(to);

                            if (held && !sameItem(held, created)) return deny(`${to[2]}/${to[3]} holds something else`);

                            if (held) {
                                // Added to what is there, not written over it: crafting twice onto
                                // the same slot replaced the first four planks with the second four.
                                // The stack keeps its id, so three crafts onto the pointer are one
                                // stack of three.
                                if (held.getAmount() + amount > held.getMaxAmount()) {
                                    return deny(`${to[2]}/${to[3]} has no room for ${amount}`);
                                }
                                write(to, held.withCount(held.getAmount() + amount));
                            } else {
                                write(to, amount === created.getAmount() ? created : splitOff(created, amount));
                            }

                            // What the step did not take stays, for a later step to place.
                            created =
                                amount < created.getAmount() ? created.withCount(created.getAmount() - amount) : null;
                            touch(to);
                            break;
                        }

                        const moved = this.moveBetween(
                            action.source!,
                            action.destination!,
                            inventory,
                            craftingInput,
                            action.count,
                            open,
                            container
                        );
                        if (!moved)
                            return deny(
                                `cannot move ${action.source!.container.containerId}/${action.source!.slotId} -> ${action.destination!.container.containerId}/${action.destination!.slotId}`
                            );

                        for (const at of moved) touch(at);
                        break;
                    }

                    case ItemStackRequestActionType.SWAP: {
                        // Located rather than read as two inventory slots: a swap is how a player
                        // trades the stack on the pointer for the one in a chest, and reading both
                        // ends as inventory indices refused every swap that named anything else.
                        const first = locate(action.source!);
                        const second = locate(action.destination!);
                        if (first === null || second === null)
                            return deny(
                                `cannot swap ${action.source!.container.containerId}/${action.source!.slotId} <-> ${action.destination!.container.containerId}/${action.destination!.slotId}`
                            );

                        const takeOnly =
                            open !== undefined &&
                            ((first[0] === BLOCK_CONTAINER && isTakeOnlySlot(open.screen, first[1])) ||
                                (second[0] === BLOCK_CONTAINER && isTakeOnlySlot(open.screen, second[1])));
                        if (takeOnly) return deny(`a ${WindowTypes[open!.screen]} output slot takes nothing`);

                        // Each stack keeps its id: both move whole.
                        const held = read(first);
                        write(first, read(second));
                        write(second, held);
                        touch(first);
                        touch(second);
                        break;
                    }

                    case ItemStackRequestActionType.DROP:
                    case ItemStackRequestActionType.DESTROY: {
                        // Located rather than looked up as an inventory slot: throwing away what
                        // is on the pointer is the ordinary way to get rid of a creative pick,
                        // and refusing it leaves the stack stuck to the mouse.
                        const from = locate(action.source!);
                        if (!from)
                            return deny(
                                `cannot drop from ${action.source!.container.containerId}/${action.source!.slotId}`
                            );

                        const held = read(from);
                        if (!held) return deny(`nothing to drop in ${from[2]}/${from[3]}`);

                        // As many as the step names. What stays behind keeps its id, while the
                        // split drop is a fresh stack. Destroy consumes the same amount without
                        // creating a world item.
                        const amount = action.count ?? held.getAmount();
                        if (amount > held.getAmount()) return deny(`${from[2]}/${from[3]} holds fewer than ${amount}`);
                        if (!take(from, amount)) return deny(`cannot remove ${amount} from ${from[2]}/${from[3]}`);
                        if (action.type === ItemStackRequestActionType.DROP) requestDrops.push(splitOff(held, amount));
                        break;
                    }

                    case ItemStackRequestActionType.CRAFTING_RECIPE:
                    case ItemStackRequestActionType.CRAFTING_RECIPE_AUTO: {
                        // An open enchanting table takes this action first, and the number is
                        // not a recipe: it is the `enchantNetId` of the row the player clicked,
                        // which is the only thing the client has to name a row by. Checked
                        // against the open window rather than against the number, because a
                        // recipe with net id 1 exists and an enchant option with net id 1 is
                        // not it.
                        if (open?.screen === WindowTypes.ENCHANTMENT) {
                            const enchanted = takeEnchantOption(player, open, action.recipeNetId ?? 0);
                            if (enchanted === undefined) return deny('the enchanting table refused the row');

                            // Left for the `TAKE` that follows to place, the same way a creative
                            // pick is: the client names where it goes, not the server. A new
                            // stack per use, so it is this request's own already.
                            created = enchanted.stack;
                            touch([WORKSTATION, WORKSTATION_ITEM, workstationContainerId(open, WORKSTATION_ITEM), 0]);
                            break;
                        }

                        // A craft whose steps have not paid for it yet does not start another:
                        // the first result would be taken for nothing.
                        if (unpaid()) return deny('a craft began before the last one was paid for');

                        const recipeNetId = action.recipeNetId;
                        if (!Number.isSafeInteger(recipeNetId) || recipeNetId === undefined || recipeNetId < 1) {
                            return deny(`invalid recipe net id ${recipeNetId}`);
                        }

                        // The client says which recipe it believes it is making. The content
                        // recipe ids are the ids sent in CraftingDataPacket; when that payload
                        // exists, use its Java recipe book and validate the exact recipe against
                        // the grid. The older manager is the source only when the content
                        // payload could not be built and sendCraftingData used that list instead.
                        const crafts = action.repetitions ?? 1;
                        if (!Number.isSafeInteger(crafts) || crafts < 1) return deny(`invalid craft count ${crafts}`);

                        const payloads = joinContentPayloads(server.getContent(), server.getLogger());
                        let recipeId: string;
                        let output: Item;
                        let cost: Map<number, number>;
                        const ingredients: Item[] = [];

                        if (payloads !== undefined) {
                            const advertised = [...payloads.crafting.shaped, ...payloads.crafting.shapeless].find(
                                (candidate) => candidate.netId === recipeNetId
                            );
                            if (advertised === undefined)
                                return deny(`no advertised recipe with net id ${recipeNetId}`);

                            const content = server.getContent();
                            const recipe = content.recipes.get(advertised.id);
                            if (recipe === undefined || content.recipes.netIds.get(advertised.id) !== recipeNetId) {
                                return deny(`no Java recipe for advertised net id ${recipeNetId}`);
                            }

                            const grid = craftingInput.toGrid(craftingInput.gridSize());
                            const slots: (RecipeItemStack | null)[] = [];
                            for (let y = 0; y < grid.height; y++) {
                                for (let x = 0; x < grid.width; x++) {
                                    const stack = grid.at(x, y);
                                    if (stack === null || stack.getName() === 'minecraft:air') {
                                        slots.push(null);
                                        continue;
                                    }

                                    const javaStack = javaStackOf(stack);
                                    if (javaStack === undefined) {
                                        return deny(`crafting slot ${y * grid.width + x} has no Java item mapping`);
                                    }
                                    slots.push(javaStack);
                                }
                            }

                            const matched = content.recipes
                                .matchAll({
                                    station: 'crafting',
                                    grid: { width: grid.width, height: grid.height, slots }
                                })
                                .find((candidate) => candidate.recipe.id === recipe.id);
                            if (matched === undefined)
                                return deny(`the grid does not make advertised recipe ${recipe.id}`);

                            const advertisedOutput = advertised.outputs[0];
                            if (advertisedOutput === undefined)
                                return deny(`the advertised recipe ${recipe.id} has no output`);
                            const recipeOutput = bedrockRecipeResult(matched.result.id, advertisedOutput, server);
                            if (recipeOutput === undefined)
                                return deny(`the result of ${recipe.id} has no Bedrock item mapping`);

                            recipeId = recipe.id;
                            output = recipeOutput;
                            cost = new Map<number, number>();
                            matched.consumed.forEach((count, slot) => {
                                if (count > 0) cost.set(slot, count * crafts);
                            });
                            for (const [slot, amount] of cost) {
                                const stack = craftingInput.get(slot);
                                if (stack === null) return deny(`crafting slot ${slot} is empty`);
                                if (stack.getAmount() < amount) {
                                    return deny(
                                        `crafting slot ${craftingInput.wireSlotOf(slot)} holds fewer than ${amount}`
                                    );
                                }
                                ingredients.push(stack);
                            }
                        } else {
                            const recipe = server.getRecipeManager().getByNetId(recipeNetId);
                            if (!recipe) return deny(`no recipe with net id ${recipeNetId}`);

                            const station = server.getStationRegistry().get(recipe.station);
                            if (!station) return deny(`no station for recipe ${action.recipeNetId}`);

                            const grid = craftingInput.toGrid(craftingInput.gridSize());
                            const matched = station.match(grid);
                            if (matched !== recipe) {
                                const held = Array.from({ length: grid.width * grid.height }, (_, index) =>
                                    grid.at(index % grid.width, Math.floor(index / grid.width))
                                )
                                    .map((item) => item?.getName().replace('minecraft:', '') ?? '-')
                                    .join(' ');

                                return deny(
                                    `the grid does not make ${recipe.id}: ${grid.width}x${grid.height} holding [${held}], ` +
                                        `matched ${matched?.id ?? 'nothing'}`
                                );
                            }

                            const recipeOutput = recipe.getOutputs()[0];
                            if (!recipeOutput) return deny('the recipe yields nothing');

                            recipeId = recipe.id;
                            output = recipeOutput;
                            cost = new Map();
                            for (let slot = 0; slot < CraftingInput.SLOTS; slot++) {
                                const stack = craftingInput.get(slot);
                                if (stack === null || stack.getName() === 'minecraft:air') continue;
                                cost.set(slot, crafts);
                                ingredients.push(stack);
                            }
                        }

                        created = ownStack(output, output.getAmount() * crafts);

                        if (spendsByStep) {
                            // Spent by the `CRAFTING_CONSUME_INPUT` steps that follow, and checked
                            // against this once they have run.
                            owed = cost;
                        } else {
                            for (const [slot, amount] of cost) {
                                const at: Located = [
                                    ContainerUiId.CRAFTING_INPUT,
                                    slot,
                                    ContainerUiId.CRAFTING_INPUT,
                                    craftingInput.wireSlotOf(slot)
                                ];
                                if (!take(at, amount)) return deny(`crafting slot ${at[3]} holds fewer than ${amount}`);
                            }
                        }

                        advancementItemCrafted(player, recipeId, ingredients, created);
                        break;
                    }

                    case ItemStackRequestActionType.CRAFTING_CONSUME_INPUT: {
                        // What the craft costs, spent one step per slot by the amount the client
                        // names, as a Bedrock Dedicated Server does. The retail client sends these
                        // for a craft in the inventory's grid and at a table alike.
                        //
                        // Each is held to what the craft owes that slot, so no step spends more
                        // than the recipe asks, and a request whose steps spend less is refused
                        // once they have all run.
                        const from = locate(action.source!);
                        if (from === null || from[0] !== ContainerUiId.CRAFTING_INPUT)
                            return deny(
                                `not a crafting slot: ${action.source!.container.containerId}/${action.source!.slotId}`
                            );
                        if (owed === null) return deny(`crafting slot ${from[3]} spent with nothing being crafted`);

                        const amount = action.count ?? 1;
                        const due = owed.get(from[1]) ?? 0;
                        if (amount > due) return deny(`crafting slot ${from[3]} owes ${due}, not ${amount}`);
                        if (!take(from, amount)) return deny(`cannot spend ${amount} from crafting slot ${from[3]}`);

                        owed.set(from[1], due - amount);
                        break;
                    }

                    case ItemStackRequestActionType.CRAFTING_RECIPE_OPTIONAL: {
                        // The anvil and the cartography table, which is where a player types a
                        // name. The text rides in `Strings To Filter`; the action's repetition
                        // count is the index into it.
                        if (open?.screen !== WindowTypes.ANVIL) return deny('no anvil is open');

                        const typed = request.filterStrings[action.repetitions ?? 0];
                        const result = takeAnvilResult(player, open, typed === '' ? undefined : typed);
                        if (result === undefined) return deny('the anvil refused the combination');

                        created = result.stack;
                        for (const slot of [WORKSTATION_ITEM, WORKSTATION_MATERIAL]) {
                            touch([WORKSTATION, slot, workstationContainerId(open, slot), 0]);
                        }
                        break;
                    }

                    case ItemStackRequestActionType.CRAFTING_CREATE_SPECIFIC_RESULT:
                        // Which of several results was picked. Nothing here makes more than one.
                        break;

                    case ItemStackRequestActionType.CRAFTING_RESULTS_DEPRECATED:
                        // The client restating what it expects, after the fact. Nothing to do.
                        break;

                    case ItemStackRequestActionType.MINE_BLOCK:
                        // Nothing to move: the break itself is handled where the block is.
                        break;

                    default:
                        // Beacons, looms and the rest - read so the packet stays aligned, refused
                        // because acting on half of one would be worse than not acting.
                        return deny(`action type ${action.type} is not acted on`);
                }
            }
        } catch (error) {
            // A step that throws is still a refusal, not a request left hanging. Unanswered,
            // the client keeps its prediction for a move the server never made.
            return deny(`a step threw: ${error instanceof Error ? error.message : String(error)}`);
        }

        // A craft whose steps spent less than it costs would hand the result over for less.
        if (unpaid()) return deny('the craft was not paid for in full');

        // Written back only now, because everything up to here could still have been refused and
        // a refusal has to leave the block holding what it held.
        store?.commit();
        context.drops.push(...requestDrops);

        for (const [kept, index] of touched.values()) {
            if (kept === WORKSTATION) context.changed.add(index);
            else if (kept === BLOCK_CONTAINER) context.containerChanged.add(index);
        }

        // Grouped by container in the order each was first touched, and each container's slots
        // in the order they were. Only containers something changed in are named, and the
        // created output never is: nothing stores it, and BDS leaves it out.
        const containers = new Map<number, ItemStackResponseContainerInfo>();
        for (const at of touched.values()) {
            const info = containers.get(at[2]) ?? { container: { containerId: at[2], dynamicId: null }, slots: [] };
            info.slots.push(this.describe(at[3], read(at), inventory));
            containers.set(at[2], info);
        }

        return {
            result: ItemStackResponseResult.OK,
            requestId: request.requestId,
            containers: [...containers.values()]
        };
    }

    /**
     * Everything one request may change, copied.
     *
     * The entries are copied rather than referenced: `addItem` raises the count on an entry
     * in place, so holding the same objects would record the change as it happened and give
     * nothing to go back to.
     */
    private snapshot(inventory: HumanInventory, craftingInput: CraftingInput, open?: OpenBlockContainer) {
        const copy = (entries: ContainerEntry[]) =>
            entries.map((entry) => new ContainerEntry({ item: entry.getItem(), count: entry.getCount() }));

        return {
            slots: copy(inventory.getItems(true)),
            // What is worn, so a refused request does not leave a helmet the client has already
            // put back in the inventory.
            armor: copy(inventory.getArmor().getItems(true)),
            offhand: copy(inventory.getOffhand().getItems(true)),
            cursor: inventory.getCursor(),
            grid: Array.from({ length: CraftingInput.SLOTS }, (_, slot) => craftingInput.get(slot)),
            gridSize: craftingInput.gridSize(),
            // The open workstation's two slots, so a refused request does not leave a stack in
            // the table that the client has already put back in the inventory.
            inputs: open === undefined ? [] : [...open.inputs]
        };
    }

    /** Puts back what {@link ItemStackRequestHandler.snapshot} recorded. */
    private restore(
        before: ReturnType<ItemStackRequestHandler['snapshot']>,
        inventory: HumanInventory,
        craftingInput: CraftingInput,
        open?: OpenBlockContainer
    ): void {
        inventory.setItems(before.slots);
        inventory.getArmor().setItems(before.armor);
        inventory.getOffhand().setItems(before.offhand);
        inventory.setCursor(before.cursor);

        for (const [slot, item] of before.grid.entries()) craftingInput.set(slot, item);
        craftingInput.useGrid(before.gridSize);

        if (open !== undefined) for (const [slot, item] of before.inputs.entries()) open.inputs[slot] = item;
    }

    private reject(request: ItemStackRequest): ItemStackResponse {
        return { result: ItemStackResponseResult.ERROR, requestId: request.requestId, containers: [] };
    }

    /**
     * The inventory index a slot names, or `null` for a container this does not keep.
     *
     * The slot id arrives off the wire, so it is checked against the inventory rather than
     * trusted as an index into it.
     */
    private slotOf(info: ItemStackRequestSlotInfo): number | null {
        if (!PLAYER_CONTAINERS.has(info.container.containerId)) return null;
        if (!Number.isInteger(info.slotId) || info.slotId < 0 || info.slotId >= 36) return null;

        return info.slotId;
    }

    /**
     * The crafting slot a request names, or `null` for another container.
     *
     * Separate from {@link slotOf} because these are a different store: slot 3 of the
     * crafting grid and slot 3 of the inventory are not the same place, and conflating them
     * would let a request empty the wrong one.
     */
    private craftingSlotOf(info: ItemStackRequestSlotInfo, craftingInput: CraftingInput): number | null {
        if (info.container.containerId !== ContainerUiId.CRAFTING_INPUT) return null;

        // The client does not number these from zero - the inventory's four are 28 to 31 and
        // a table's nine are 32 to 40 - so they are mapped, not taken at face value. Taken at
        // face value every one of them was out of range, and nothing could be crafted at all.
        const located = CraftingInput.locate(info.slotId);
        if (!located) return null;

        // Which grid the client reached into is stated by the numbers it used, so matching
        // no longer has to infer the square from how full it is.
        craftingInput.useGrid(located.size);

        return located.index;
    }

    /**
     * Moves a stack between two slots, either of which may be the crafting grid.
     *
     * Written as one operation over both stores rather than one per store, because a move
     * out of the inventory and into the grid is the ordinary case - it is how anything gets
     * crafted - and treating the two as separate worlds would make it the awkward one.
     * @returns the slots it touched, source first, or `null` if either end names a container
     * this does not keep.
     */
    private moveBetween(
        from: ItemStackRequestSlotInfo,
        to: ItemStackRequestSlotInfo,
        inventory: HumanInventory,
        craftingInput: CraftingInput,
        count?: number,
        open?: OpenBlockContainer,
        container: OpenContainerLookup = () => null
    ): Located[] | null {
        const source = this.locate(from, craftingInput, open, container);
        const destination = this.locate(to, craftingInput, open, container);
        if (!source || !destination) return null;

        // A furnace's output holds what the smelt produced, so vanilla refuses anything dropped
        // onto it. Taking from it is the ordinary way to empty a furnace and stays allowed.
        if (open !== undefined && destination[0] === BLOCK_CONTAINER && isTakeOnlySlot(open.screen, destination[1])) {
            return null;
        }

        const read = (at: Located): Item | null => this.readAt(at, inventory, craftingInput, open, container);
        const write = (at: Located, item: Item | null): void => {
            this.writeAt(at, item, inventory, craftingInput, open, container);
        };

        const moving = read(source);
        if (!moving) return null;

        // How many, not "all of them". Every move took the whole stack and emptied the source,
        // so dragging with the right button - which is one item per slot, and how a crafting
        // grid gets filled - put the entire stack in the first slot it touched and left
        // nothing for the rest of the drag.
        const amount = Math.min(Math.max(1, count ?? moving.getAmount()), moving.getAmount());
        const left = moving.getAmount() - amount;
        const held = read(destination);

        if (held && !sameItem(held, moving)) {
            // Two different things: they trade places, and only when the whole stack goes. Each
            // moves whole, so each keeps its id.
            if (amount !== moving.getAmount()) return null;

            write(destination, moving);
            write(source, held);

            return [source, destination];
        }

        if (held) {
            const room = held.getMaxAmount() - held.getAmount();
            const moved = Math.min(room, amount);
            if (moved <= 0) return null;

            // Copies at the new sizes rather than counts changed in place, because the same
            // object may be held elsewhere. `withCount` keeps the rest of the stack: rebuilt from
            // its name, a moved stack lost its enchantments, durability, name and content. It
            // keeps the id too, so the stack merged onto keeps its own and what is left of the
            // source keeps the source's.
            write(destination, held.withCount(held.getAmount() + moved));
            const remaining = moving.getAmount() - moved;
            write(source, remaining > 0 ? moving.withCount(remaining) : null);

            return [source, destination];
        }

        // The whole stack keeps its id wherever it goes. A part is a new stack, and what is left
        // behind keeps the old id.
        write(destination, amount === moving.getAmount() ? moving : splitOff(moving, amount));
        write(source, left > 0 ? moving.withCount(left) : null);

        return [source, destination];
    }

    /**
     * One slot of whichever store a request names, or null when the slot is out of range.
     *
     * Shared by the move, the swap and the creative pick so that all three reach the same
     * stores: before this the swap read both ends as inventory indices and refused anything
     * else, which is why a stack could not be swapped with one in a chest.
     */
    private readAt(
        at: Located,
        inventory: HumanInventory,
        craftingInput: CraftingInput,
        open: OpenBlockContainer | undefined,
        container: OpenContainerLookup
    ): Item | null {
        if (at[0] === WORKSTATION) return open?.inputs[at[1]] ?? null;
        if (at[0] === BLOCK_CONTAINER) return container()?.get(at[1]) ?? null;
        if (at[0] === ContainerUiId.CRAFTING_INPUT) return craftingInput.get(at[1]);
        if (at[0] === ContainerUiId.CURSOR) return inventory.getCursor();
        if (at[0] === ContainerUiId.ARMOR_CONTAINER || at[0] === ContainerUiId.OFFHAND) {
            const worn = at[0] === ContainerUiId.ARMOR_CONTAINER ? inventory.getArmor() : inventory.getOffhand();
            return worn.isEmpty(at[1]) ? null : worn.getItem(at[1]);
        }

        return this.itemOrNull(inventory, at[1]);
    }

    /** The counterpart to {@link ItemStackRequestHandler.readAt}: `null` empties the slot. */
    private writeAt(
        at: Located,
        item: Item | null,
        inventory: HumanInventory,
        craftingInput: CraftingInput,
        open: OpenBlockContainer | undefined,
        container: OpenContainerLookup
    ): void {
        if (at[0] === WORKSTATION) {
            if (open !== undefined) open.inputs[at[1]] = item;
        } else if (at[0] === BLOCK_CONTAINER) container()?.set(at[1], item);
        else if (at[0] === ContainerUiId.CRAFTING_INPUT) craftingInput.set(at[1], item);
        else if (at[0] === ContainerUiId.CURSOR) inventory.setCursor(item);
        else if (at[0] === ContainerUiId.ARMOR_CONTAINER || at[0] === ContainerUiId.OFFHAND) {
            const worn = at[0] === ContainerUiId.ARMOR_CONTAINER ? inventory.getArmor() : inventory.getOffhand();
            if (item) worn.setItem(at[1], new ContainerEntry({ item, count: item.getAmount() }));
            else worn.removeItem(at[1]);
        } else if (item) inventory.setItem(at[1], new ContainerEntry({ item, count: item.getAmount() }));
        else inventory.removeItem(at[1]);
    }

    /** Which store and which slot a request names, with the names it used, or `null` for neither. */
    private locate(
        info: ItemStackRequestSlotInfo,
        craftingInput: CraftingInput,
        open?: OpenBlockContainer,
        container: OpenContainerLookup = () => null
    ): Located | null {
        const named = (store: number, index: number): Located => [
            store,
            index,
            info.container.containerId,
            info.slotId
        ];

        // Before the crafting grid, because an anvil's input container is id 0 and a bare
        // number says nothing about which screen it belongs to: the open window does.
        const workstation = workstationSlotOf(open, info.container.containerId);
        if (workstation !== null) return named(WORKSTATION, workstation);

        // Before the rest for the same reason: a furnace numbers its fuel slot 24, which is no
        // container of the player's, and only the open screen says what 24 means.
        if (open !== undefined && screenStoresSlots(open.screen)) {
            const held = container();
            const slot =
                held === null ? null : blockSlotOf(open.screen, info.container.containerId, info.slotId, held.size);
            if (slot !== null) return named(BLOCK_CONTAINER, slot);
        }

        const crafting = this.craftingSlotOf(info, craftingInput);
        if (crafting !== null) return named(ContainerUiId.CRAFTING_INPUT, crafting);

        // One slot, and the slot id is not worth checking: the client numbers it zero and
        // there is nowhere else for it to be.
        if (info.container.containerId === ContainerUiId.CURSOR) return named(ContainerUiId.CURSOR, 0);

        // Four slots the client numbers itself, head to feet. Trusted only within that range: a
        // slot outside it would write past the end of the container.
        if (info.container.containerId === ContainerUiId.ARMOR_CONTAINER) {
            return info.slotId >= 0 && info.slotId < ARMOR_SLOTS
                ? named(ContainerUiId.ARMOR_CONTAINER, info.slotId)
                : null;
        }

        // One slot, which the client numbers 1. Zero is read as the same slot, since there is
        // no other one it could mean.
        if (info.container.containerId === ContainerUiId.OFFHAND) {
            return info.slotId === 0 || info.slotId === 1 ? named(ContainerUiId.OFFHAND, 0) : null;
        }

        const inventory = this.slotOf(info);

        return inventory === null ? null : named(ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, inventory);
    }

    /** An inventory slot's item, with the empty one reported as empty rather than as air. */
    private itemOrNull(inventory: HumanInventory, slot: number): Item | null {
        const item = inventory.getItem(slot);

        return item.getName() === 'minecraft:air' ? null : item;
    }

    /**
     * One slot as the answer gives it: how many, and the stack's network id, or 0 for none.
     *
     * The id is the player's own. A stack that has one keeps it, and a new stack is given one
     * the first time an answer names it. A block's slots are read back out of its block entity
     * for every request and the entity keeps no ids, so a stack in a chest is given a fresh one
     * each time an answer names it.
     */
    private describe(slot: number, item: Item | null, inventory: HumanInventory): ItemStackResponseSlotInfo {
        return {
            slot,
            count: item?.getAmount() ?? 0,
            itemStackId: item ? inventory.assignStackNetworkId(item) : 0,
            customName: '',
            durabilityCorrection: 0
        };
    }
}
