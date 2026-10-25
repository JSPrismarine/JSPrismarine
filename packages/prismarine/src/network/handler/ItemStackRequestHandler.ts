import { WindowTypes } from '@jsprismarine/minecraft';

import type { PlayerSession } from '../../';
import type Player from '../../Player';
import type Server from '../../Server';
import { advancementItemCrafted } from '../../advancement/triggers';
import CraftingInput from '../../crafting/CraftingInput';
import ContainerEntry from '../../inventory/ContainerEntry';
import type HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
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
 * Stack ids handed out to the client.
 *
 * The client matches a slot to the stack the server says is in it, so the number only has to
 * be positive and never reused. Counting up is enough, and shared across players because
 * uniqueness costs nothing extra that way.
 */
let nextStackId = 1;

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

    // The registry's number as the legacy id, which is what `getNetworkId`
    // falls back to for a name the committed item table does not have. That
    // is how a pack's own item reaches the wire at all.
    return new Item({ id: picked.runtimeId, name: picked.name, meta: picked.meta });
};

/**
 * The store id {@link ItemStackRequestHandler.locate} answers with for a workstation slot.
 *
 * Negative on purpose: every `ContainerUiId` is zero or above, and an anvil's input container
 * is id 0, so a tagged value is the only thing that tells the two apart.
 */
const WORKSTATION = -1;

/** What one request may reach into besides the player's own containers. */
interface WorkstationContext {
    readonly session: PlayerSession;
    /** Workstation slots the whole packet changed, so the table's rows can be redrawn once. */
    readonly changed: Set<number>;
}

/** Amount, as the docs bound it: a request moves between one item and a full stack of 64. */
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 64;

/**
 * Whether an id is one a client makes up: negative and odd. A positive value is a stack id
 * the server handed out and a negative even one is a legacy request id, so either in this
 * position is a request from something other than the game client.
 */
const isClientRequestId = (id: number): boolean => Number.isInteger(id) && id < 0 && id % 2 !== 0;

export default class ItemStackRequestHandler implements PacketHandler<ItemStackRequestPacket> {
    public static NetID = Identifiers.ItemStackRequestPacket;

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

        // What the client actually asked for, by name.
        //
        // Worth a line of its own: what a client sends for a given gesture is not written down
        // anywhere, and guessing at it from the outside has been wrong more than once here -
        // a craft in the inventory sends no `CRAFTING_CONSUME_INPUT`, which no amount of
        // reading another server's source would have revealed.
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

        // Grid slots that actually changed, gathered across the whole packet so they can be
        // told to the client afterwards - see `PlayerSession.sendCraftingSlot` for why the
        // response alone cannot carry them.
        const craftingChanged = new Set<number>();

        // The workstation input slots a request moved something into or out of, for the same
        // reason the grid slots are gathered: the table's offers depend on what is in it.
        const workstationChanged = new Set<number>();

        const response = new ItemStackResponsePacket();
        response.responses = packet.requests.map((request) =>
            this.apply(request, server, player, inventory, craftingInput, craftingChanged, {
                session,
                changed: workstationChanged
            })
        );

        await session.send(response);

        for (const slot of craftingChanged) {
            await session.sendCraftingSlot(craftingInput.wireSlotOf(slot), craftingInput.get(slot));
        }

        // Redrawn whenever the item in the table changed, which is what `showEnchantingTable`
        // says it has to be called for: the three rows are a function of the stack.
        const open = session.getOpenBlockContainer();
        if (open !== undefined && open.screen === WindowTypes.ENCHANTMENT && workstationChanged.size > 0) {
            await refreshEnchantOptions(player, open);
        }
    }

    /** Runs one request's steps, and describes the slots they left behind. */
    private apply(
        request: ItemStackRequest,
        server: Server,
        player: Player,
        inventory: HumanInventory,
        craftingInput: CraftingInput,
        craftingChanged: Set<number>,
        context: WorkstationContext
    ): ItemStackResponse {
        const touched = new Set<number>();
        const craftingTouched = new Set<number>();
        const workstationTouched = new Set<number>();
        let cursorTouched = false;

        const open = context.session.getOpenBlockContainer();

        // Everything this request may change, as it stands before it runs.
        //
        // A request is all or nothing. Its steps were applied as they were read and a refusal
        // simply returned, so a request that failed on its last action kept everything the
        // earlier ones had done - while the client, which is told only that the whole request
        // failed, put all of it back. The two then disagreed for good: a plank left in the
        // crafting grid on the server and not on the screen made every later craft match
        // against a grid the player could not see and could not empty.
        const before = this.snapshot(inventory, craftingInput, open);

        // What a `CREATIVE_CREATE` conjured, or what a matched recipe yielded: either way,
        // something waiting for the step that says where it goes.
        let created: Item | null = null;

        /**
         * Whether {@link created} is an object somebody else is also holding.
         *
         * The creative menu and the recipe table are each one set of items shared by every
         * player, so what lands in a slot from those has to be a fresh stack. A workstation
         * result is not: the enchanting table and the anvil build a new stack per use, and
         * rebuilding it from its name would throw away the enchantments that are the whole
         * point of taking it.
         */
        let createdIsShared = true;

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

            return this.reject(request);
        };

        // Malformed before anything is looked at. Mojang's 2193 note lists these among what
        // its own decoder refuses: an id a client could not have made up, and a request that
        // asks for nothing. Each is still answered, so the client lets go of its prediction.
        if (!isClientRequestId(request.requestId)) {
            return deny(`request id ${request.requestId} is not a negative odd client request id`);
        }
        if (request.actions.length === 0) return deny('no actions');

        try {
            for (const action of request.actions) {
                // Amount is a byte on the wire and 1 to 64 in the docs. A zero would move nothing
                // and claim a slot changed; anything above a stack is a request no client sent.
                if (action.count !== undefined && (action.count < MIN_AMOUNT || action.count > MAX_AMOUNT)) {
                    return deny(`amount ${action.count} is outside ${MIN_AMOUNT} to ${MAX_AMOUNT}`);
                }

                switch (action.type) {
                    case ItemStackRequestActionType.CREATIVE_CREATE: {
                        created = creativePick(server, action.creativeItemNetId!);
                        if (!created) return deny(`no creative entry ${action.creativeItemNetId}`);
                        break;
                    }

                    case ItemStackRequestActionType.TAKE:
                    case ItemStackRequestActionType.PLACE: {
                        if (created) {
                            // A creative pick: the source is the menu, which holds nothing to
                            // take from, so the conjured stack simply lands - and where it lands
                            // is usually the pointer, not a slot, because that is what dragging
                            // one out of the menu means.
                            const to = this.locate(action.destination!, craftingInput, open);
                            if (!to)
                                return deny(
                                    `creative pick has nowhere to land: container ${action.destination!.container.containerId} slot ${action.destination!.slotId}`
                                );

                            // Built fresh rather than handed over: the creative list is one set
                            // of items shared by every player, and putting one of them in an
                            // inventory would give everybody the same object to mutate. See
                            // `createdIsShared` for the case where that does not apply.
                            const count = createdIsShared ? (action.count ?? 1) : created.getAmount();
                            const stack = createdIsShared
                                ? new Item({
                                      id: created.getId(),
                                      name: created.getName(),
                                      meta: created.meta,
                                      count
                                  })
                                : created;

                            if (to[0] === WORKSTATION) {
                                if (open !== undefined) open.inputs[to[1]] = stack;
                                workstationTouched.add(to[1]);
                            } else if (to[0] === ContainerUiId.CURSOR) {
                                inventory.setCursor(stack);
                                cursorTouched = true;
                            } else if (to[0] === ContainerUiId.CRAFTING_INPUT) {
                                craftingInput.set(to[1], stack);
                                craftingTouched.add(to[1]);
                            } else {
                                // Added to what is there when it is the same thing, not written
                                // over it: crafting twice onto the same slot replaced the first
                                // four planks with the second four, and a creative pick dropped
                                // onto an occupied slot destroyed what it landed on.
                                //
                                // Known gap: what will not fit in the slot is capped away rather
                                // than carried to the next free one. The request named one
                                // destination slot, and spilling into a slot the client did not
                                // name means answering for a slot the client is not expecting -
                                // which needs the response to describe both, so it is left until
                                // the response is built from what changed rather than from what
                                // was asked for.
                                const held = inventory.getEntry(to[1]);
                                const sameThing =
                                    held !== null &&
                                    held.getItem().getName() === stack.getName() &&
                                    held.getItem().getName() !== 'minecraft:air' &&
                                    held.getItem().meta === stack.meta;

                                if (sameThing) {
                                    held.setCount(Math.min(stack.getMaxAmount(), held.getCount() + count));
                                } else {
                                    inventory.setItem(to[1], new ContainerEntry({ item: stack, count }));
                                }

                                touched.add(to[1]);
                            }

                            created = null;
                            createdIsShared = true;
                            break;
                        }

                        const moved = this.moveBetween(
                            action.source!,
                            action.destination!,
                            inventory,
                            craftingInput,
                            action.count,
                            open
                        );
                        if (!moved)
                            return deny(
                                `cannot move ${action.source!.container.containerId}/${action.source!.slotId} -> ${action.destination!.container.containerId}/${action.destination!.slotId}`
                            );

                        for (const [container, slot] of moved) {
                            if (container === WORKSTATION) workstationTouched.add(slot);
                            else if (container === ContainerUiId.CURSOR) cursorTouched = true;
                            else if (container === ContainerUiId.CRAFTING_INPUT) craftingTouched.add(slot);
                            else touched.add(slot);
                        }
                        break;
                    }

                    case ItemStackRequestActionType.SWAP: {
                        const first = this.slotOf(action.source!);
                        const second = this.slotOf(action.destination!);
                        if (first === null || second === null)
                            return deny(
                                `cannot swap ${action.source!.container.containerId}/${action.source!.slotId} <-> ${action.destination!.container.containerId}/${action.destination!.slotId}`
                            );

                        const held = inventory.getItem(first);
                        inventory.setItem(first, new ContainerEntry({ item: inventory.getItem(second) }));
                        inventory.setItem(second, new ContainerEntry({ item: held }));
                        touched.add(first).add(second);
                        break;
                    }

                    case ItemStackRequestActionType.DROP:
                    case ItemStackRequestActionType.DESTROY: {
                        // Known gap: a Drop takes the stack out of the inventory but puts nothing
                        // on the ground, so the two act alike where only Destroy should discard.
                        // Spawning the entity needs `World.dropContents`, which is async, and this
                        // whole method is synchronous so that a refusal can roll the request back
                        // before anything else has run. A drop would have to be collected here and
                        // made after the request is answered.
                        //
                        // Located rather than looked up as an inventory slot: throwing away what
                        // is on the pointer is the ordinary way to get rid of a creative pick,
                        // and refusing it leaves the stack stuck to the mouse.
                        const from = this.locate(action.source!, craftingInput, open);
                        if (!from)
                            return deny(
                                `cannot drop from ${action.source!.container.containerId}/${action.source!.slotId}`
                            );

                        if (from[0] === WORKSTATION) {
                            if (open !== undefined) open.inputs[from[1]] = null;
                            workstationTouched.add(from[1]);
                        } else if (from[0] === ContainerUiId.CURSOR) {
                            inventory.setCursor(null);
                            cursorTouched = true;
                        } else if (from[0] === ContainerUiId.CRAFTING_INPUT) {
                            craftingInput.set(from[1], null);
                            craftingTouched.add(from[1]);
                        } else {
                            inventory.removeItem(from[1]);
                            touched.add(from[1]);
                        }
                        break;
                    }

                    case ItemStackRequestActionType.CRAFTING_RECIPE: {
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
                            // pick is: the client names where it goes, not the server.
                            created = enchanted.stack;
                            createdIsShared = false;
                            workstationTouched.add(WORKSTATION_ITEM);
                            break;
                        }

                        // The client says which recipe it believes it is making. Believing it
                        // would let a player craft anything by naming its number, so the grid is
                        // matched against that recipe before anything is handed over.
                        const recipe = server.getRecipeManager().getByNetId(action.recipeNetId!);
                        if (!recipe) return deny(`no recipe with net id ${action.recipeNetId}`);

                        const station = server.getStationRegistry().get(recipe.station);
                        if (!station) return deny(`no station for recipe ${action.recipeNetId}`);

                        const grid = craftingInput.toGrid(craftingInput.gridSize());
                        const matched = station.match(grid);
                        if (matched !== recipe) {
                            // Said in full, because "does not match" is true of an empty grid, of
                            // the wrong recipe and of the right one read as the wrong size, and
                            // those want different fixes.
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

                        created = recipe.getOutputs()[0] ?? null;
                        if (!created) return deny('the recipe yields nothing');

                        // Spent here, by the server that just matched the grid.
                        //
                        // A real server leaves this to the `CRAFTING_CONSUME_INPUT` actions that
                        // follow, and this was written that way to match - but this client does
                        // not send them for a craft in the inventory. Waiting for them meant
                        // either taking the output for nothing, or, once that was guarded against,
                        // refusing every craft. The server matched the grid, so the server knows
                        // exactly what the craft costs and takes it.
                        // Read before the grid is spent, because the ingredients
                        // a `recipe_crafted` criterion matches are the stacks
                        // that went in rather than what is left of them.
                        const ingredients = Array.from({ length: CraftingInput.SLOTS }, (_, slot) =>
                            craftingInput.get(slot)
                        ).filter((stack): stack is Item => stack !== null && stack.getName() !== 'minecraft:air');

                        for (const slot of this.spendGrid(craftingInput)) craftingTouched.add(slot);
                        advancementItemCrafted(player, recipe.id, ingredients, created);
                        break;
                    }

                    case ItemStackRequestActionType.CRAFTING_CONSUME_INPUT: {
                        // What the craft costs, spent one action per slot and by the count the
                        // client names - which is how a real server does it, rather than the
                        // server deciding for itself.
                        //
                        // It used to empty the slot outright, so crafting once with sixty-four
                        // logs in the grid would have destroyed all sixty-four.
                        const slot = this.craftingSlotOf(action.source!, craftingInput);
                        if (slot === null)
                            return deny(
                                `not a crafting slot: ${action.source!.container.containerId}/${action.source!.slotId}`
                            );

                        // Acknowledged, not acted on: the craft above already spent the grid.
                        // Spending again here would take twice what the recipe asked for.
                        craftingTouched.add(slot);
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
                        createdIsShared = false;
                        workstationTouched.add(WORKSTATION_ITEM).add(WORKSTATION_MATERIAL);
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
                        // Crafting, beacons, looms - read so the packet stays aligned, refused
                        // because acting on half of one would be worse than not acting.
                        return deny(`action type ${action.type} is not acted on`);
                }
            }
        } catch (error) {
            // A step that throws is still a refusal, not a request left hanging. Unanswered,
            // the client keeps its prediction for a move the server never made.
            return deny(`a step threw: ${error instanceof Error ? error.message : String(error)}`);
        }

        for (const slot of craftingTouched) craftingChanged.add(slot);
        for (const slot of workstationTouched) context.changed.add(slot);

        // Only the containers something changed in. A container with no slots is legal on the
        // wire but says nothing, and it named both kept stores in every answer whether or not
        // the request went near them.
        const containers: ItemStackResponseContainerInfo[] = [
            {
                container: { containerId: ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, dynamicId: null },
                slots: Array.from(touched).map((slot) => this.describe(inventory, slot))
            },
            // The crafting slots are a container of their own, and a client told nothing
            // about them keeps showing what it spent.
            {
                container: { containerId: ContainerUiId.CRAFTING_INPUT, dynamicId: null },
                slots: Array.from(craftingTouched).map((slot) => this.describeCrafting(craftingInput, slot))
            },
            // Only when something moved through it. The pointer is what the player is
            // looking at mid-drag, so an answer that leaves it out is one that makes the
            // stack vanish from under the mouse.
            ...(cursorTouched
                ? [
                      {
                          container: { containerId: ContainerUiId.CURSOR, dynamicId: null },
                          slots: [this.describeItem(0, inventory.getCursor())]
                      }
                  ]
                : []),
            // One container per workstation slot, because the client numbers each of them
            // separately: an enchanting table's item and its lapis are two `ContainerUiId`s
            // holding a single slot each, not two slots of one container.
            ...(open === undefined
                ? []
                : Array.from(workstationTouched, (slot) => ({
                      container: { containerId: workstationContainerId(open, slot), dynamicId: null },
                      slots: [this.describeItem(0, open.inputs[slot] ?? null)]
                  })))
        ].filter((container) => container.slots.length > 0);

        return { result: ItemStackResponseResult.OK, requestId: request.requestId, containers };
    }

    /**
     * Takes one item out of every filled slot of the grid, which is what a craft costs.
     *
     * One from each, not the slot emptied: a stack of sixty-four in the grid makes sixty-four
     * crafts, and vanilla is the same. No recipe in the game asks for two of one thing from a
     * single slot, so there is nothing here to count.
     * @param {CraftingInput} craftingInput - the grid to spend from.
     * @returns {number[]} the slots that changed, for the answer to the client.
     */
    private spendGrid(craftingInput: CraftingInput): number[] {
        const spent: number[] = [];

        for (let slot = 0; slot < CraftingInput.SLOTS; slot++) {
            const item = craftingInput.get(slot);
            if (!item) continue;

            const left = item.getAmount() - 1;
            // A new stack rather than a decrement in place: the same item may be held
            // elsewhere, and lowering its count here would lower it there too.
            craftingInput.set(
                slot,
                left > 0 ? new Item({ id: item.getId(), name: item.getName(), meta: item.meta, count: left }) : null
            );
            spent.push(slot);
        }

        return spent;
    }

    /**
     * Everything one request may change, copied.
     *
     * The entries are copied rather than referenced: `addItem` raises the count on an entry
     * in place, so holding the same objects would record the change as it happened and give
     * nothing to go back to.
     */
    private snapshot(inventory: HumanInventory, craftingInput: CraftingInput, open?: OpenBlockContainer) {
        return {
            slots: inventory
                .getItems(true)
                .map((entry) => new ContainerEntry({ item: entry.getItem(), count: entry.getCount() })),
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
     * @returns the slots it touched, or `null` if either end names a container this does not
     * keep.
     */
    private moveBetween(
        from: ItemStackRequestSlotInfo,
        to: ItemStackRequestSlotInfo,
        inventory: HumanInventory,
        craftingInput: CraftingInput,
        count?: number,
        open?: OpenBlockContainer
    ): Array<[number, number]> | null {
        const source = this.locate(from, craftingInput, open);
        const destination = this.locate(to, craftingInput, open);
        if (!source || !destination) return null;

        const armor = inventory.getArmor();

        const read = (at: [number, number]): Item | null => {
            if (at[0] === WORKSTATION) return open?.inputs[at[1]] ?? null;
            if (at[0] === ContainerUiId.CRAFTING_INPUT) return craftingInput.get(at[1]);
            if (at[0] === ContainerUiId.CURSOR) return inventory.getCursor();
            if (at[0] === ContainerUiId.ARMOR_CONTAINER) return armor.isEmpty(at[1]) ? null : armor.getItem(at[1]);

            return this.itemOrNull(inventory, at[1]);
        };

        const write = (at: [number, number], item: Item | null): void => {
            if (at[0] === WORKSTATION) {
                if (open !== undefined) open.inputs[at[1]] = item;
            } else if (at[0] === ContainerUiId.CRAFTING_INPUT) craftingInput.set(at[1], item);
            else if (at[0] === ContainerUiId.CURSOR) inventory.setCursor(item);
            else if (at[0] === ContainerUiId.ARMOR_CONTAINER) {
                if (item) armor.setItem(at[1], new ContainerEntry({ item, count: item.getAmount() }));
                else armor.removeItem(at[1]);
            } else if (item) inventory.setItem(at[1], new ContainerEntry({ item, count: item.getAmount() }));
            else inventory.removeItem(at[1]);
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

        if (held && (held.getName() !== moving.getName() || held.meta !== moving.meta)) {
            // Two different things: they trade places, and only when the whole stack goes.
            if (amount !== moving.getAmount()) return null;

            write(destination, moving);
            write(source, held);

            return [source, destination];
        }

        if (held) {
            const room = held.getMaxAmount() - held.getAmount();
            const moved = Math.min(room, amount);
            if (moved <= 0) return null;

            write(destination, this.withCount(held, held.getAmount() + moved));
            const remaining = moving.getAmount() - moved;
            write(source, remaining > 0 ? this.withCount(moving, remaining) : null);

            return [source, destination];
        }

        write(destination, amount === moving.getAmount() ? moving : this.withCount(moving, amount));
        write(source, left > 0 ? this.withCount(moving, left) : null);

        return [source, destination];
    }

    /**
     * The same item, in a different quantity.
     *
     * A new stack rather than a count changed in place: the same object may be held elsewhere,
     * and moving half of it would move half of that too.
     */
    private withCount(item: Item, count: number): Item {
        return new Item({ id: item.getId(), name: item.getName(), meta: item.meta, count });
    }

    /** Which store and which slot a request names, or `null` for neither. */
    private locate(
        info: ItemStackRequestSlotInfo,
        craftingInput: CraftingInput,
        open?: OpenBlockContainer
    ): [number, number] | null {
        // Before the crafting grid, because an anvil's input container is id 0 and a bare
        // number says nothing about which screen it belongs to: the open window does.
        const workstation = workstationSlotOf(open, info.container.containerId);
        if (workstation !== null) return [WORKSTATION, workstation];

        const crafting = this.craftingSlotOf(info, craftingInput);
        if (crafting !== null) return [ContainerUiId.CRAFTING_INPUT, crafting];

        // One slot, and the slot id is not worth checking: the client numbers it zero and
        // there is nowhere else for it to be.
        if (info.container.containerId === ContainerUiId.CURSOR) return [ContainerUiId.CURSOR, 0];

        // Four slots the client numbers itself, head to feet. Trusted only within that range: a
        // slot outside it would write past the end of the container.
        if (info.container.containerId === ContainerUiId.ARMOR_CONTAINER) {
            return info.slotId >= 0 && info.slotId < ARMOR_SLOTS ? [ContainerUiId.ARMOR_CONTAINER, info.slotId] : null;
        }

        const inventory = this.slotOf(info);

        return inventory === null ? null : [ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY, inventory];
    }

    /** An inventory slot's item, with the empty one reported as empty rather than as air. */
    private itemOrNull(inventory: HumanInventory, slot: number): Item | null {
        const item = inventory.getItem(slot);

        return item.getName() === 'minecraft:air' ? null : item;
    }

    /**
     * One grid slot, named the way the client names it.
     *
     * The index is this server's; the number on the wire is 28 upwards for the inventory's
     * grid and 32 upwards for a table's. Answering with the index would point the client at
     * its cursor and at the first slots of its hotbar.
     */
    private describeCrafting(craftingInput: CraftingInput, index: number): ItemStackResponseSlotInfo {
        return this.describeItem(craftingInput.wireSlotOf(index), craftingInput.get(index));
    }

    /** One slot of a store that holds items outright, rather than air for the empty ones. */
    private describeItem(slot: number, item: Item | null): ItemStackResponseSlotInfo {
        return {
            slot,
            count: item?.getAmount() ?? 0,
            itemStackId: item ? nextStackId++ : 0,
            customName: '',
            durabilityCorrection: 0
        };
    }

    private describe(inventory: HumanInventory, slot: number): ItemStackResponseSlotInfo {
        const item = inventory.getItem(slot);

        // An empty slot comes back as air, and air is a `Block` handed out through an `Item`
        // shaped hole - it has no count to ask for, and asking threw, taking the answer to
        // the whole request with it. Every move empties its source, so this was every move.
        const empty = item.getName() === 'minecraft:air';

        return {
            slot,
            count: empty ? 0 : item.getAmount(),
            // Zero is how the client reads "nothing here"; a real stack gets an id of its own.
            itemStackId: empty ? 0 : nextStackId++,
            customName: '',
            durabilityCorrection: 0
        };
    }
}
