import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import SimpleEventPacket, { SimpleEventSubtype } from '@jsprismarine/protocol/packet/SimpleEventPacket';
import SimpleEventHandler from './SimpleEventHandler';

describe('SimpleEventHandler', () => {
    const handleWith = (type: number): string[] => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new SimpleEventPacket(), { type });

        new SimpleEventHandler().handle(packet, server, session);
        return logged;
    };

    it('names the subtype it was sent', () => {
        expect(handleWith(SimpleEventSubtype.EnableCommands)).toEqual([
            'Steve sent the simple event EnableCommands. World settings are not modeled'
        ]);
    });

    it('reports a subtype it does not know by number', () => {
        expect(handleWith(9)).toEqual([
            'Steve sent the simple event unknown subtype 9. World settings are not modeled'
        ]);
    });
});
