import CraftingInput from '../../crafting/CraftingInput';
import ContainerEntry from '../../inventory/ContainerEntry';
import type { Item } from '../../item/Item';
import type { InputContext, InputStep } from '../../network/handler/HandlerContext';
import type PlayerSession from '../../network/PlayerSession';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player closed a container screen.
 *
 * The server deletes its own window and answers the client, which is what closes the screen,
 * then clears what the close left behind.
 */
export default class CloseContainerHandler implements IntentHandler<'closeContainer'> {
    public static readonly Kind = 'closeContainer';

    /**
     * Closes the window on the server, answers the client, then empties the crafting grid.
     *
     * The answer says `Server Initiated Close` false whatever the client wrote, since the player
     * closed this one. A window the session never opened is logged and still answered: the client
     * has already taken the screen down and waits for the answer before it opens the next
     * container, and the same packet is what it sends back after a close the server forced.
     */
    public handle(
        { window, containerType }: Intent<'closeContainer'>,
        { session, log, step }: InputContext
    ): undefined {
        // The slots a workstation or trade screen kept are gone once the window is, so take them first.
        const open = session.getOpenBlockContainer();
        const left = open?.windowId === window ? open.inputs.filter((item) => item !== null) : [];
        // Whatever the player still holds on the cursor goes back with them, since the screen it was held over is gone.
        const inventory = session.getPlayer().getInventory();
        const cursor = inventory.getCursor();
        if (cursor !== null && open?.windowId === window) {
            left.push(cursor);
            inventory.setCursor(null);
        }

        if (!session.closeWindow(window)) {
            log.debug(`${session.identity.name} closed container ${window}, which it did not have open`);
        }

        step.output(session.presenter.containerClosed(window, containerType));

        this.emptyCraftingGrid(session, left, step);
    }

    /**
     * Gives back whatever was left in the crafting grid and in the slots of the window that
     * closed, as vanilla does. A trade screen's payment slots and an anvil's are the second kind.
     *
     * Closing the window is also the one moment the server and the client are certain to agree
     * about the grid: it is empty on both sides afterwards. That matters beyond the courtesy of
     * not eating a player's planks - a grid the client cannot see and cannot clear is one that
     * makes every later craft match against the wrong contents, and until requests were applied
     * atomically that state was reachable.
     *
     * Whatever the inventory has no room for falls at the player's feet, as vanilla also does.
     * Dropped rather than discarded: a full inventory is the ordinary case for a player who has
     * been mining, and silently eating the grid there is the same bug the grid itself was.
     */
    private emptyCraftingGrid(session: PlayerSession, windowItems: readonly Item[], step: InputStep): void {
        const player = session.getPlayer();
        const craftingInput = player.getCraftingInput();
        if (craftingInput.isEmpty() && windowItems.length === 0) return;

        const inventory = player.getInventory();
        const overflow: Item[] = [];

        for (const item of windowItems) {
            const left = inventory.addItem(new ContainerEntry({ item, count: item.getAmount() }));
            if (left > 0) overflow.push(item.withCount(left));
        }

        for (let slot = 0; slot < CraftingInput.SLOTS; slot++) {
            const item = craftingInput.get(slot);
            if (!item) continue;

            const left = inventory.addItem(new ContainerEntry({ item, count: item.getAmount() }));
            // A copy of the stack, so what falls keeps its enchantments, name and durability.
            if (left > 0) overflow.push(item.withCount(left));

            craftingInput.set(slot, null);
        }

        // The world puts the stacks on the ground before its promise settles, so they are part
        // of this input's unit; the promise is handed over only so a failure is reported.
        if (overflow.length > 0) step.output(session.getWorld().dropContents(player.getPosition(), overflow));

        step.output(session.sendInventory());
    }
}
