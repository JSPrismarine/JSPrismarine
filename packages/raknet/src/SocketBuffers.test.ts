import Dgram from 'node:dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureSocketBuffers } from './SocketBuffers';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), verbose: vi.fn(), debug: vi.fn(), silly: vi.fn() };

describe('configureSocketBuffers', () => {
    let socket: Dgram.Socket | undefined;

    afterEach(() => {
        if (socket) socket.close();
        socket = undefined;
        vi.clearAllMocks();
    });

    it('sets and reads both buffer sizes from a bound UDP socket', async () => {
        const boundSocket = Dgram.createSocket('udp4');
        socket = boundSocket;
        await new Promise<void>((resolve, reject) => {
            boundSocket.once('error', reject);
            boundSocket.bind(0, '127.0.0.1', resolve);
        });

        const effective = configureSocketBuffers(
            boundSocket,
            logger,
            { recvBufferSize: 256 * 1024, sendBufferSize: 256 * 1024 },
            'test'
        );

        expect(effective.recvBufferSize).toBe(boundSocket.getRecvBufferSize());
        expect(effective.sendBufferSize).toBe(boundSocket.getSendBufferSize());
        expect(effective.recvBufferSize).toBeGreaterThan(0);
        expect(effective.sendBufferSize).toBeGreaterThan(0);
        expect(logger.verbose).toHaveBeenCalledWith(expect.stringContaining('effective recv='), 'test');
    });

    it('logs a buffer request rejected by the operating system and reports actual sizes', () => {
        const failed = new Error('unsupported');
        const target = {
            setRecvBufferSize: vi.fn(() => {
                throw failed;
            }),
            getRecvBufferSize: vi.fn(() => 1024),
            setSendBufferSize: vi.fn(() => {
                throw failed;
            }),
            getSendBufferSize: vi.fn(() => 2048)
        };

        expect(configureSocketBuffers(target, logger, { recvBufferSize: 4096, sendBufferSize: 8192 })).toEqual({
            recvBufferSize: 1024,
            sendBufferSize: 2048
        });
        expect(logger.error).toHaveBeenCalledTimes(2);
        // The logger joins strings, so the failure has to arrive as text rather than an Error.
        expect(logger.error).toHaveBeenCalledWith(
            'Could not set the receive buffer, error=unsupported',
            'RakNet/SocketBuffers/setRecvBufferSize requested=4096'
        );
        expect(logger.verbose).toHaveBeenCalledWith(
            expect.stringContaining('effective recv=1024 send=2048'),
            'RakNet/SocketBuffers'
        );
    });

    it('rejects nonpositive and unsafe requested sizes before touching the socket', () => {
        const target = {
            setRecvBufferSize: vi.fn(),
            getRecvBufferSize: vi.fn(() => 1024),
            setSendBufferSize: vi.fn(),
            getSendBufferSize: vi.fn(() => 1024)
        };

        expect(() => configureSocketBuffers(target, logger, { recvBufferSize: 0 })).toThrow(RangeError);
        expect(target.setRecvBufferSize).not.toHaveBeenCalled();
    });
});
