import { describe, expect, it } from 'vitest';
import Session from './Session';
import type { Logger, RakNetPeer } from './RakNetPeer';

const logger: Logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {},
    debug: () => {},
    silly: () => {}
};

const peer: RakNetPeer = {
    getLogger: () => logger,
    sendPacket: () => {},
    emit: () => true,
    removeSession: () => {}
};

describe('Session.getAddress', () => {
    it.each([
        { address: '192.0.2.1', family: 'IPv4' as const, port: 19132, token: '192.0.2.1:19132' },
        { address: '2001:db8::1', family: 'IPv6' as const, port: 19133, token: '2001:db8::1:19133' },
        { address: 'fe80::abcd%en0', family: 'IPv6' as const, port: 19134, token: 'fe80::abcd%en0:19134' }
    ])('caches and preserves the $family token', ({ address, family, port, token }) => {
        const session = new Session(peer, 1200, { address, family, port, size: 0 }, 1n);

        expect(session.getAddress()).toBe(session.getAddress());
        expect(session.getAddress().toToken()).toBe(token);
    });
});
