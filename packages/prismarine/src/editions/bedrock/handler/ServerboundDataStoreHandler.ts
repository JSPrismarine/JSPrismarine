import type ServerboundDataStorePacket from '@jsprismarine/protocol/bedrock/packet/ServerboundDataStorePacket';
import type { InputContext } from '../../../player/context/HandlerContext';
import type { InputLaneHandler } from '../../../player/context/SessionHandler';
import { dataDrivenScreensOf } from '../../../scripting/DataDrivenScreens';

/**
 * A client's write to a path of a data-driven screen's data store property: a click on a
 * `@minecraft/server-ui` button, or a new value for a toggle, slider, dropdown or text field.
 *
 * The write is an input ([ADR 0009](../../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)):
 * the input step hands it to the behavior pack scripts, whose next flush runs the button's
 * callback or sets the observable the path follows. A write that names no screen the client has
 * open is dropped. It never throws.
 */
export default class ServerboundDataStoreHandler implements InputLaneHandler<ServerboundDataStorePacket> {
    public static PacketName = 'ServerboundDataStorePacket';
    public readonly phases = ['play'] as const;
    // Runs a script's callback or changes an observable, which changes what the scripts do next.
    public readonly lane = 'input';

    /** Counts the write against the screen's property and hands it to the scripts. */
    public handle(packet: ServerboundDataStorePacket, { session, log, services }: InputContext): undefined {
        const data = packet.getPacketData();
        const write = data === null ? undefined : dataDrivenScreensOf(session).written(data);
        if (write === undefined) {
            log.debug(`${session.identity.name} wrote to a data store property that is not an open screen's`);
            return;
        }
        services.scriptForms.answerDataDriven({ player: String(session.getRuntimeId()), ...write });
    }
}
