import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import UpdateClientOptionsPacket, { GraphicsMode } from '@jsprismarine/protocol/packet/UpdateClientOptionsPacket';
import UpdateClientOptionsHandler from './UpdateClientOptionsHandler';

const fakeSession = () => {
    const logged: string[] = [];
    const server = stub<Server>({
        getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
    });
    const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });

    return { logged, server, session };
};

describe('UpdateClientOptionsHandler', () => {
    it('names both settings when both changed', () => {
        const { logged, server, session } = fakeSession();
        const packet = Object.assign(new UpdateClientOptionsPacket(), {
            graphicsMode: GraphicsMode.RayTraced,
            filterProfanity: false
        });

        new UpdateClientOptionsHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve changed graphics mode RayTraced and profanity filter off']);
    });

    it('says so when neither setting is present', () => {
        const { logged, server, session } = fakeSession();

        new UpdateClientOptionsHandler().handle(new UpdateClientOptionsPacket(), server, session);

        expect(logged).toEqual(['Steve changed no client options']);
    });
});
