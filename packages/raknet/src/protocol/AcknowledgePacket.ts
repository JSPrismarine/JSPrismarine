import Packet from './Packet';

/** A run of acknowledged datagram sequence numbers, inclusive at both ends. */
export interface SequenceRange {
    start: number;
    end: number;
}

export default class AcknowledgePacket extends Packet {
    /** The sequence numbers to acknowledge. Input to {@link encode}; decode fills {@link ranges}. */
    public sequenceNumbers: number[] = [];

    /**
     * The records as they arrived, kept in range form.
     *
     * Expanding them into individual sequence numbers is what the peer would like us to
     * do: the wire format lets seven bytes name the whole 24 bit space, so a nine byte
     * datagram would cost 16.7 million array entries and ~128 MiB. Nothing needs the
     * expansion - the only question ever asked is whether a datagram *we sent* is in
     * there, and we track at most MAX_DATAGRAM_HISTORY of those.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L772
     */
    public ranges: SequenceRange[] = [];

    public decodePayload(): void {
        // Clear old cached decoded packets
        this.sequenceNumbers = [];
        this.ranges = [];

        const recordCount = this.readUnsignedShort();
        for (let i = 0; i < recordCount; i++) {
            const notRange = this.readBoolean();

            if (notRange) {
                const sequenceNumber = this.readUnsignedTriadLE();
                this.ranges.push({ start: sequenceNumber, end: sequenceNumber });
            } else {
                const start = this.readUnsignedTriadLE();
                const end = this.readUnsignedTriadLE();
                // A record with end < start names nothing, exactly as the `start..end`
                // loop that used to expand it produced nothing.
                this.ranges.push({ start, end });
            }
        }
    }

    /**
     * Whether this acknowledgement names the given datagram sequence number.
     * Also honours {@link sequenceNumbers} so a packet built by hand still answers.
     */
    public contains(sequenceNumber: number): boolean {
        for (const range of this.ranges) {
            if (sequenceNumber >= range.start && sequenceNumber <= range.end) {
                return true;
            }
        }

        return this.sequenceNumbers.length > 0 && this.sequenceNumbers.includes(sequenceNumber);
    }

    /**
     * Writes the records straight into a preallocated buffer, for the same reason
     * {@link FrameSet.encode} does: appending through a `BinaryStream` rebuilds a plain JS
     * number array on every write. The record count is only known at the end, so it is
     * patched back into the two bytes reserved for it.
     */
    public encode(): void {
        this.sequenceNumbers.sort((a, b) => a - b);
        const count = this.sequenceNumbers.length;

        // Worst case is every sequence number becoming its own record: a flag byte plus
        // one triad. A range record is longer but always covers at least two numbers, so
        // it can never push past this bound.
        const out = Buffer.allocUnsafe(3 + count * 4);
        out[0] = this.getId();

        let offset = 3;
        let records = 0;

        const writeRecord = (start: number, last: number): void => {
            if (start === last) {
                out[offset++] = 1; // single
                offset = out.writeUIntLE(start, offset, 3);
            } else {
                out[offset++] = 0; // range
                offset = out.writeUIntLE(start, offset, 3);
                offset = out.writeUIntLE(last, offset, 3);
            }
            ++records;
        };

        if (count > 0) {
            let pointer = 1;
            let start = this.sequenceNumbers[0]!;
            let last = this.sequenceNumbers[0]!;

            while (pointer < count) {
                const current = this.sequenceNumbers[pointer++]!;
                const diff = current - last;
                if (diff === 1) {
                    last = current;
                } else if (diff > 1) {
                    writeRecord(start, last);
                    start = last = current;
                }
            }

            // last iteration
            writeRecord(start, last);
        }

        out.writeUInt16BE(records, 1);
        this.setBuffer(out.subarray(0, offset));
    }
}
