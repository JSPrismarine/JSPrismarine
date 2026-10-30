import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import * as Handlers from '../Handlers';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ShowCreditsPacket, { CreditsState } from '@jsprismarine/protocol/packet/ShowCreditsPacket';
import ShowCreditsHandler from './ShowCreditsHandler';

describe('ShowCreditsHandler', () => {
    const run = (creditsState: CreditsState): string[] => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new ShowCreditsPacket(), { creditsState });

        new ShowCreditsHandler().handle(packet, server, session);
        return logged;
    };

    it('logs that the credits finished', () => {
        expect(run(CreditsState.Finished)).toEqual([
            'Steve reported the end credits finished. The server never starts them'
        ]);
    });

    it('logs the start state as started', () => {
        expect(run(CreditsState.Start)).toEqual([
            'Steve reported the end credits started. The server never starts them'
        ]);
    });

    it('is registered for packet 0x4b', () => {
        expect(Handlers.ShowCreditsHandler).toBe(ShowCreditsHandler);
        expect(ShowCreditsHandler.PacketName).toBe('ShowCreditsPacket');
    });
});
