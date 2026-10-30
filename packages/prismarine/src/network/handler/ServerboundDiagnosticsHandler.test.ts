import { describe, expect, it } from 'vitest';

import type { Logger } from '@jsprismarine/logger';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import ServerboundDiagnosticsPacket from '@jsprismarine/protocol/packet/ServerboundDiagnosticsPacket';
import ServerboundDiagnosticsHandler from './ServerboundDiagnosticsHandler';

describe('ServerboundDiagnosticsHandler', () => {
    it('summarizes the sample at debug level', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new ServerboundDiagnosticsPacket(), {
            avgFps: 59.94,
            avgClientSimTickTimeMs: 1.234,
            avgServerSimTickTimeMs: 0.5,
            memoryCategoryValues: [{ category: 0, currentBytes: 0n }]
        });

        new ServerboundDiagnosticsHandler().handle(packet, server, session);

        expect(logged).toEqual([
            'Steve reports 59.9 fps, 1.23 ms client tick, 0.50 ms server tick, 1 memory categories'
        ]);
    });
});
