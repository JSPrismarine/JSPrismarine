import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import {
    Connection,
    MAX_MESSAGE_BYTES,
    MAX_SEGMENTS,
    Reassembler,
    SEGMENT_BYTES,
    segment,
    segmentBytesFor
} from './Connection';
import type { DriverChannel, DriverPeer } from './WebRtcDriver';

describe('NetherNet segments', () => {
    it('counts down the segments still to come, and joins them back', () => {
        const message = Buffer.alloc(SEGMENT_BYTES * 2 + 5, 9);
        const parts = segment(message);

        expect(parts.map((part) => [part[0], part.byteLength - 1])).toStrictEqual([
            [2, SEGMENT_BYTES],
            [1, SEGMENT_BYTES],
            [0, 5]
        ]);
        const reassembler = new Reassembler();
        expect(parts.map((part) => reassembler.push(part))).toStrictEqual([undefined, undefined, message]);
    });

    it('sends a message up to one full segment whole, as Bedrock does', () => {
        expect(segment(Buffer.from('hi'))).toStrictEqual([Buffer.from([0, 0x68, 0x69])]);
        expect(segment(Buffer.alloc(SEGMENT_BYTES))).toHaveLength(1);
        expect(segment(Buffer.alloc(SEGMENT_BYTES + 1))).toHaveLength(2);
    });

    it('splits by the size it is given, for a peer that takes smaller messages', () => {
        expect(segment(Buffer.alloc(25), 10).map((part) => [part[0], part.byteLength - 1])).toStrictEqual([
            [2, 10],
            [1, 10],
            [0, 5]
        ]);
    });

    it('refuses a message that needs more segments than Bedrock sends, or is empty', () => {
        expect(MAX_MESSAGE_BYTES).toBe(MAX_SEGMENTS * SEGMENT_BYTES);
        expect(() => segment(Buffer.alloc(MAX_SEGMENTS * 10 + 1), 10)).toThrow(RangeError);
        expect(segment(Buffer.alloc(MAX_SEGMENTS * 10), 10)).toHaveLength(MAX_SEGMENTS);
        expect(() => segment(Buffer.alloc(0))).toThrow(RangeError);
    });

    it('refuses a segment whose count does not follow the last one', () => {
        const reassembler = new Reassembler();
        reassembler.push(Buffer.from([2, 1]));

        expect(() => reassembler.push(Buffer.from([0, 1]))).toThrow('where 1 were due');
    });

    it('refuses a message that grows past its limit, and takes the next one from zero', () => {
        const reassembler = new Reassembler(4);

        expect(reassembler.push(Buffer.from([1, 1, 2]))).toBeUndefined();
        expect(reassembler.push(Buffer.from([0, 3, 4]))).toStrictEqual(Buffer.from([1, 2, 3, 4]));
        reassembler.push(Buffer.from([1, 1, 2, 3]));
        expect(() => reassembler.push(Buffer.from([0, 4, 5]))).toThrow('longer than the 4 bytes accepted');
    });
});

describe('segmentBytesFor', () => {
    it.each([
        ['what Bedrock states', 'a=max-message-size:262144', SEGMENT_BYTES],
        ['a smaller limit, less the count byte', 'a=max-message-size:16384', 16_383],
        ["a larger limit, capped at Bedrock's", 'a=max-message-size:1073741824', SEGMENT_BYTES],
        ['no limit', 'a=max-message-size:0', SEGMENT_BYTES],
        ['nothing stated, which means 64 KiB', 'a=sctp-port:5000', 65_535]
    ])('reads %s', (_name, attribute, expected) => {
        expect(segmentBytesFor(`v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n${attribute}\r\n`)).toBe(
            expected
        );
    });
});

describe('Connection', () => {
    /** A channel a test feeds messages into and reads what was sent from. */
    const fakeChannel = (label: string, buffered = () => 0, accepts = () => true) => {
        const events = new EventEmitter();
        const sent: Buffer[] = [];
        const channel: DriverChannel = {
            label,
            readyState: 'open',
            get bufferedAmount() {
                return buffered();
            },
            send: (data) => {
                if (!accepts()) return false;
                sent.push(Buffer.from(data));
                return true;
            },
            close: () => {},
            onOpen: () => {},
            onClose: () => {},
            onMessage: (listener) => void events.on('message', listener)
        };
        return { channel, sent, receive: (data: Buffer) => events.emit('message', data) };
    };

    const fakePeer: DriverPeer = {
        state: 'connected',
        iceState: 'connected',
        setRemoteDescription: () => {},
        addRemoteCandidate: () => {},
        createDataChannel: () => {
            throw new Error('The connection opens no channel');
        },
        localDescription: async () => '',
        onDataChannel: () => {},
        onStateChange: () => {},
        onIceStateChange: () => {},
        remoteAddress: () => undefined,
        localAddress: () => undefined,
        close: () => {}
    };

    /** A connection over fake channels, with what it delivered and why it closed. */
    const connect = (
        options: ConstructorParameters<typeof Connection>[2] = {},
        buffered = () => 0,
        accepts = () => true
    ) => {
        const connection = new Connection(1n, fakePeer, options);
        const reliable = fakeChannel('ReliableDataChannel', buffered, accepts);
        const unreliable = fakeChannel('UnreliableDataChannel');
        const messages: Buffer[] = [];
        const closed: string[] = [];
        connection.on('message', (message: Buffer) => messages.push(message));
        connection.on('close', (reason: string) => closed.push(reason));
        connection.setReliable(reliable.channel);
        connection.setUnreliable(unreliable.channel);
        return { connection, reliable, unreliable, messages, closed };
    };

    it('delivers a message the peer sends on the unreliable channel', () => {
        const { unreliable, messages, closed } = connect();

        unreliable.receive(Buffer.from([0, 7, 8]));

        expect(messages).toStrictEqual([Buffer.from([7, 8])]);
        expect(closed).toStrictEqual([]);
    });

    it('closes on a segmented message on the unreliable channel, which carries none', () => {
        const { unreliable, messages, closed } = connect();

        unreliable.receive(Buffer.from([1, 7, 8]));

        expect(messages).toStrictEqual([]);
        expect(closed[0]).toMatch(/^badsegment:/);
    });

    it('sizes its segments to what the remote description allows', () => {
        const { connection, reliable } = connect();
        connection.useRemoteDescription('v=0\r\na=max-message-size:11\r\n');

        connection.send(Buffer.alloc(25, 1));

        expect(reliable.sent.map((part) => [part[0], part.byteLength - 1])).toStrictEqual([
            [2, 10],
            [1, 10],
            [0, 5]
        ]);
    });

    it('closes on a message longer than it accepts', () => {
        const { reliable, closed } = connect({ maxMessageBytes: 3 });

        reliable.receive(Buffer.from([0, 1, 2, 3, 4]));

        expect(closed[0]).toMatch(/^badsegment:.*longer than the 3 bytes accepted/);
    });

    it('closes a peer whose unsent data passes the buffer limit', () => {
        let buffered = 0;
        const { connection, closed } = connect({ maxBufferedBytes: 100 }, () => buffered);

        connection.send(Buffer.from([1]));
        expect(closed).toStrictEqual([]);
        buffered = 101;
        connection.send(Buffer.from([2]));

        expect(closed).toStrictEqual(['sendbacklog']);
    });

    it('closes when the channel refuses a segment, since the stream is then short of one', () => {
        const { connection, closed } = connect(
            {},
            () => 0,
            () => false
        );

        connection.send(Buffer.from([1]));

        expect(closed).toStrictEqual(['sendfailed']);
    });
});
