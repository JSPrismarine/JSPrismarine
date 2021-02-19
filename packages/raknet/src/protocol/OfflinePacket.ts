import Packet from './Packet';

const MAGIC = Buffer.from(
    '\u0000\u00FF\u00FF\u0000\u00FE\u00FE\u00FE\u00FE\u00FD\u00FD\u00FD\u00FD\u0012\u0034\u0056\u0078',
    'binary'
);
export default class OfflinePacket extends Packet {
    private magic!: Buffer;

    // Used to read offline packets magic (needed to validate the packet)
    public readMagic(): void {
        this.magic = this.getBuffer().slice(this.getOffset(), this.addOffset(16, true));
    }

    public writeMagic(): void {
        this.append(MAGIC);
    }

    public isValid(): boolean {
        return MAGIC.equals(this.magic);
    }
}
