import { describe, expect, it } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import type Server from '../Server';
import { STEVE } from '../testing/sessionIdentity.test.helper';
import { stub } from '../testing/stub.test.helper';
import type { ReadLaneHandler } from './handler/SessionHandler';
import type PacketHandler from './handler/PacketHandler';
import PacketHandlerRegistry from './PacketHandlerRegistry';
import type PlayerSession from './PlayerSession';

describe('network', () => {
    describe('PacketHandlerRegistry', () => {
        it('registers each server handler once', async () => {
            const logger = new Logger();
            const registry = new PacketHandlerRegistry({
                getLogger: () => logger
            });

            await registry.enable();
            expect(registry.getHandlers().size).toBeGreaterThan(0);
        });

        it('appends a handler that takes the server to one that takes a context, in order', async () => {
            const logger = new Logger();
            const registry = new PacketHandlerRegistry({ getLogger: () => logger });
            const order: string[] = [];
            const server = stub<Server>({ getLogger: () => logger });
            const session = stub<PlayerSession>({ identity: STEVE });
            const first: ReadLaneHandler<string> = {
                takes: 'context',
                lane: 'read',
                phases: ['play'],
                handle: (packet, context) => {
                    order.push(`context ${packet} for ${context.session.identity.name}`);
                }
            };
            const second: PacketHandler<never> = {
                lane: 'input',
                phases: ['play'],
                handle: (_packet, given, target) => {
                    order.push(`server ${given === server} for ${target.identity.name}`);
                }
            };

            const merged = registry.appendHandler(first, second);
            await merged.handle('ping', server, session);

            expect(merged.lane).toBe('input');
            expect(order).toEqual(['context ping for Steve', 'server true for Steve']);
        });
    });
});
