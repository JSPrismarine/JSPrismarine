import type SettingsCommandPacket from '@jsprismarine/protocol/packet/SettingsCommandPacket';
import type { InputContext } from './HandlerContext';
import type { InputLaneHandler } from './SessionHandler';

/**
 * A command issued from a settings screen.
 *
 * The command line runs through the command manager, which checks the sender's permission,
 * so a player who may not run `/gamerule` cannot change a world setting from the menu.
 * Known gap: Suppress Output? is read and ignored, because the command manager has no quiet
 * mode and sends its messages straight to the player.
 */
export default class SettingsCommandHandler implements InputLaneHandler<SettingsCommandPacket> {
    public static PacketName = 'SettingsCommandPacket';
    public readonly phases = ['play'] as const;
    public readonly lane = 'input';

    /** Dispatches the command line as the player who sent it. */
    public handle(packet: SettingsCommandPacket, { session, services, step }: InputContext): undefined {
        const data = packet.getPacketData();
        if (data === null) throw new Error('Cannot handle a SettingsCommandPacket without decoded data');
        // A command can do anything, and the command manager waits on what it does. Slice 9
        // removes the wait, unless the command is synchronous by then.
        step.defer(async () => {
            await services.commands.dispatchCommand(session, session, data.command);
        });
    }
}
