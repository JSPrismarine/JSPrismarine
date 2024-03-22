import ACK from './ACK';
import FrameSet from './FrameSet';
import NACK from './NACK';

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
        this.ackPool.push(ack);
    }

    public returnNack(nack: NACK): void {
        this.nackPool.push(nack);
    }

    public returnFrameSet(frameSet: FrameSet): void {
        frameSet.frames = [];
        frameSet.sequenceNumber = -1;
        this.framesetPool.push(frameSet);
    }
}
