import FrameSet from './protocol/FrameSet.js';
import { RAKNET_TPS as SYN } from './RakNet.js';

// export const SYN = RAKNET_TPS;

interface GotPacketData {
    datagram: FrameSet,
    skippedMessageCount: number,
    timestamp: number
}

// https://github.com/facebookarchive/RakNet/blob/master/Source/CCRakNetUDT.h
export default class CongestionManager {
    private expectedNextSequenceNumber = 0;
    private lastPacketArrivalTime = 0;
    private oldestUnsentAck = 0;

    public constructor(private readonly maxDatagramPayload: number) {}

    public onGotPacket(x: GotPacketData): boolean {
        if (x.datagram.sequenceNumber === this.expectedNextSequenceNumber) {
            x.skippedMessageCount = 0;
        } else if (x.datagram.sequenceNumber > this.expectedNextSequenceNumber) {
            x.skippedMessageCount = x.datagram.sequenceNumber - this.expectedNextSequenceNumber;

            // Sanity check: https://github.com/facebookarchive/RakNet/blob/master/Source/CCRakNetUDT.cpp#L487
            if (x.skippedMessageCount > 1000) {
                if (x.skippedMessageCount > 50_000) return false;
                x.skippedMessageCount = 1000;
            }

            this.expectedNextSequenceNumber = x.datagram.sequenceNumber + 1;
        } else {
            x.skippedMessageCount = 0;
        }

        if (x.timestamp > this.lastPacketArrivalTime) {
            // const interval = timestamp - this.lastPacketArrivalTime;

            // console.log("Packet arrival gap is %d", interval);

            this.lastPacketArrivalTime = x.timestamp;
        }
        return true;
    }

    public shouldSendACKs(timestamp: number, estimatedTimeToNextTick: number): boolean {
        // TODO: rtt times
        return timestamp >= this.oldestUnsentAck + SYN || estimatedTimeToNextTick < this.oldestUnsentAck;
    }

    public onSendAck(): void {
        this.oldestUnsentAck = 0;
    }
}
