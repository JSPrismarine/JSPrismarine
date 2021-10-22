import BitFlags from './BitFlags';
import Frame from './Frame';
import Packet from './Packet';

export default class FrameSet extends Packet {
    public constructor(buffer?: Buffer) {
        super(BitFlags.VALID, buffer);
    }

    public sequenceNumber!: number;
    public frames: Frame[] = [];

    public decodePayload(): void {
        this.sequenceNumber = this.readLTriad();
        do {
            this.frames.push(new Frame().fromBinary(this));
        } while (!this.feof());
    }

    public encodePayload(): void {
        this.writeLTriad(this.sequenceNumber);
        for (const frame of this.frames) {
            this.append(frame.toBinary().getBuffer());
        }
    }

    // TODO: for continuos flag
    // public addFrame(): boolean {}

    public getByteLength(): number {
        let length = 4; // header (1 byte) + triad (3 bytes)
        for (const frame of this.frames) {
            length += frame.getByteLength();
        }
        return length;
    }
}
