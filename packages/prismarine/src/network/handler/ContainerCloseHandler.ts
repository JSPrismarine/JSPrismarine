import type { PlayerSession } from '../../';
import type Server from '../../Server';
import ContainerEntry from '../../inventory/ContainerEntry';
import CraftingInput from '../../crafting/CraftingInput';
import Identifiers from '../Identifiers';
import ContainerClosePacket from '../packet/ContainerClosePacket';
import type PacketHandler from './PacketHandler';

export default class ContainerCloseHandler implements PacketHandler<ContainerClosePacket> {
    public static NetID = Identifiers.ContainerClosePacket;

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
     */
    private async emptyCraftingGrid(session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const craftingInput = player.getCraftingInput();
        if (craftingInput.isEmpty()) return;

        const inventory = player.getInventory();
        for (let slot = 0; slot < CraftingInput.SLOTS; slot++) {
            const item = craftingInput.get(slot);
            if (!item) continue;

            // TODO: what will not fit should fall at the player's feet rather than be lost.
            inventory.addItem(new ContainerEntry({ item, count: item.getAmount() }));
            craftingInput.set(slot, null);
        }

        await session.sendInventory();
    }
}
