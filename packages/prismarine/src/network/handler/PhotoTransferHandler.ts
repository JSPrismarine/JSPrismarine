import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type PhotoTransferPacket from '../packet/PhotoTransferPacket';
import type PacketHandler from './PacketHandler';

/**
 * A photo the Education Edition camera took, or a request for one the server holds.
 *
 * The transfer is recorded at debug level and dropped. Known gap: there is no photo storage,
 * so an upload is not kept and a request cannot be answered.
 */
export default class PhotoTransferHandler implements PacketHandler<PhotoTransferPacket> {
    public static PacketName = 'PhotoTransferPacket';
    public readonly phases = ['play'] as const;

    /** Logs the photo name and how many bytes came with it. */
    public handle(packet: PhotoTransferPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} sent photo ${packet.photoName} with ${packet.photoData.byteLength} byte(s) of image data. The server has no photo storage`,
                'PhotoTransferHandler/handle'
            );
    }
}
