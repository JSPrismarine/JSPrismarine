import { OfflineAuthProvider } from '@jsprismarine/auth';
import type { LoginCredentials, LoginRequest } from '@jsprismarine/auth/IAuthProvider';
import { Logger } from '@jsprismarine/logger';
import { DisconnectReason, PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { DisconnectPacket, NetworkSettingsPacket, PacketIdentifier } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '../Client';
import ClientPacketRegistry from '../net/ClientPacketRegistry';
import ClientSession from '../net/ClientSession';
import { FakeTransport } from '../testing/fakeTransport.test.helper';
import LoginSequence from './LoginSequence';

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

const settings = () =>
    new NetworkSettingsPacket({
        compressionThreshold: 1,
        compressionAlgorithm: PacketCompressionAlgorithm.ZLIB,
        clientThrottlingEnabled: false,
        clientThrottleThreshold: 0,
        clientThrottleScalar: 0
    });

const newLogin = (auth: OfflineAuthProvider) => {
    const transport = new FakeTransport();
    const registry = new ClientPacketRegistry();
    registry.registerAll([NetworkSettingsPacket, DisconnectPacket]);
    const session = new ClientSession(transport, registry, new Logger('error'));
    const login = new LoginSequence(session, auth, {
        protocolVersion: PROTOCOL_VERSION,
        serverAddress: '127.0.0.1:19132',
        timeoutMs: 600_000
    });
    return { transport, session, login };
};

describe('LoginSequence settling', () => {
    it('keeps the session busy while the login waits on its auth provider', async () => {
        const auth = new GatedAuthProvider({ displayName: 'Gated' });
        const { transport, session, login } = newLogin(auth);
        void login.run().catch(() => {});
        await session.settled();
        expect(transport.sent).toHaveLength(1);

        await transport.deliver(settings());
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

    it('stops waiting on its auth provider once the login fails, and sends no late Login', async () => {
        const auth = new GatedAuthProvider({ displayName: 'Gated' });
        const { transport, session, login } = newLogin(auth);
        const result = login.run();
        await session.settled();

        await transport.deliver(settings());
        for (let index = 0; index < 8; index++) await turn();
        expect(session.isIdle()).toBe(false);

        login.onTransportClosed('closed');
        await expect(result).rejects.toThrow(/Disconnected during login: closed/);
        // The provider has not answered, and the failed login no longer counts as work.
        await session.settled();
        expect(session.isIdle()).toBe(true);

        auth.open();
        for (let index = 0; index < 8; index++) await turn();
        await session.settled();
        expect(transport.sent).toHaveLength(1);
    });
});

describe('LoginSequence steps', () => {
    it('stops answering once the server has ended the login', async () => {
        const { transport, session, login } = newLogin(new OfflineAuthProvider({ displayName: 'Kicked' }));
        const result = login.run();

        await transport.deliver(
            new DisconnectPacket({ reason: DisconnectReason.UNKNOWN, skipMessage: false, message: 'go away' })
        );
        await expect(result).rejects.toThrow(/Disconnected by the server: go away/);

        // A login that failed has removed its steps: settings that come late sign nothing and
        // send nothing, and the session stays out of play.
        await transport.deliver(settings());
        await session.settled();
        expect((await transport.sentPackets()).map((packet) => ClientPacketRegistry.readPacketId(packet))).toEqual([
            PacketIdentifier.REQUEST_NETWORK_SETTINGS
        ]);
        expect(session.getPhase()).toBe('login');
    });
});
