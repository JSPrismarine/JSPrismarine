import Packet from './Packet.js';
import { RAKNET_MAGIC } from '../RakNet.js';

export default class UnconnectedPacket extends Packet {
    private magic!: Buffer;

    // Used to read offline packets magic (needed to validate the packet)
    public readMagic(): void {
        this.magic = this.read(16);
    }

    public writeMagic(): void {
        this.write(RAKNET_MAGIC);
    }

    public isValid(): boolean {
        return RAKNET_MAGIC.equals(this.magic);
    }
}
