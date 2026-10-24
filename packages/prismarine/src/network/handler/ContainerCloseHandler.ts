import type { PlayerSession } from '../../';
import type Server from '../../Server';
import ContainerEntry from '../../inventory/ContainerEntry';
import CraftingInput from '../../crafting/CraftingInput';
import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import ContainerClosePacket from '../packet/ContainerClosePacket';
import type PacketHandler from './PacketHandler';

/**
 * Answers a client that closed a container, and clears what the close left behind.
 *
 * The packet goes both ways and carries the same three fields each way: Container Id (uint8),
 * Container Type (uint8) and Server Initiated Close (boolean). The client sends it once its
 * own container manager is gone; the server sends one back, which is what closes the screen.
 */
export default class ContainerCloseHandler implements PacketHandler<ContainerClosePacket> {
    public static NetID = Identifiers.ContainerClosePacket;

    /** Echoes the close back to the client, then empties the crafting grid. */
    public async handle(packet: ContainerClosePacket, _server: Server, session: PlayerSession): Promise<void> {
        const pk = new ContainerClosePacket();
        pk.containerId = packet.containerId;
        pk.containerType = packet.containerType;
        pk.serverInitiatedClose = packet.serverInitiatedClose;
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
            if (left > 0) {
                overflow.push(new Item({ id: item.getId(), name: item.getName(), meta: item.meta, count: left }));
            }

            craftingInput.set(slot, null);
        }

        if (overflow.length > 0) await player.getWorld().dropContents(player.getPosition(), overflow);

        await session.sendInventory();
    }
}
