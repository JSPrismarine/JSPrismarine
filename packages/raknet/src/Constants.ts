/**
 * How often a session is updated, in milliseconds. RakNet's own `Startup` contract
 * documents this argument as a millisecond sleep and recommends 10.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L360
 */
export const RAKNET_TICK_INTERVAL_MS = 10;

export const MAX_CHANNELS = 32;

/**
 * Upper bound on the sent-datagram history kept per session for ACK/NACK resolution.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakNetDefines.h#L105
 */
export const MAX_DATAGRAM_HISTORY = 512;

/** Sequence numbers, reliable indices and ordering indices are 24 bit on the wire. */
export const MAX_TRIAD_VALUE = 0xffffff;

/** One past the largest triad, i.e. the modulus every 24 bit counter wraps at. */
export const TRIAD_RANGE = MAX_TRIAD_VALUE + 1;

/**
 * How far back we chase holes in the incoming datagram sequence. A peer can name an
 * arbitrarily distant sequence number, and the gap between it and the last one we saw
 * must never be walked one by one without a bound.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/CCRakNetSlidingWindow.cpp#L146
 */
export const MAX_NACK_WINDOW = 512;

/**
 * A gap larger than this in the incoming datagram sequence is not loss, it is garbage.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/CCRakNetSlidingWindow.cpp#L149
 */
export const MAX_SKIPPED_DATAGRAMS = 50_000;

/**
 * How many reliable messages may be outstanding ahead of the oldest one we are still
 * waiting for. Bounds the memory the duplicate-detection window can be made to hold.
 * RakNet gives up past 1,000,000; we are far stricter because we keep the window in a Set.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L1003
 */
export const MAX_RECEIVE_WINDOW = 4096;

/** How many frames may sit buffered per ordering channel waiting for a hole to be filled. */
export const MAX_ORDERING_QUEUE_SIZE = 2048;

/** How many split messages a peer may have in flight before we stop accepting new ones. */
export const MAX_CONCURRENT_SPLITS = 64;

/** Upper bound on the fragment count a single split message may declare. */
export const MAX_SPLIT_PACKET_COUNT = 2048;

/** An incomplete reassembly older than this is abandoned. */
export const SPLIT_PACKET_TIMEOUT_MS = 10_000;

/**
 * Retransmission timeout bounds, in milliseconds.
 * `RTO = 2 * estimatedRTT + 4 * deviationRTT + variance`, capped at the maximum, and equal
 * to the maximum until the first RTT sample lands.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/CCRakNetSlidingWindow.cpp#L288
 */
export const RTO_MAX_MS = 2000;
export const RTO_ADDITIONAL_VARIANCE_MS = 30;

/** How long a session may go without any incoming traffic before it is dropped. */
export const SESSION_TIMEOUT_MS = 10_000;

/**
 * How long a session hangs on after saying goodbye, waiting for the peer to acknowledge it.
 *
 * Only a backstop: the ordinary case ends one round trip after the notification goes out,
 * and the peer's own goodbye ends on the next tick. This bounds the case where the peer has
 * already stopped listening, and is comfortably under {@link SESSION_TIMEOUT_MS} so a
 * session on its way out can never outlive a live one.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L5875
 */
export const DISCONNECT_LINGER_TIMEOUT_MS = 3_000;

/**
 * How often an outgoing connection repeats an offline request that went unanswered, and
 * how long it keeps trying before giving up. Both halves of the offline exchange are
 * unreliable by construction - there is no session yet to retransmit them.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L488 (timeBetweenSendConnectionAttemptsMS)
 */
export const CONNECTION_ATTEMPT_INTERVAL_MS = 500;
export const CONNECTION_ATTEMPT_TIMEOUT_MS = 10_000;

/**
 * How often a connected client pings.
 *
 * Comfortably under half {@link SESSION_TIMEOUT_MS}, so a couple of lost pings still leave
 * the peer something to see before it times us out. A Minecraft session is rarely idle in
 * both directions, but a client that is merely standing still is - and it is exactly the
 * bot harness, which stands still by the hundred, that would find out.
 */
export const CONNECTED_PING_INTERVAL_MS = 2_500;

/**
 * The largest datagram that cannot possibly mean anything, and so is dropped unread.
 *
 * The shortest acknowledgement is seven bytes (id, record count, flag, triad) and the
 * shortest data datagram eight, so two bytes is comfortably below anything legitimate.
 * RakNet draws the line in the same place, before its reliability layer rather than inside
 * the decoder.
 * @see https://github.com/facebookarchive/RakNet/blob/master/Source/RakPeer.cpp#L4582
 */
export const MIN_DATAGRAM_BYTE_LENGTH = 2;

export const MINECRAFT_PROTOCOL_VERSION = 11;
export const UDP_HEADER_SIZE = 28;
/** RakNet's OFFLINE_MESSAGE_DATA_ID, the 16 byte magic every offline packet carries. */
export const OFFLINE_MESSAGE_DATA_ID: Buffer = Buffer.from([
    0x00, 0xff, 0xff, 0x00, 0xfe, 0xfe, 0xfe, 0xfe, 0xfd, 0xfd, 0xfd, 0xfd, 0x12, 0x34, 0x56, 0x78
]);

// https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/MTUSize.h
export const MAX_MTU_SIZE = 1492;
export const MIN_MTU_SIZE = 400;
