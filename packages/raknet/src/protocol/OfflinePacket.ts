import { OFFLINE_MESSAGE_DATA_ID } from '../Constants';
import Packet from './Packet';

export default class OfflinePacket extends Packet {
    private magic!: Buffer;

    // Used to read offline packets magic (needed to validate the packet)
    public readMagic(): void {
        this.magic = this.read(16);
    }

    public writeMagic(): void {
        this.write(OFFLINE_MESSAGE_DATA_ID);
    }

    public isValid(): boolean {
        return OFFLINE_MESSAGE_DATA_ID.equals(this.magic);
    }
}
