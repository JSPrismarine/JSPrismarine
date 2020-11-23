import Packet from './Packet';

const MAGIC = Buffer.from(
    '\x00\xff\xff\x00\xfe\xfe\xfe\xfe\xfd\xfd\xfd\xfd\x12\x34\x56\x78',
    'binary'
);
export default class OfflinePacket extends Packet {
    private magic!: Buffer;

    // Used to read offline packets magic (needed to validate the packet)
    public readMagic(): void {
        this.magic = this.getBuffer().slice(
            this.getOffset(),
            this.addOffset(16, true)
        );
    }

    public writeMagic(): void {
        this.append(MAGIC);
    }

    public isValid(): boolean {
        return MAGIC.equals(this.magic);
    }
}
