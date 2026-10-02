import BinaryStream from '@jsprismarine/binaryutils';
import { describe, expect, it, vi } from 'vitest';
import Session, { RakNetPriority, SessionStatus } from './Session';
import Frame from './protocol/Frame';
import FrameReliability from './protocol/FrameReliability';
import FrameSet from './protocol/FrameSet';
import ACK from './protocol/ACK';
import NACK from './protocol/NACK';
import { monotonicNow } from './utils/Clock';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn(), debug: vi.fn(), silly: vi.fn() };

const makeSession = (mtu = 1400) => {
    const sent: Buffer[] = [];
    const listener: any = {
        getLogger: () => logger,
        sendPacket: (packet: any) => {
            packet.encode();
            sent.push(packet.getBuffer());
        },
        emit: vi.fn(),
        removeSession: vi.fn()
    };
    const session = new Session(listener, mtu, { address: '1.2.3.4', port: 19132, family: 'IPv4', size: 0 }, 1n);
    return { session, sent };
};

const gameFrame = (content: Buffer) => {
    const frame = new Frame();
    frame.reliability = FrameReliability.RELIABLE_ORDERED;
    frame.orderChannel = 0;
    frame.content = content;
    return frame;
};

const ackFor = (...sequenceNumbers: number[]) => {
    const ack = new ACK();
    ack.sequenceNumbers = sequenceNumbers;
    return ack;
};

const decodeSent = (buffer: Buffer) => {
    const frameSet = new FrameSet(buffer);
    frameSet.decode();
    return frameSet;
};

describe('C1 - NACK retransmission is verbatim', () => {
    it('keeps reliableIndex and orderIndex identical across the retransmission', () => {
        const { session, sent } = makeSession();

        session.sendFrame(gameFrame(Buffer.from('alpha')));
        session.sendFrameQueue();
        session.sendFrame(gameFrame(Buffer.from('bravo')));
        session.sendFrameQueue();

        const lost = decodeSent(sent[0]!);
        expect(lost.frames[0]!.orderIndex).toBe(0);
        expect(lost.frames[0]!.reliableIndex).toBe(0);

        const nack = new NACK();
        nack.sequenceNumbers = [lost.sequenceNumber];
        (session as any).handleNACK(nack);

        const resent = decodeSent(sent.at(-1)!);
        expect(resent.sequenceNumber).not.toBe(lost.sequenceNumber); // new datagram
        expect(resent.frames[0]!.content.toString()).toBe('alpha'); // same message
        expect(resent.frames[0]!.orderIndex).toBe(0); // identity preserved
        expect(resent.frames[0]!.reliableIndex).toBe(0);
    });

    it('does not resend a message already acknowledged through another datagram', () => {
        const { session, sent } = makeSession();
        session.sendFrame(gameFrame(Buffer.from('alpha')));
        session.sendFrameQueue();

        const seq = decodeSent(sent[0]!).sequenceNumber;
        const ack = new ACK();
        ack.sequenceNumbers = [seq];
        (session as any).handleACK(ack);

        const before = sent.length;
        const nack = new NACK();
        nack.sequenceNumbers = [seq];
        (session as any).handleNACK(nack);
        expect(sent.length).toBe(before); // nothing retransmitted
    });
});

describe('C2 - fragments are independent messages', () => {
    it('gives every fragment its own reliableIndex and its own content', () => {
        const { session, sent } = makeSession();
        session.sendFrame(gameFrame(Buffer.alloc(4000, 0x41)));

        const fragments = sent.map(decodeSent).map((fs) => fs.frames[0]!);
        expect(fragments.length).toBeGreaterThan(1);
        expect(new Set(fragments.map((f) => f.reliableIndex)).size).toBe(fragments.length);
        expect(fragments.map((f) => f.fragmentIndex)).toEqual(fragments.map((_, i) => i));
        expect(fragments.every((f) => f.orderIndex === 0)).toBe(true); // shared ordering identity

        // Retransmitting the FIRST fragment must yield the first fragment, not the last.
        const nack = new NACK();
        nack.sequenceNumbers = [decodeSent(sent[0]!).sequenceNumber];
        const beforeLength = sent.length;
        (session as any).handleNACK(nack);
        const resent = decodeSent(sent[beforeLength]!).frames[0]!;
        expect(resent.fragmentIndex).toBe(0);
        expect(resent.content.equals(fragments[0]!.content)).toBe(true);
    });
});

describe('C6 - malformed frame lengths are rejected, not looped on', () => {
    it('rejects a negative-looking (unsigned-overflowing) length instead of hanging', () => {
        // header 0x00 (unreliable, no split) + length 0xffe8 bits => -24 if read signed
        const evil = Buffer.from([0x84, 0x00, 0x00, 0x00, 0x00, 0xff, 0xe8]);
        expect(() => decodeSent(evil)).toThrow();
    });

    it('rejects a split frame whose index is past its count', () => {
        const stream = new BinaryStream();
        stream.writeByte(0x84); // VALID | continuous
        stream.writeUnsignedTriadLE(0);
        stream.writeByte((FrameReliability.RELIABLE_ORDERED << 5) | 0x10); // split
        stream.writeUnsignedShort(8);
        stream.writeUnsignedTriadLE(0); // reliableIndex
        stream.writeUnsignedTriadLE(0); // orderIndex
        stream.writeByte(0); // orderChannel
        stream.writeUnsignedInt(2); // fragment count
        stream.writeUnsignedShort(0); // fragment id
        stream.writeUnsignedInt(9); // fragment index, out of range
        stream.write(Buffer.from([0xfe]));
        expect(() => decodeSent(stream.getBuffer())).toThrow();
    });
});

describe('C4 - hostile ordering channel', () => {
    it('drops the frame instead of throwing', () => {
        const { session } = makeSession();
        const frame = new Frame();
        frame.reliability = FrameReliability.RELIABLE_ORDERED;
        frame.orderChannel = 200; // > MAX_CHANNELS
        frame.orderIndex = 0;
        frame.content = Buffer.from([0xfe]);
        expect(() => (session as any).handleFrame(frame)).not.toThrow();
    });
});

describe('C3 / C5 / C8 - offline path', () => {
    const makeOfflineListener = () => {
        const addSession = vi.fn();
        const sentPackets: any[] = [];
        const listener: any = {
            getLogger: () => logger,
            getServerGuid: () => 1234n,
            allowIncomingConnections: () => true,
            getSessionByAddress: () => null,
            getSessionByGUID: () => null,
            serverName: { toString: () => 'test', setOnlinePlayerCount: vi.fn() },
            sendPacket: (packet: any) => sentPackets.push(packet),
            sendBuffer: vi.fn(),
            addSession,
            emit: vi.fn()
        };
        return { listener, addSession, sentPackets };
    };

    const rinfo: any = { address: '1.2.3.4', port: 19132, family: 'IPv4', size: 0 };

    it('C3: an unknown offline packet id is logged, never thrown', async () => {
        const { OfflineHandler } = await import('./protocol/OfflineHandler');
        const { listener } = makeOfflineListener();
        const handler = new OfflineHandler(listener);
        expect(() => handler.process(Buffer.from([0x7b]), rinfo)).not.toThrow();
        expect(() => handler.process(Buffer.alloc(0), rinfo)).not.toThrow();
    });

    it('C8: a hostile MTU is clamped before it reaches the session', async () => {
        const { OfflineHandler } = await import('./protocol/OfflineHandler');
        const { MIN_MTU_SIZE, MAX_MTU_SIZE, OFFLINE_MESSAGE_DATA_ID } = await import('./Constants');
        const { OpenConnectionRequest2 } = await import('./protocol/Protocol');
        const { InetAddress } = await import('./index');

        for (const [hostile, expected] of [
            [0, MIN_MTU_SIZE],
            [1, MIN_MTU_SIZE],
            [65535, MAX_MTU_SIZE],
            [1200, 1200]
        ] as const) {
            const { listener, addSession } = makeOfflineListener();
            const request = new OpenConnectionRequest2();
            request.serverAddress = new InetAddress('127.0.0.1', 19132, 4);
            request.mtuSize = hostile;
            request.clientGUID = 99n;
            request.encode();

            new OfflineHandler(listener).process(request.getBuffer(), rinfo);
            expect(addSession).toHaveBeenCalledWith(rinfo, expected, 99n);
        }
        expect(OFFLINE_MESSAGE_DATA_ID.byteLength).toBe(16);
    });

    it('C5: a truncated connected datagram does not escape handleMessage', async () => {
        const { default: ServerSocket } = await import('./ServerSocket');
        const server: any = new ServerSocket(
            10,
            false,
            { toString: () => 'x', setOnlinePlayerCount: vi.fn() } as any,
            logger
        );
        // Register a session so the datagram reaches the decoder rather than being ignored.
        server.sessions.set(
            `${rinfo.address}:${rinfo.port}`,
            new Session(
                { getLogger: () => logger, sendPacket: vi.fn(), emit: vi.fn(), removeSession: vi.fn() } as any,
                1400,
                rinfo,
                1n
            )
        );
        // VALID datagram announcing a frame far longer than the bytes actually present.
        expect(() =>
            server.handleMessage(Buffer.from([0x84, 0x00, 0x00, 0x00, 0x60, 0xff, 0xff]), rinfo)
        ).not.toThrow();
        expect(() => server.handleMessage(Buffer.from([0xc0, 0xff, 0xff]), rinfo)).not.toThrow(); // truncated ACK
        server.kill();
    });
});

describe('C7 - hostile first datagram sequence number', () => {
    it('bounds the NACK window instead of walking 16.7M holes', () => {
        const { session } = makeSession();
        const frameSet = new FrameSet();
        frameSet.sequenceNumber = 0xffffff;
        frameSet.frames = [];

        const started = Date.now();
        (session as any).handleFrameSet(frameSet);
        expect(Date.now() - started).toBeLessThan(1000);
        expect((session as any).lostFrameSequences.size).toBeLessThanOrEqual(512);
    });
});

// ---------------------------------------------------------------------------------
// Second pass: the H and M series
// ---------------------------------------------------------------------------------

/** Builds an incoming datagram carrying one reliable ordered frame. */
const incoming = (sequenceNumber: number, frames: Frame[]) => {
    const frameSet = new FrameSet();
    frameSet.sequenceNumber = sequenceNumber;
    frameSet.frames = frames;
    return frameSet;
};

const inboundFrame = (reliableIndex: number, orderIndex: number, payload: number) => {
    const frame = new Frame();
    frame.reliability = FrameReliability.RELIABLE_ORDERED;
    frame.orderChannel = 0;
    frame.reliableIndex = reliableIndex;
    frame.orderIndex = orderIndex;
    frame.content = Buffer.from([0xfe, payload]);
    return frame;
};

/** Captures what actually reaches the game layer, in delivery order. */
const makeReceivingSession = () => {
    const delivered: number[] = [];
    const listener: any = {
        getLogger: () => logger,
        sendPacket: vi.fn(),
        emit: (event: string, frame: any) => {
            if (event === 'encapsulated') delivered.push(frame.content[1]);
        },
        removeSession: vi.fn()
    };
    const session = new Session(
        listener,
        1400,
        { address: '1.2.3.4', port: 19132, family: 'IPv4', size: 0 } as any,
        1n
    );
    (session as any).state = 1; // SessionStatus.CONNECTED
    return { session, delivered };
};

describe('H1 - retransmission on timeout', () => {
    it('resends an unacknowledged message once its RTO expires, and stops once acked', () => {
        const { session, sent } = makeSession();
        session.sendFrame(gameFrame(Buffer.from('tail')));
        session.sendFrameQueue();
        expect(sent.length).toBe(1);

        // Before the deadline nothing moves.
        session.update(monotonicNow());
        expect(sent.length).toBe(1);

        // Past the deadline (RTO starts at 2s) the message goes out again, verbatim.
        // Stay under the 10s session timeout, which would send a disconnect of its own.
        session.update(monotonicNow() + 3000);
        expect(sent.length).toBe(2);
        const resent = decodeSent(sent[1]!);
        expect(resent.frames[0]!.reliableIndex).toBe(0);
        expect(resent.frames[0]!.orderIndex).toBe(0);
        expect(resent.frames[0]!.content.toString()).toBe('tail');

        // Acknowledging it ends the retransmissions.
        (session as any).handleACK(ackFor(resent.sequenceNumber));
        session.update(monotonicNow() + 6000);
        expect(sent.length).toBe(2);
    });

    it('derives an RTT estimate from acknowledgements', () => {
        const { session, sent } = makeSession();
        expect(session.getRTT()).toBeNull();

        session.sendFrame(gameFrame(Buffer.from('x')));
        session.sendFrameQueue();
        (session as any).handleACK(ackFor(decodeSent(sent[0]!).sequenceNumber));

        expect(session.getRTT()).not.toBeNull();
        expect(session.getRTT()!).toBeGreaterThanOrEqual(0);
    });
});

describe('H2 - out of order datagrams', () => {
    it('processes a datagram that arrives after a higher one, and acks both', () => {
        const { session, delivered } = makeReceivingSession();

        (session as any).handleFrameSet(incoming(1, [inboundFrame(1, 1, 0xb1)]));
        (session as any).handleFrameSet(incoming(0, [inboundFrame(0, 0, 0xa0)]));

        // Reordering must not lose data: both messages are delivered, in order.
        expect(delivered).toEqual([0xa0, 0xb1]);
        // And both datagrams are acknowledged, so the peer stops resending them.
        expect(Array.from((session as any).ackQueue).sort()).toEqual([0, 1]);
        // The hole was filled before the NACK went out.
        expect((session as any).lostFrameSequences.size).toBe(0);
    });
});

describe('H3 - duplicate reliable messages', () => {
    it('delivers a retransmitted message only once', () => {
        const { session, delivered } = makeReceivingSession();

        (session as any).handleFrameSet(incoming(0, [inboundFrame(0, 0, 0xa0)]));
        // Same message, new datagram: this is what a retransmission looks like.
        (session as any).handleFrameSet(incoming(1, [inboundFrame(0, 0, 0xa0)]));

        expect(delivered).toEqual([0xa0]);
    });

    it('rejects a message far beyond the receive window instead of buffering it', () => {
        const { session, delivered } = makeReceivingSession();
        (session as any).handleFrameSet(incoming(0, [inboundFrame(500_000, 0, 0xff)]));
        expect(delivered).toEqual([]);
        expect((session as any).receivedReliableIndexes.size).toBe(0);
    });
});

describe('H5 - split message limits', () => {
    it('refuses more concurrent reassemblies than the cap', () => {
        const { session } = makeSession();
        for (let id = 0; id < 200; id++) {
            const fragment = new Frame();
            fragment.reliability = FrameReliability.UNRELIABLE;
            fragment.orderChannel = 0;
            fragment.fragmentId = id;
            fragment.fragmentIndex = 0;
            fragment.fragmentSize = 4; // never completes
            fragment.content = Buffer.from([0xfe]);
            session.handleFragment(fragment);
        }
        expect((session as any).fragmentsQueue.size).toBeLessThanOrEqual(64);
    });

    it('rejects an absurd fragment count', () => {
        const { session } = makeSession();
        const fragment = new Frame();
        fragment.reliability = FrameReliability.UNRELIABLE;
        fragment.orderChannel = 0;
        fragment.fragmentId = 1;
        fragment.fragmentIndex = 0;
        fragment.fragmentSize = 1_000_000;
        fragment.content = Buffer.from([0xfe]);
        session.handleFragment(fragment);
        expect((session as any).fragmentsQueue.size).toBe(0);
    });

    it('abandons a reassembly that never completes', () => {
        const { session } = makeSession();
        const fragment = new Frame();
        fragment.reliability = FrameReliability.UNRELIABLE;
        fragment.orderChannel = 0;
        fragment.fragmentId = 7;
        fragment.fragmentIndex = 0;
        fragment.fragmentSize = 2;
        fragment.content = Buffer.from([0xfe]);
        session.handleFragment(fragment);
        expect((session as any).fragmentsQueue.size).toBe(1);

        session.update(monotonicNow() + 60_000);
        expect((session as any).fragmentsQueue.size).toBe(0);
    });
});

describe('P4 - acknowledgements are resolved without expanding ranges', () => {
    /** Builds an ACK/NACK datagram naming [start..end] as a single range record. */
    const rangeDatagram = (id: number, start: number, end: number) => {
        const stream = new BinaryStream();
        stream.writeByte(id);
        stream.writeUnsignedShort(1);
        stream.writeBoolean(false); // range
        stream.writeUnsignedTriadLE(start);
        stream.writeUnsignedTriadLE(end);
        return stream.getBuffer();
    };

    it('decodes the full 24 bit space from ten bytes without allocating it', () => {
        const datagram = rangeDatagram(0xc0, 0, 0xffffff);
        expect(datagram.byteLength).toBe(10);

        const ack = new ACK(datagram);
        const started = process.hrtime.bigint();
        ack.decode();
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

        expect(ack.ranges).toEqual([{ start: 0, end: 0xffffff }]);
        expect(ack.sequenceNumbers).toEqual([]); // nothing was expanded
        expect(elapsedMs).toBeLessThan(50); // used to take ~350 ms and ~128 MiB
    });

    it('acknowledges exactly the datagrams the range covers, and no others', () => {
        const { session, sent } = makeSession();
        for (let i = 0; i < 5; i++) {
            session.sendFrame(gameFrame(Buffer.from(`m${i}`)));
            session.sendFrameQueue();
        }
        const sequences = sent.map((d) => decodeSent(d).sequenceNumber);
        expect((session as any).resendBuffer.size).toBe(5);

        // A range that covers the first three datagrams, plus sequence numbers we never sent.
        const ack = new ACK(rangeDatagram(0xc0, sequences[0]!, sequences[2]!));
        ack.decode();
        (session as any).handleACK(ack);

        expect((session as any).resendBuffer.size).toBe(2);
        expect((session as any).datagramHistory.size).toBe(2);
        expect([...(session as any).datagramHistory.keys()]).toEqual([sequences[3], sequences[4]]);
    });

    it('is unmoved by a range naming datagrams that were never sent', () => {
        const { session, sent } = makeSession();
        session.sendFrame(gameFrame(Buffer.from('only')));
        session.sendFrameQueue();
        const before = sent.length;

        const nack = new NACK(rangeDatagram(0xa0, 0x800000, 0xffffff));
        nack.decode();
        (session as any).handleNACK(nack);

        expect(sent.length).toBe(before); // nothing matched, nothing retransmitted
        expect((session as any).resendBuffer.size).toBe(1);
    });

    it('retransmits in ascending sequence order whatever order the records claim', () => {
        const { session, sent } = makeSession();
        for (let i = 0; i < 3; i++) {
            session.sendFrame(gameFrame(Buffer.from(`m${i}`)));
            session.sendFrameQueue();
        }
        const sequences = sent.map((d) => decodeSent(d).sequenceNumber);

        // Records listed newest first; the retransmission must still go out oldest first.
        const nack = new NACK();
        nack.sequenceNumbers = [sequences[2]!, sequences[0]!, sequences[1]!];
        const before = sent.length;
        (session as any).handleNACK(nack);

        const requeued = decodeSent(sent[before]!).frames.map((f) => f.content.toString());
        expect(requeued).toEqual(['m0', 'm1', 'm2']);
    });

    it('is reset by the packet pool along with everything else', async () => {
        const { default: PacketPool } = await import('./protocol/PacketPool');
        const pool = new PacketPool();

        const ack = pool.getAckInstance();
        ack.reuse(rangeDatagram(0xc0, 1, 9));
        ack.decode();
        expect(ack.ranges.length).toBe(1);

        pool.returnAck(ack);
        expect(ack.ranges).toEqual([]);
        expect(pool.getAckInstance()).toBe(ack); // same recycled instance, now clean
    });
});

describe('P7 - acknowledgement encoding', () => {
    // Expected bytes written out by hand from the RakNet record format, so the test pins
    // the wire format itself rather than just "whatever the encoder did last time".
    // Layout: [id][recordCount:uint16 BE]{ [1|0][triadLE start] (+[triadLE end] if range) }
    const cases: Array<[string, number[], number[]]> = [
        ['a single sequence number', [5], [0xc0, 0x00, 0x01, 0x01, 0x05, 0x00, 0x00]],
        ['one contiguous run', [1, 2, 3], [0xc0, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x03, 0x00, 0x00]],
        [
            'a run followed by a single',
            [1, 2, 3, 7],
            [0xc0, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00, 0x03, 0x00, 0x00, 0x01, 0x07, 0x00, 0x00]
        ],
        [
            'three scattered singles',
            [2, 5, 9],
            [0xc0, 0x00, 0x03, 0x01, 0x02, 0x00, 0x00, 0x01, 0x05, 0x00, 0x00, 0x01, 0x09, 0x00, 0x00]
        ],
        ['nothing at all', [], [0xc0, 0x00, 0x00]]
    ];

    it.each(cases)('encodes %s', (_name, sequenceNumbers, expected) => {
        const ack = new ACK();
        ack.sequenceNumbers = [...sequenceNumbers];
        ack.encode();
        expect([...ack.getBuffer()]).toEqual(expected);
    });

    it('sorts before collapsing, so arrival order does not change the bytes', () => {
        const ordered = new ACK();
        ordered.sequenceNumbers = [1, 2, 3, 7];
        ordered.encode();

        const shuffled = new ACK();
        shuffled.sequenceNumbers = [7, 2, 1, 3];
        shuffled.encode();

        expect(shuffled.getBuffer().equals(ordered.getBuffer())).toBe(true);
    });

    it('uses the NACK id for NACK', () => {
        const nack = new NACK();
        nack.sequenceNumbers = [5];
        nack.encode();
        expect(nack.getBuffer()[0]).toBe(0xa0);
    });

    it('survives a round trip through the decoder', () => {
        const ack = new ACK();
        ack.sequenceNumbers = [1, 2, 3, 7, 8, 40];
        ack.encode();

        const decoded = new ACK(ack.getBuffer());
        decoded.decode();
        expect(decoded.ranges).toEqual([
            { start: 1, end: 3 },
            { start: 7, end: 8 },
            { start: 40, end: 40 }
        ]);
    });
});

describe('P2 - direct datagram encoder', () => {
    /** Every reliability, whole and fragmented, with every optional field populated. */
    const everyFrameShape = (): Frame[] => {
        const shapes: Frame[] = [];
        for (let reliability = 0; reliability <= 7; reliability++) {
            for (const fragmented of [false, true]) {
                const frame = new Frame();
                frame.reliability = reliability as FrameReliability;
                frame.reliableIndex = 0x123456;
                frame.sequenceIndex = 0xabcdef;
                frame.orderIndex = 0x0f0f0f;
                frame.orderChannel = 3;
                frame.content = Buffer.from(`payload for reliability ${reliability}`);
                if (fragmented) {
                    frame.fragmentSize = 4;
                    frame.fragmentId = 0x1234;
                    frame.fragmentIndex = 2;
                }
                shapes.push(frame);
            }
        }
        return shapes;
    };

    it('writeInto produces the same bytes as toBinary, for every frame shape', () => {
        for (const frame of everyFrameShape()) {
            const reference = frame.toBinary().getBuffer();
            const out = Buffer.alloc(frame.getByteLength());
            const end = frame.writeInto(out, 0);

            expect(end).toBe(out.byteLength); // getByteLength agrees with what was written
            expect(out.equals(reference)).toBe(true);
        }
    });

    it('getByteLength matches the bytes toBinary actually emits', () => {
        for (const frame of everyFrameShape()) {
            expect(frame.getByteLength()).toBe(frame.toBinary().getBuffer().byteLength);
        }
    });

    it('round-trips a datagram back to the frames it was built from', () => {
        const frames = everyFrameShape();
        const frameSet = new FrameSet();
        frameSet.sequenceNumber = 0x424242;
        frameSet.frames = frames;
        frameSet.encode();

        const decoded = decodeSent(frameSet.getBuffer());
        expect(decoded.sequenceNumber).toBe(0x424242);
        expect(decoded.frames.length).toBe(frames.length);

        for (const [i, original] of frames.entries()) {
            const parsed = decoded.frames[i]!;
            expect(parsed.reliability).toBe(original.reliability);
            expect(parsed.content.equals(original.content)).toBe(true);
            if (original.isReliable()) expect(parsed.reliableIndex).toBe(original.reliableIndex);
            if (original.isSequenced()) expect(parsed.sequenceIndex).toBe(original.sequenceIndex);
            if (original.isOrdered()) {
                expect(parsed.orderIndex).toBe(original.orderIndex);
                expect(parsed.orderChannel).toBe(original.orderChannel);
            }
            if (original.isFragmented()) {
                expect(parsed.fragmentSize).toBe(original.fragmentSize);
                expect(parsed.fragmentId).toBe(original.fragmentId);
                expect(parsed.fragmentIndex).toBe(original.fragmentIndex);
            }
        }
    });

    it('emits the datagram header RakNet expects', () => {
        const frameSet = new FrameSet();
        frameSet.sequenceNumber = 1;
        frameSet.frames = [gameFrame(Buffer.from([0xfe]))];
        frameSet.frames[0]!.reliableIndex = 0;
        frameSet.frames[0]!.orderIndex = 0;
        frameSet.encode();

        const buffer = frameSet.getBuffer();
        expect(buffer[0]! & 0x80).toBe(0x80); // BitFlags.VALID
        expect(buffer.readUIntLE(1, 3)).toBe(1); // sequence number, little endian triad
    });
});

describe('P6 - output queue MTU accounting', () => {
    // DATAGRAM_HEADER_BYTE_LENGTH (6) + n * frame size must stay within getMTU().
    const MTU = 1400;
    const USABLE = MTU - 28; // getMTU() subtracts the UDP header

    it('packs the same number of frames per datagram as summing the queue did', () => {
        const { session, sent } = makeSession(MTU);
        const frameSize = 10 + 100; // 3 header + 3 reliable + 4 ordered + 100 content
        const perDatagram = Math.floor((USABLE - 6) / frameSize);
        expect(perDatagram).toBe(12); // pins the arithmetic, not just the implementation

        for (let i = 0; i < perDatagram * 2; i++) session.sendFrame(gameFrame(Buffer.alloc(100, 0x42)));
        session.sendFrameQueue();

        expect(sent.length).toBe(2);
        for (const datagram of sent) {
            expect(decodeSent(datagram).frames.length).toBe(perDatagram);
            expect(datagram.byteLength).toBeLessThanOrEqual(USABLE);
        }
    });

    it('never exceeds the MTU across a range of message sizes', () => {
        for (const size of [1, 7, 63, 200, 511, 1000]) {
            const { session, sent } = makeSession(MTU);
            for (let i = 0; i < 40; i++) session.sendFrame(gameFrame(Buffer.alloc(size, 0x42)));
            session.sendFrameQueue();
            for (const datagram of sent) expect(datagram.byteLength).toBeLessThanOrEqual(USABLE);
        }
    });

    it('resets the running total after every flush, whoever triggers it', () => {
        const { session, sent } = makeSession(MTU);
        // IMMEDIATE flushes through a different path than the MTU check.
        session.sendFrame(gameFrame(Buffer.alloc(100, 0x42)), RakNetPriority.IMMEDIATE);
        expect(sent.length).toBe(1);
        expect((session as any).outputFrameQueueByteLength).toBe(6);

        // The queue must now accept a full datagram's worth again.
        for (let i = 0; i < 12; i++) session.sendFrame(gameFrame(Buffer.alloc(100, 0x42)));
        expect(sent.length).toBe(1); // still nothing flushed: exactly 12 fit
        session.sendFrameQueue();
        expect(decodeSent(sent[1]!).frames.length).toBe(12);
    });
});

describe('P5 - reliability predicates', () => {
    // The truth table the `[...].includes(reliability)` predicates encoded, pinned so the
    // lookup table that replaced them cannot drift from it.
    const expected: Array<[FrameReliability, boolean, boolean, boolean, boolean]> = [
        //                                            reliable, sequenced, ordered, orderedExclusive
        [FrameReliability.UNRELIABLE, false, false, false, false],
        [FrameReliability.UNRELIABLE_SEQUENCED, false, true, true, false],
        [FrameReliability.RELIABLE, true, false, false, false],
        [FrameReliability.RELIABLE_ORDERED, true, false, true, true],
        [FrameReliability.RELIABLE_SEQUENCED, true, true, true, false],
        [FrameReliability.UNRELIABLE_WITH_ACK_RECEIPT, false, false, false, false],
        [FrameReliability.RELIABLE_WITH_ACK_RECEIPT, true, false, false, false],
        [FrameReliability.RELIABLE_ORDERED_WITH_ACK_RECEIPT, true, false, true, true]
    ];

    it.each(expected)('classifies reliability %i', (reliability, reliable, sequenced, ordered, orderedExclusive) => {
        const frame = new Frame();
        frame.reliability = reliability;
        expect(frame.isReliable()).toBe(reliable);
        expect(frame.isSequenced()).toBe(sequenced);
        expect(frame.isOrdered()).toBe(ordered);
        expect(frame.isOrderedExclusive()).toBe(orderedExclusive);
    });

    it('treats a reliability outside the enum as having no traits', () => {
        const frame = new Frame();
        frame.reliability = 99 as FrameReliability;
        expect(frame.isReliable()).toBe(false);
        expect(frame.isSequenced()).toBe(false);
        expect(frame.isOrdered()).toBe(false);
        expect(frame.isOrderedExclusive()).toBe(false);
    });

    it('agrees with getByteLength on every reliability', () => {
        for (const [reliability] of expected) {
            const frame = new Frame();
            frame.reliability = reliability;
            frame.content = Buffer.alloc(10);
            const byHand =
                3 +
                10 +
                (frame.isReliable() ? 3 : 0) +
                (frame.isSequenced() ? 3 : 0) +
                (frame.isOrdered() ? 4 : 0) +
                (frame.isFragmented() ? 10 : 0);
            expect(frame.getByteLength()).toBe(byHand);
        }
    });
});

describe('P1 - split reassembly is byte-exact', () => {
    /** A session that records what it hands up to the application. */
    const makeReceiver = () => {
        const received: Frame[] = [];
        const listener: any = {
            getLogger: () => logger,
            sendPacket: vi.fn(),
            emit: (event: string, frame: Frame) => {
                if (event === 'encapsulated') received.push(frame);
            },
            removeSession: vi.fn()
        };
        const session = new Session(listener, 1400, { address: '5.6.7.8', port: 19133, family: 'IPv4', size: 0 }, 2n);
        (session as any).state = SessionStatus.CONNECTED;
        return { session, received };
    };

    /** A payload where every byte differs from its neighbours, so misordering shows up. */
    const patterned = (byteLength: number) => {
        const payload = Buffer.allocUnsafe(byteLength);
        for (let i = 0; i < byteLength; i++) payload[i] = (i * 31 + 7) & 0xff;
        payload[0] = 0xfe; // not a control message id
        return payload;
    };

    it('delivers a fragmented message identical to the one that was sent', () => {
        const { session: sender, sent } = makeSession();
        const payload = patterned(64 * 1024);
        sender.sendFrame(gameFrame(payload));
        expect(sent.length).toBeGreaterThan(1); // it really was split

        const { session: receiver, received } = makeReceiver();
        for (const datagram of sent) receiver.handle(datagram);

        expect(received.length).toBe(1);
        expect(received[0]!.content.byteLength).toBe(payload.byteLength);
        expect(received[0]!.content.equals(payload)).toBe(true);
    });

    it('reassembles in fragmentIndex order, not arrival order', () => {
        const { session: sender, sent } = makeSession();
        const payload = patterned(16 * 1024);
        sender.sendFrame(gameFrame(payload));

        const { session: receiver, received } = makeReceiver();
        for (const datagram of [...sent].reverse()) receiver.handle(datagram);

        expect(received.length).toBe(1);
        expect(received[0]!.content.equals(payload)).toBe(true);
    });

    it('keeps two interleaved split messages apart', () => {
        const { session: sender, sent } = makeSession();
        const first = patterned(8 * 1024);
        const second = patterned(12 * 1024);
        second[1] = 0xaa; // make the two payloads distinguishable
        sender.sendFrame(gameFrame(first));
        const boundary = sent.length;
        sender.sendFrame(gameFrame(second));

        // Interleave the two messages' datagrams.
        const a = sent.slice(0, boundary);
        const b = sent.slice(boundary);
        const interleaved: Buffer[] = [];
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) interleaved.push(a[i]!);
            if (b[i]) interleaved.push(b[i]!);
        }

        const { session: receiver, received } = makeReceiver();
        for (const datagram of interleaved) receiver.handle(datagram);

        expect(received.length).toBe(2);
        expect(received[0]!.content.equals(first)).toBe(true);
        expect(received[1]!.content.equals(second)).toBe(true);
    });
});

describe('H6 / H10 - handshake and disconnect reliability', () => {
    it('sends ConnectionRequestAccepted reliably', async () => {
        const { session } = makeSession();
        const request = new (await import('./protocol/login/ConnectionRequest')).default();
        request.clientGUID = 1n;
        request.requestTimestamp = 2n;
        request.encode();

        const reply = await session.handleConnectionRequest(request.getBuffer());
        expect(reply.reliability).toBe(FrameReliability.RELIABLE_ORDERED);
        expect(reply.isReliable()).toBe(true);
    });

    it('sends the disconnect notification reliably', () => {
        const { session, sent } = makeSession();
        session.close();

        const frame = decodeSent(sent.at(-1)!).frames[0]!;
        expect(frame.reliability).toBe(FrameReliability.RELIABLE_ORDERED);
        expect(frame.content[0]).toBe(0x15); // ID_DISCONNECTION_NOTIFICATION
    });
});

describe('H8 - split unreliable messages are upgraded', () => {
    it('promotes UNRELIABLE to RELIABLE before splitting', () => {
        const { session, sent } = makeSession();
        const frame = new Frame();
        frame.reliability = FrameReliability.UNRELIABLE;
        frame.orderChannel = 0;
        frame.content = Buffer.alloc(4000, 0x41);
        session.sendFrame(frame);

        const fragments = sent.map(decodeSent).map((fs) => fs.frames[0]!);
        expect(fragments.length).toBeGreaterThan(1);
        expect(fragments.every((f) => f.reliability === FrameReliability.RELIABLE)).toBe(true);
        expect(fragments.every((f) => f.isReliable())).toBe(true);
    });
});

describe('H9 - server GUID', () => {
    it('is random and non-zero', async () => {
        const { default: ServerSocket } = await import('./ServerSocket');
        const name: any = { toString: () => 'x', setOnlinePlayerCount: vi.fn() };
        const guids = new Set<bigint>();
        for (let i = 0; i < 8; i++) {
            const server = new ServerSocket(10, false, name, logger);
            guids.add(server.getServerGuid());
            server.kill();
        }
        expect(guids.size).toBe(8);
        expect(guids.has(0n)).toBe(false);
    });
});

describe('M1 - 24 bit counters wrap', () => {
    it('wraps the reliable index rather than overflowing the triad field', () => {
        const { session, sent } = makeSession();
        (session as any).outputReliableIndex = 0xffffff;

        session.sendFrame(gameFrame(Buffer.from('a')));
        session.sendFrameQueue();
        session.sendFrame(gameFrame(Buffer.from('b')));
        session.sendFrameQueue();

        expect(decodeSent(sent[0]!).frames[0]!.reliableIndex).toBe(0xffffff);
        expect(decodeSent(sent[1]!).frames[0]!.reliableIndex).toBe(0);
    });

    it('wraps the ordering index', () => {
        const { session, sent } = makeSession();
        (session as any).outputOrderIndex[0] = 0xffffff;

        session.sendFrame(gameFrame(Buffer.from('a')));
        session.sendFrameQueue();
        session.sendFrame(gameFrame(Buffer.from('b')));
        session.sendFrameQueue();

        expect(decodeSent(sent[0]!).frames[0]!.orderIndex).toBe(0xffffff);
        expect(decodeSent(sent[1]!).frames[0]!.orderIndex).toBe(0);
    });
});

describe('M3 - datagram header is a bitfield', () => {
    it('routes a packet-pair data datagram to the frame set decoder', () => {
        const { session, delivered } = makeReceivingSession();
        const frameSet = new FrameSet();
        frameSet.sequenceNumber = 0;
        frameSet.frames = [inboundFrame(0, 0, 0xa0)];
        frameSet.encode();

        // Flip the header from VALID to VALID | PACKET_PAIR, which 0xf0 masking missed.
        const buffer = Buffer.from(frameSet.getBuffer());
        buffer[0] = 0x80 | 0x10;

        session.handle(buffer);
        expect(delivered).toEqual([0xa0]);
    });
});

describe('M4 - acknowledgements respect the MTU', () => {
    it('splits a large acknowledgement set across datagrams', () => {
        const { session, sent } = makeSession(576);
        // Non consecutive, so nothing collapses into ranges.
        for (let i = 0; i < 2000; i += 2) (session as any).ackQueue.add(i);

        (session as any).sendAcknowledgements();

        expect(sent.length).toBeGreaterThan(1);
        for (const buffer of sent) {
            expect(buffer.byteLength).toBeLessThanOrEqual(session.getMTU());
        }
    });
});

describe('M5 - several sequenced messages can share an ordering index', () => {
    it('keeps them all instead of overwriting the bucket', () => {
        const { session } = makeReceivingSession();
        const buffered: Frame[] = [];
        for (let seq = 0; seq < 3; seq++) {
            const frame = new Frame();
            frame.reliability = FrameReliability.UNRELIABLE_SEQUENCED;
            frame.orderChannel = 0;
            frame.orderIndex = 5; // a future ordering index: gets buffered
            frame.sequenceIndex = seq;
            frame.content = Buffer.from([0xfe, seq]);
            buffered.push(frame);
            (session as any).handleFrame(frame);
        }

        const bucket = (session as any).inputOrderingQueue.get(0).get(5);
        expect(bucket).toHaveLength(3);
        expect(bucket.map((f: Frame) => f.sequenceIndex)).toEqual([0, 1, 2]);
    });
});

describe('M6 - isOlderOrderedFrame matches the reference', () => {
    it('agrees with RakNet at the half range boundary', () => {
        const { session } = makeSession();

        // RakNet's "older" window is [current - maxRange/2 + 1, current). With
        // current = 0x800000 that starts at 2, so 2 is inside and 1 is not. The previous
        // implementation omitted the +1 and wrongly called 1 older.
        // https://github.com/facebookarchive/RakNet/blob/master/Source/ReliabilityLayer.cpp#L2907
        expect(session.isOlderOrderedFrame(2, 0x800000)).toBe(true);
        expect(session.isOlderOrderedFrame(1, 0x800000)).toBe(false);

        // Ordinary cases stay intuitive.
        expect(session.isOlderOrderedFrame(4, 5)).toBe(true);
        expect(session.isOlderOrderedFrame(6, 5)).toBe(false);
        // And it wraps: 0xfffffe is older than 1.
        expect(session.isOlderOrderedFrame(0xfffffe, 1)).toBe(true);
    });
});

describe('M7 - packet pool reuse', () => {
    it('rewinds a recycled instance instead of decoding from a stale cursor', () => {
        const { session, delivered } = makeReceivingSession();

        for (let seq = 0; seq < 3; seq++) {
            const frameSet = new FrameSet();
            frameSet.sequenceNumber = seq;
            frameSet.frames = [inboundFrame(seq, seq, 0xa0 + seq)];
            frameSet.encode();
            session.handle(frameSet.getBuffer());
        }

        // Every datagram decoded correctly, so the pooled instance was reset each time.
        expect(delivered).toEqual([0xa0, 0xa1, 0xa2]);
        expect((session as any).packetPool.framesetPool.length).toBeGreaterThan(0);
    });
});

describe('M10 - ping and disconnect work while connecting', () => {
    it('answers a ping before the handshake completes', async () => {
        const { session, sent } = makeSession();
        expect(session.getState()).toBe(0); // CONNECTING

        // Built by hand: Packet.getBuffer() returns the construction buffer when one was
        // supplied, so encoding into a buffer-backed instance would not give us the bytes.
        const pingBuffer = Buffer.alloc(9);
        pingBuffer[0] = 0x00; // ID_CONNECTED_PING
        pingBuffer.writeBigInt64BE(1234n, 1);

        const frame = new Frame();
        frame.reliability = FrameReliability.UNRELIABLE;
        frame.orderChannel = 0;
        frame.content = pingBuffer;
        (session as any).handlePacket(frame);

        await new Promise((resolve) => setImmediate(resolve));
        session.sendFrameQueue();

        const pong = decodeSent(sent.at(-1)!).frames[0]!;
        expect(pong.content[0]).toBe(0x03); // ID_CONNECTED_PONG
    });
});
