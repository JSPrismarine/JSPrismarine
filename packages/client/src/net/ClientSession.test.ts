import { Logger } from '@jsprismarine/logger';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import {
    BatchCodec,
    CreditsState,
    NetworkBinaryStream,
    PlayStatus,
    PlayStatusPacket,
    ShowCreditsPacket as FieldShowCreditsPacket,
    TextPacket,
    TextPacketType
} from '@jsprismarine/protocol';
import { describe, expect, it, vi } from 'vitest';
import { ShowCreditsPacket } from '../Credits';
import { FakeTransport } from '../testing/fakeTransport.test.helper';
import ClientPacketRegistry from './ClientPacketRegistry';
import ClientSession from './ClientSession';

import type { NetworkPacket, PlayStatusData } from '@jsprismarine/protocol';
import type { ClientPhase } from './ClientHandler';

const logger = new Logger('error');

const encode = (packet: NetworkPacket<any>): Buffer => packet.serialize(new NetworkBinaryStream());

const newSession = () => {
    const transport = new FakeTransport();
    const registry = new ClientPacketRegistry();
    registry.registerAll([PlayStatusPacket, TextPacket]);

    return { transport, session: new ClientSession(transport, registry, logger) };
};

const zlib = () => BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 1 });

/** A Text packet padded out to `size`, so inflating it costs real time. */
const bigText = (size: number): NetworkPacket<any> => {
    let message = '';
    for (let i = 0; message.length < size; i++) message += `${i.toString(36)} the quick brown fox `;

    return new TextPacket({
        type: TextPacketType.Raw,
        needsTranslation: false,
        message,
        xuid: '',
        platformChatId: '',
        filtered: ''
    });
};

describe('ClientSession ordering', () => {
    it('dispatches batches in the order they arrived, however long each takes to inflate', async () => {
        // The bug this pins down: decoding is asynchronous because inflating runs on libuv's
        // thread pool, so a batch takes as long as its *size* says. Unchained, a large batch
        // is overtaken by every small one that arrives while it is still inflating - and a
        // 37 KiB StartGame surfacing after the PlayStatus that was meant to follow it is not
        // a slow StartGame, it is a missing one. It cost a whole login before it was found.
        const { transport, session } = newSession();
        session.enableCompression({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 1 });

        const order: number[] = [];
        session.on('packet', (packet: { id: number }) => order.push(packet.id));

        const codec = zlib();
        const batches = [
            await codec.encodeAsync([encode(bigText(64_000))]),
            ...(await Promise.all(
                Array.from({ length: 5 }, async () => codec.encodeAsync([encode(new PlayStatusPacket({ status: 0 }))]))
            ))
        ];

        // Delivered back to back, exactly as RakNet delivers them.
        for (const batch of batches) transport.emit('batch', batch);

        await vi.waitFor(() => expect(order.length).toBe(6), { timeout: 5_000 });

        // The big one is first because it arrived first, full stop.
        expect(order[0]).toBe(0x09);
        expect(order.slice(1)).toEqual([0x02, 0x02, 0x02, 0x02, 0x02]);
    });

    it('keeps going after a batch it cannot decode', async () => {
        const { transport, session } = newSession();
        session.enableCompression({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 1 });

        const seen: number[] = [];
        session.on('packet', (packet: { id: number }) => seen.push(packet.id));

        // Not a batch at all, then a perfectly good one behind it. A poisoned chain would
        // swallow everything after the failure.
        transport.emit('batch', Buffer.from([0x00, 0x01, 0x02]));
        transport.emit('batch', await zlib().encodeAsync([encode(new PlayStatusPacket({ status: 3 }))]));

        await vi.waitFor(() => expect(seen).toEqual([0x02]), { timeout: 5_000 });
    });
});

describe('ClientSession compression state', () => {
    it('sends the first packet with no algorithm prefix, and the next one with', async () => {
        const { transport, session } = newSession();

        await session.send(new PlayStatusPacket({ status: 0 }));
        expect(transport.sent[0]![0]).toBe(0xfe);
        // The second byte is the packet's own length varint, not an algorithm: 1 byte of
        // header plus 4 of payload.
        expect(transport.sent[0]![1]).toBe(5);
        expect(session.isCompressionEnabled()).toBe(false);

        session.enableCompression({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 1 });
        await session.send(new PlayStatusPacket({ status: 0 }));

        expect(session.isCompressionEnabled()).toBe(true);
        expect(transport.sent[1]![1]).toBe(PacketCompressionAlgorithm.ZLIB);
    });
});

describe('ClientPacketRegistry', () => {
    it('reads an id from a multi-byte header rather than from the first byte', () => {
        // RequestNetworkSettings is 0xc1, which is two bytes as a varint. Reading the first
        // byte works there by coincidence and stops working above 0xff.
        const registry = new ClientPacketRegistry();
        registry.register(PlayStatusPacket);

        expect(ClientPacketRegistry.readPacketId(Buffer.from([0xc1, 0x01]))).toBe(0xc1);
        expect(ClientPacketRegistry.readPacketId(Buffer.from([0x02]))).toBe(0x02);
        // 0x133, whose low byte is 0x33 - a completely different packet.
        expect(ClientPacketRegistry.readPacketId(Buffer.from([0xb3, 0x02]))).toBe(0x133);
    });

    it('records an id it has no codec for instead of throwing', () => {
        const registry = new ClientPacketRegistry();
        registry.register(PlayStatusPacket);

        expect(registry.decode(Buffer.from([0x7a, 0x00]))).toBeNull();
        expect(registry.getUnknownIds()).toEqual([0x7a]);
    });

    it('refuses to register two classes on one id', () => {
        const registry = new ClientPacketRegistry();
        registry.register(PlayStatusPacket);

        expect(() => registry.register(PlayStatusPacket)).toThrow(/already registered/);
    });
});

describe('ClientSession settling', () => {
    it('is idle only once every batch it got is handled and every send reached the transport', async () => {
        const { transport, session } = newSession();
        session.enableCompression({ algorithm: PacketCompressionAlgorithm.ZLIB, threshold: 1 });
        const received: number[] = [];
        session.on('packet', (packet: { id: number }) => received.push(packet.id));
        expect(session.isIdle()).toBe(true);

        transport.emit('batch', await zlib().encodeAsync([encode(bigText(64_000))]));
        const sending = session.send(bigText(64_000));
        expect(session.isIdle()).toBe(false);

        await session.settled();
        expect(session.isIdle()).toBe(true);
        expect(received).toHaveLength(1);
        expect(transport.sent).toHaveLength(1);
        await sending;
    });
});

describe('ClientSession handlers', () => {
    const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
    const spawned = () => new PlayStatusPacket({ status: PlayStatus.PlayerSpawn });

    it('runs a handler for its packet only in the phases it lists', async () => {
        const { transport, session } = newSession();
        const seen: { phase: ClientPhase; data: PlayStatusData }[] = [];
        session.registerHandler(PlayStatusPacket, {
            phases: ['play'],
            handle: (data) => void seen.push({ phase: session.getPhase(), data })
        });

        expect(session.getPhase()).toBe('login');
        await transport.deliver(spawned());
        await session.settled();
        expect(seen).toEqual([]);

        session.setPhase('play');
        await transport.deliver(spawned());
        await session.settled();
        expect(seen).toEqual([{ phase: 'play', data: { status: PlayStatus.PlayerSpawn } }]);
    });

    it('runs handlers in the order they were registered, and a removed one no more', async () => {
        const { transport, session } = newSession();
        const order: string[] = [];
        const removeFirst = session.registerHandler(PlayStatusPacket, {
            phases: ['login'],
            handle: () => void order.push('first')
        });
        session.registerHandler(PlayStatusPacket, { phases: ['login'], handle: () => void order.push('second') });

        await transport.deliver(spawned());
        await session.settled();
        removeFirst();
        await transport.deliver(spawned());
        await session.settled();

        expect(order).toEqual(['first', 'second', 'second']);
    });

    it('still runs a handler for the packet it was read for when an earlier one removes it', async () => {
        const { transport, session } = newSession();
        const order: string[] = [];
        let removeSecond = (): void => {};
        session.registerHandler(PlayStatusPacket, {
            phases: ['login'],
            handle: () => {
                order.push('first');
                removeSecond();
            }
        });
        removeSecond = session.registerHandler(PlayStatusPacket, {
            phases: ['login'],
            handle: () => void order.push('second')
        });

        await transport.deliver(spawned(), spawned());
        await session.settled();

        expect(order).toEqual(['first', 'second', 'first']);
    });

    it('stays busy until the work a handler returned settles', async () => {
        const { transport, session } = newSession();
        let release = (): void => {};
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        session.registerHandler(PlayStatusPacket, { phases: ['login'], handle: () => gate });

        await transport.deliver(spawned());
        for (let index = 0; index < 8; index++) await turn();
        expect(session.isIdle()).toBe(false);

        release();
        await session.settled();
        expect(session.isIdle()).toBe(true);
    });

    it('logs a handler that fails and carries on with the next handler and the next packet', async () => {
        const { transport, session } = newSession();
        const warn = vi.spyOn(logger, 'warn');
        const reached: number[] = [];
        session.registerHandler(PlayStatusPacket, {
            phases: ['login'],
            handle: () => {
                throw new Error('thrown');
            }
        });
        session.registerHandler(PlayStatusPacket, {
            phases: ['login'],
            handle: async () => {
                throw new Error('rejected');
            }
        });
        session.registerHandler(PlayStatusPacket, {
            phases: ['login'],
            handle: (data) => void reached.push(data.status)
        });

        try {
            await transport.deliver(spawned(), new PlayStatusPacket({ status: PlayStatus.LoginSuccess }));
            await session.settled();

            expect(reached).toEqual([PlayStatus.PlayerSpawn, PlayStatus.LoginSuccess]);
            expect(warn).toHaveBeenCalledTimes(4);
        } finally {
            warn.mockRestore();
        }
    });

    it('runs a handler only for packets its own class decoded, not another of the same name', async () => {
        // The protocol's field-based `ShowCreditsPacket` and the client's typed one share a name
        // and an id. The client decodes with its own, so a handler for the other never sees one.
        const transport = new FakeTransport();
        const registry = new ClientPacketRegistry();
        registry.register(ShowCreditsPacket);
        const session = new ClientSession(transport, registry, logger);
        const typed: number[] = [];
        let fieldBased = 0;
        session.registerHandler(ShowCreditsPacket, {
            phases: ['login'],
            handle: (credits) => void typed.push(credits.creditsState)
        });
        session.registerHandler(FieldShowCreditsPacket, { phases: ['login'], handle: () => void fieldBased++ });

        await transport.deliver(new ShowCreditsPacket({ playerRuntimeId: 1n, creditsState: CreditsState.Start }));
        await session.settled();

        expect(typed).toEqual([CreditsState.Start]);
        expect(fieldBased).toBe(0);
    });
});
