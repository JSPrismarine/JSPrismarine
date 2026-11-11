import type SetPlayerFurnaceOptionsPacket from '@jsprismarine/protocol/packet/SetPlayerFurnaceOptionsPacket';
import {
    FurnaceLayout,
    FurnaceLeftTabIndex,
    FurnaceType
} from '@jsprismarine/protocol/packet/SetPlayerFurnaceOptionsPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * Takes the player's furnace screen layout.
 *
 * Read and dropped, as `SetPlayerInventoryOptionsHandler` does for the inventory screen. The
 * packet is a preference, which tab the player had open and how the screen was laid out, and
 * the client reapplies its own choice the next time it opens a furnace, so nothing breaks by
 * not keeping it. A packet whose furnace type, tab or layout is not a member of its enum is
 * dropped at verbose level; the rest are recorded at debug level.
 *
 * Known gap: the server does not remember the layout across a rejoin. Doing so needs a field
 * on `WorldPlayerData` and matching reads and writes in `World.savePlayerData`.
 */
export default class SetPlayerFurnaceOptionsHandler implements ConnectionLaneHandler<SetPlayerFurnaceOptionsPacket> {
    public static PacketName = 'SetPlayerFurnaceOptionsPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Checks the three enum fields, then logs the layout. */
    public handle(packet: SetPlayerFurnaceOptionsPacket, { session, log }: SessionContext): void {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a SetPlayerFurnaceOptionsPacket without decoded data');

        const name = session.identity.name;
        const { furnaceType, options } = data;
        const furnace = FurnaceType[furnaceType];
        const tab = FurnaceLeftTabIndex[options.leftTab];
        const layout = FurnaceLayout[options.layout];

        const rejection =
            furnace === undefined
                ? `${furnaceType} is not a furnace type`
                : tab === undefined
                  ? `${options.leftTab} is not a furnace tab`
                  : layout === undefined
                    ? `${options.layout} is not a furnace layout`
                    : null;
        if (rejection !== null) {
            log.verbose(`Dropped furnace options from ${name}: ${rejection}`, 'SetPlayerFurnaceOptionsHandler/handle');
            return;
        }

        log.debug(
            `${name} arranged the ${furnace} screen: tab ${tab}, filtering ${options.filtering ? 'on' : 'off'}, layout ${layout}. Furnace options are not stored`,
            'SetPlayerFurnaceOptionsHandler/handle'
        );
    }
}
