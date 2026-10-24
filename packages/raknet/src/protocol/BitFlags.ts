/**
 * The bits of a datagram's first byte, and the split bit of a frame's.
 *
 * `VALID` marks a datagram of the reliability layer at all; `ACK` and `NACK` say which kind
 * it is, and a datagram with neither carries frames. The low bits of a data datagram are
 * hints for RakNet's congestion control: `PACKET_PAIR`, `CONTINUOUS_SEND` and
 * `NEEDS_B_AND_AS`. The sliding window variant Bedrock uses ignores all three on receipt,
 * so a client datagram tagged `0x84` or `0x8c` decodes exactly like the `0x80` we send.
 *
 * `SPLIT` lives in a frame header byte, not the datagram's, and happens to share its value
 * with the packet pair bit; it is listed here because the frame codec always has.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L150
 */
export enum BitFlags {
    VALID = 0x80,
    ACK = 0x40,
    NACK = 0x20,
    /** On a datagram: the second of a packet pair. On a frame: one fragment of a split message. */
    SPLIT = 0x10,
    /** The sender had more queued behind this datagram. */
    CONTINUOUS_SEND = 0x08,
    /** The sender is in slow start and would like bandwidth estimates in our acknowledgments. */
    NEEDS_B_AND_AS = 0x04
}
export default BitFlags;
