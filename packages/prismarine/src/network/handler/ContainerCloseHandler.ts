import type { PlayerSession } from '../../';
import type Server from '../../Server';
import ContainerEntry from '../../inventory/ContainerEntry';
import CraftingInput from '../../crafting/CraftingInput';
import type { Item } from '../../item/Item';
import ContainerClosePacket from '@jsprismarine/protocol/packet/ContainerClosePacket';
import type PacketHandler from './PacketHandler';

/**
 * Answers a client that closed a container, and clears what the close left behind.
 *
 * The packet goes both ways and carries the same three fields each way: `Container Id`
 * (a `ContainerID` as a uint8), `Container Type` (a `ContainerType` as a uint8) and
 * `Server Initiated Close` (boolean). The client sends it once its own container manager is
 * gone; the server deletes its own and sends one back, which is what closes the screen.
 */
export default class ContainerCloseHandler implements PacketHandler<ContainerClosePacket> {
    public static PacketName = 'ContainerClosePacket';
    public readonly phases = ['play'] as const;

    /**
     * Closes the window on the server, answers the client, then empties the crafting grid.
     *
     * The answer says `Server Initiated Close` false whatever the client wrote, since the
     * player closed this one. A `Container Id` the session never opened is logged and still
     * answered: the client has already taken the screen down and waits for the answer before
     * it opens the next container, and the same packet is what it sends back after a close
     * the server forced.
     */
    public async handle(packet: ContainerClosePacket, server: Server, session: PlayerSession): Promise<void> {
        if (!session.closeWindow(packet.containerId)) {
            server
                .getLogger()
                .debug(
                    `${session.getPlayer().getName()} closed container ${packet.containerId}, which it did not have open`,
                    'ContainerCloseHandler/handle'
                );
        }

        const pk = new ContainerClosePacket();
        pk.containerId = packet.containerId;
        pk.containerType = packet.containerType;
        pk.serverInitiatedClose = false;
        await session.getConnection().sendDataPacket(pk);

        await this.emptyCraftingGrid(session);
    }

    /**
     * Gives back whatever was left in the crafting grid, as vanilla does.
     *
     * Closing the window is also the one moment the server and the client are certain to
     * agree about the grid: it is empty on both sides afterwards. That matters beyond the
     * courtesy of not eating a player's planks - a grid the client cannot see and cannot
     * clear is one that makes every later craft match against the wrong contents, and until
     * requests were applied atomically that state was reachable.
     *
     * Whatever the inventory has no room for falls at the player's feet, as vanilla also does.
     * Dropped rather than discarded: a full inventory is the ordinary case for a player who
     * has been mining, and silently eating the grid there is the same bug the grid itself was.
     */
    private async emptyCraftingGrid(session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const craftingInput = player.getCraftingInput();
        if (craftingInput.isEmpty()) return;

        const inventory = player.getInventory();
        const overflow: Item[] = [];

        for (let slot = 0; slot < CraftingInput.SLOTS; slot++) {
            const item = craftingInput.get(slot);
            if (!item) continue;

            const left = inventory.addItem(new ContainerEntry({ item, count: item.getAmount() }));
            // A copy of the stack, so what falls keeps its enchantments, name and durability.
            if (left > 0) overflow.push(item.withCount(left));

            craftingInput.set(slot, null);
        }

        if (overflow.length > 0) await player.getWorld().dropContents(player.getPosition(), overflow);

        await session.sendInventory();
    }
}
