import type Dgram from 'node:dgram';
import type { Logger } from './RakNetPeer';

/** Requested UDP socket buffer sizes. The operating system may grant less. */
export interface SocketBufferOptions {
    /** Receive buffer size in bytes. Defaults to 4 MiB. */
    readonly recvBufferSize?: number;
    /** Send buffer size in bytes. Defaults to 4 MiB. */
    readonly sendBufferSize?: number;
}

/** Buffer sizes the operating system reports after applying its limits. */
export interface EffectiveSocketBuffers {
    readonly recvBufferSize: number;
    readonly sendBufferSize: number;
}

/** Rejects invalid requests before a wrapper's asynchronous bind callback runs. */
export const validateSocketBufferOptions = (options: SocketBufferOptions): void => {
    for (const [name, size] of [
        ['receive', options.recvBufferSize ?? 4 * 1024 * 1024],
        ['send', options.sendBufferSize ?? 4 * 1024 * 1024]
    ] as const) {
        if (!Number.isSafeInteger(size) || size <= 0) {
            throw new RangeError(`UDP ${name} buffer size must be a positive safe integer, got ${size}`);
        }
    }
};

/**
 * Configures both UDP buffers after bind and reports the sizes the operating system grants.
 * A kernel limit may clamp a request without throwing, so the getters are the useful result.
 */
export const configureSocketBuffers = (
    socket: Pick<Dgram.Socket, 'setRecvBufferSize' | 'getRecvBufferSize' | 'setSendBufferSize' | 'getSendBufferSize'>,
    logger: Logger,
    options: SocketBufferOptions = {},
    context = 'RakNet/SocketBuffers'
): EffectiveSocketBuffers => {
    const requestedRecv = options.recvBufferSize ?? 4 * 1024 * 1024;
    const requestedSend = options.sendBufferSize ?? 4 * 1024 * 1024;

    validateSocketBufferOptions(options);

    try {
        socket.setRecvBufferSize(requestedRecv);
    } catch (error: unknown) {
        logger.error(error, `${context}/setRecvBufferSize requested=${requestedRecv}`);
    }
    try {
        socket.setSendBufferSize(requestedSend);
    } catch (error: unknown) {
        logger.error(error, `${context}/setSendBufferSize requested=${requestedSend}`);
    }

    const effective = {
        recvBufferSize: socket.getRecvBufferSize(),
        sendBufferSize: socket.getSendBufferSize()
    };
    logger.info(
        `UDP socket buffers requested recv=${requestedRecv} send=${requestedSend}; effective recv=${effective.recvBufferSize} send=${effective.sendBufferSize}`,
        context
    );
    return effective;
};
