import ACK from './ACK';
import FrameSet from './FrameSet';
import NACK from './NACK';

/**
 * How many spare instances of each kind are kept around. A session decodes one datagram at
 * a time, so one is normally enough; the rest is headroom for re-entrant handling.
 */
const MAX_POOLED_INSTANCES = 4;

/**
 * Recycles the decode-side packet objects, which are otherwise allocated once per received
 * datagram. Instances handed out are always reset first: `BinaryStream.reuse` swaps the
 * buffer *and* rewinds the read cursor, which plain assignment to `buffer` would not do.
 */
export default class PacketPool {
    private readonly ackPool: ACK[] = [];
    private readonly nackPool: NACK[] = [];
    private readonly framesetPool: FrameSet[] = [];

    public getAckInstance(): ACK {
        return this.ackPool.pop() ?? new ACK();
    }

    public getNackInstance(): NACK {
        return this.nackPool.pop() ?? new NACK();
    }

    public getFrameSetInstance(): FrameSet {
        return this.framesetPool.pop() ?? new FrameSet();
    }

    public returnAck(ack: ACK): void {
        if (this.ackPool.length >= MAX_POOLED_INSTANCES) return;
        ack.clear();
        ack.sequenceNumbers = [];
        ack.ranges = [];
        this.ackPool.push(ack);
    }

    public returnNack(nack: NACK): void {
        if (this.nackPool.length >= MAX_POOLED_INSTANCES) return;
        nack.clear();
        nack.sequenceNumbers = [];
        nack.ranges = [];
        this.nackPool.push(nack);
    }

    public returnFrameSet(frameSet: FrameSet): void {
        if (this.framesetPool.length >= MAX_POOLED_INSTANCES) return;
        frameSet.clear();
        // Drop the reference to the decoded frames: they outlive this object, since the
        // session may still be holding them in an ordering or reassembly queue.
        frameSet.frames = [];
        frameSet.sequenceNumber = -1;
        this.framesetPool.push(frameSet);
    }
}
