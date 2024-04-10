import { describe, it, expect, vi } from 'vitest';

import BinaryStream from '@jsprismarine/jsbinaryutils';
import { InetAddress } from '@jsprismarine/raknet';

import { QueryManager } from '../';
import type { Server } from '../';

describe('QueryManager', () => {
    const server: Server = vi.fn().mockImplementation(() => ({
        getLogger: () => ({
            debug: vi.fn(),
            verbose: vi.fn()
        }),
        getSessionManager: () => ({
            getAllPlayers: () => []
        }),
        getRaknet: () => ({
            sendBuffer: vi.fn()
        }),
        on: vi.fn(),
        emit: vi.fn().mockResolvedValue({})
    }))();

    it('handshake', async () => {
        const queryManager = new QueryManager(server);

        let stream = new BinaryStream();
        stream.writeUnsignedShort(65277);
        stream.writeByte(0);
        stream.writeInt(0);
        stream = new BinaryStream(stream.getBuffer());

        const buffer = await queryManager.onRaw(stream.getBuffer(), new InetAddress('0.0.0.0', 19132));
        expect(buffer.toString()).toBe(
            Buffer.from(
                '\u0009\u0000\u0000\u0000\u0000\u0039\u0035\u0031\u0033\u0033\u0030\u0037\u0000',
                'binary'
            ).toString()
        );
    });
});
