import type PhotoTransferPacket from '@jsprismarine/protocol/packet/PhotoTransferPacket';
import type { SessionContext } from './HandlerContext';
import type { ConnectionLaneHandler } from './SessionHandler';

/**
 * A photo the Education Edition camera took, or a request for one the server holds.
 *
 * The transfer is recorded at debug level and dropped. Known gap: there is no photo storage,
 * so an upload is not kept and a request cannot be answered.
 */
export default class PhotoTransferHandler implements ConnectionLaneHandler<PhotoTransferPacket> {
    public static PacketName = 'PhotoTransferPacket';
    public readonly takes = 'context';
    public readonly phases = ['play'] as const;
    public readonly lane = 'connection';

    /** Logs the photo name and how many bytes came with it. */
    public handle(packet: PhotoTransferPacket, { session, log }: SessionContext): void {
        log.debug(
            `${session.identity.name} sent photo ${packet.photoName} with ${packet.photoData.byteLength} byte(s) of image data. The server has no photo storage`,
            'PhotoTransferHandler/handle'
        );
    }
}
