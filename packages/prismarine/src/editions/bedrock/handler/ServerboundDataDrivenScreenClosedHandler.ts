import type ServerboundDataDrivenScreenClosedPacket from '@jsprismarine/protocol/bedrock/packet/ServerboundDataDrivenScreenClosedPacket';
import type { InputContext } from '../../../player/context/HandlerContext';
import type { InputLaneHandler } from '../../../player/context/SessionHandler';
import { closeReasonOf, dataDrivenScreensOf } from '../../../scripting/DataDrivenScreens';

/**
 * A client's report that a data-driven screen closed: the player dismissed it, the client could
 * not show it, or the server asked for it to close.
 *
 * The screen's data store property is cleared at once, as BDS clears it. The report is an input
 * ([ADR 0009](../../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)): the next
 * script flush settles the screen's `show()` with the reason. A report for a screen the client
 * does not have open is dropped. It never throws.
 */
export default class ServerboundDataDrivenScreenClosedHandler implements InputLaneHandler<ServerboundDataDrivenScreenClosedPacket> {
    public static PacketName = 'ServerboundDataDrivenScreenClosedPacket';
    public readonly phases = ['play'] as const;
    // Settles a script's screen, which changes what the scripts do next.
    public readonly lane = 'input';

    /** Clears the screen's property and hands the close reason to the scripts. */
    public handle(
        packet: ServerboundDataDrivenScreenClosedPacket,
        { session, log, services }: InputContext
    ): undefined {
        const data = packet.getPacketData();
        if (data === null || dataDrivenScreensOf(session).closed(data.formId) !== true) {
            log.debug(`${session.identity.name} closed data-driven screen ${data?.formId}, which it did not have open`);
            return;
        }
        services.scriptForms.answerDataDriven({
            player: String(session.getRuntimeId()),
            formId: data.formId,
            reason: closeReasonOf(data.closeReason)
        });
    }
}
