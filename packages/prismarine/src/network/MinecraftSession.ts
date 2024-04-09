import type {RakNetSession } from '@jsprismarine/raknet';
import { ConnectionPriority, Protocol } from '@jsprismarine/raknet';
import CompressionProvider from './CompressionProvider';
import  type{ Logger } from '../';
import type { NetworkPacket } from '@jsprismarine/protocol';
import { NetworkBinaryStream,} from '@jsprismarine/protocol';
import assert from 'node:assert';
import PacketRegistry2 from './PacketRegistry2';
import Bottleneck from 'bottleneck';
import { deflateRaw } from 'node:zlib';
import { promisify } from 'node:util';

const asyncDeflateRaw = promisify(deflateRaw);

/**
 * Act as the first connection layer, handles everything related to batching,
 * queuing and encrypting of Minecraft packets in a hypotetical session.
 * TODO: implement ticking, batching, queues, encryption.
 */
export default class MinecraftSession {
    protected readonly rakSession: RakNetSession;
    private readonly logger?: Logger;

    protected hasCompression = false;

    // private readonly inRawBufferQueue: Array<Buffer> = [];

    protected readonly inPacketQueue: Array<{ id: number; packetData: unknown }> = [];

    // Subject to race conditions
    protected readonly outPacketQueue: Array<NetworkPacket<unknown>> = [];

    private readonly inputLimiter = new Bottleneck({
        maxConcurrent: 5,
        minTime: (1 / 20) * 1000 // Minecraft Tick Time (ms)
    });

    private readonly outputLimiter = new Bottleneck({
        maxConcurrent: 1,
        minTime: (1 / 20) * 1000 // Minecraft Tick Time (ms)
    });

    public static readonly MINECRAFT_WRAPPER_ID = 0xfe;

    public constructor(session: RakNetSession, logger?: Logger) {
        this.rakSession = session;
        this.logger = logger;
    }

    public tick(): void {}

    public handleRawPacket(buffer: Buffer): void {
        this.inputLimiter.schedule(() => this.processInputBuffer(buffer));
    }

    protected triggerOutputProcessing() {
        this.outputLimiter.schedule(() => this.processOutRawQueue());
    }

    private async processInputBuffer(buffer: Buffer): /* Promise<Array<NetworkPacket<unknown>>>*/ Promise<void> {
        assert(
            buffer.readUint8() === MinecraftSession.MINECRAFT_WRAPPER_ID,
            `Got invalid raw buffer: ${buffer.toString('hex')}`
        );

        if (this.hasCompression) {
            // offset 0: packet id, offset 1: compression algorithm
            buffer = await CompressionProvider.fromAlgorithm(buffer.readUint8(1))(buffer.subarray(1));
        }

        // TODO: gloabal streams pool
        // const packets: Array<NetworkPacket<unknown>> = [];
        const stream = new NetworkBinaryStream(/* buffer.subarray(1) */ buffer);
        stream.readByte(); // skip packet id
        do {
            const packetBuffer = stream.readLengthPrefixed();
            console.log(packetBuffer);
            const pid = packetBuffer.readUint8();
            this.inPacketQueue.push({
                id: pid,
                packetData: PacketRegistry2.getPacket(pid).deserialize(new NetworkBinaryStream(packetBuffer))
            });
        } while (!stream.feof());
        // return packets;
    }

    private async processOutRawQueue(): Promise<void> {
        const batchBuffer = new NetworkBinaryStream();
        const packetBuffer = new NetworkBinaryStream();
        while (this.outPacketQueue.length > 0) {
            // TODO: get from pool
            const str = new NetworkBinaryStream();
            this.outPacketQueue.shift()!.serialize(str);
            packetBuffer.writeLengthPrefixed(str.getBuffer());
        }

        if (this.hasCompression) {
            const compressedBuffer = await asyncDeflateRaw(batchBuffer.getBuffer());
            batchBuffer.clear();
            batchBuffer.writeByte(MinecraftSession.MINECRAFT_WRAPPER_ID);
            batchBuffer.writeByte(0); // compression algorithm
            batchBuffer.write(compressedBuffer);
        } else {
            batchBuffer.writeByte(MinecraftSession.MINECRAFT_WRAPPER_ID);
            batchBuffer.write(packetBuffer.getBuffer());
        }

        const sendPacket = new Protocol.Frame();
        sendPacket.reliability = Protocol.FrameReliability.RELIABLE_ORDERED;
        sendPacket.orderChannel = 0;
        sendPacket.content = batchBuffer.getBuffer();

        this.rakSession.sendFrame(sendPacket, ConnectionPriority.NORMAL);
    }

    public enableCompression(): void {
        if (this.hasCompression) {
            throw new Error('Cannot enable compression twice!');
        }
        this.hasCompression = true;
    }

    public forceDisconnect(): void {
        this.rakSession.disconnect();
    }
}
