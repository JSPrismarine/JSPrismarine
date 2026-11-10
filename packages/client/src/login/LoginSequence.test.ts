import { OfflineAuthProvider } from '@jsprismarine/auth';
import type { LoginCredentials, LoginRequest } from '@jsprismarine/auth/IAuthProvider';
import { Logger } from '@jsprismarine/logger';
import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec, NetworkBinaryStream, NetworkSettingsPacket } from '@jsprismarine/protocol';
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '../Client';
import ClientPacketRegistry from '../net/ClientPacketRegistry';
import ClientSession from '../net/ClientSession';
import type { ITransport, TransportStats } from '../net/ITransport';
import LoginSequence from './LoginSequence';

/** A transport that goes nowhere: batches are pushed in and captured on the way out. */
class FakeTransport extends EventEmitter implements ITransport {
    public readonly sent: Buffer[] = [];

    public async connect(): Promise<void> {}
    public send(payload: Buffer): void {
        this.sent.push(payload);
    }
    public close(): void {}
    public getStats(): TransportStats {
        return { rtt: null, bytesSent: 0, bytesReceived: 0, packetsSent: 0, packetsReceived: 0 };
    }
}

/** An offline identity whose credentials arrive only when the test lets them. */
class GatedAuthProvider extends OfflineAuthProvider {
    private release: () => void = () => {};
    private readonly gate = new Promise<void>((resolve) => {
        this.release = resolve;
    });

    public open(): void {
        this.release();
    }

    public override async createLoginCredentials(request: LoginRequest): Promise<LoginCredentials> {
        await this.gate;
        return super.createLoginCredentials(request);
    }
}

const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('LoginSequence settling', () => {
    it('keeps the session busy while the login waits on its auth provider', async () => {
        const transport = new FakeTransport();
        const registry = new ClientPacketRegistry();
        registry.registerAll([NetworkSettingsPacket]);
        const session = new ClientSession(transport, registry, new Logger('error'));
        const auth = new GatedAuthProvider({ displayName: 'Gated' });
        const login = new LoginSequence(session, auth, new Logger('error'), {
            protocolVersion: PROTOCOL_VERSION,
            serverAddress: '127.0.0.1:19132',
            timeoutMs: 600_000
        });
        void login.run().catch(() => {});
        await session.settled();
        expect(transport.sent).toHaveLength(1);

        const settings = new NetworkSettingsPacket({
            compressionThreshold: 1,
            compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
            clientThrottlingEnabled: false,
            clientThrottleThreshold: 0,
            clientThrottleScalar: 0
        });
        transport.emit(
            'batch',
            await BatchCodec.uncompressed().encodeAsync([settings.serialize(new NetworkBinaryStream())])
        );
        for (let index = 0; index < 8; index++) await turn();

        // A harness that steps a server reads this to decide whether the client has anything
        // left to say. The Login has not gone out yet, so the answer is no.
        expect(session.isIdle()).toBe(false);

        auth.open();
        await session.settled();
        expect(session.isIdle()).toBe(true);
        // RequestNetworkSettings, then the Login the credentials were waited for.
        expect(transport.sent).toHaveLength(2);
    });
});
