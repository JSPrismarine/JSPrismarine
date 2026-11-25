import { describe, expect, it } from 'vitest';

import { javaPacketId } from '@jsprismarine/protocol/java/packet/JavaPacket';
import { LoginStart } from '@jsprismarine/protocol/java/packet/login';
import { NEWEST_JAVA_RELEASE } from '@jsprismarine/protocol/java/versions/javaReleases';

import { javaHandler, JavaPacketHandlers } from './JavaPacketHandler';

describe('JavaPacketHandlers', () => {
    const loginStart = javaHandler(LoginStart, () => {});
    const handlers = new JavaPacketHandlers([loginStart]);

    it('finds a handler by the id its packet has in the connection release', () => {
        const id = javaPacketId(NEWEST_JAVA_RELEASE, LoginStart);

        expect(handlers.lookup(NEWEST_JAVA_RELEASE, 'login', id)).toEqual({ kind: 'handled', handler: loginStart });
    });

    it('reads the id from the release, so another release moves it', () => {
        const moved = { ...NEWEST_JAVA_RELEASE, packets: { login: { serverbound: { hello: 7 } } } };

        expect(handlers.lookup(moved, 'login', 7)).toEqual({ kind: 'handled', handler: loginStart });
    });

    it('reads a handler only in its packet phase', () => {
        const id = javaPacketId(NEWEST_JAVA_RELEASE, LoginStart);

        expect(handlers.lookup(NEWEST_JAVA_RELEASE, 'play', id).kind).not.toBe('handled');
    });

    it('tells a packet the phase has but nothing reads from an id the phase lacks', () => {
        const cookie = NEWEST_JAVA_RELEASE.packets.login?.serverbound?.cookie_response;

        expect(cookie).toBeDefined();
        expect(handlers.lookup(NEWEST_JAVA_RELEASE, 'login', cookie!)).toEqual({ kind: 'unread' });
        expect(handlers.lookup(NEWEST_JAVA_RELEASE, 'login', 0x7f)).toEqual({ kind: 'unknown' });
    });
});
