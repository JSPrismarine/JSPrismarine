import { describe, expect, it } from 'vitest';

import { Logger } from '@jsprismarine/logger';
import { STEVE } from '../testing/sessionIdentity.test.helper';
import { stub } from '../testing/stub.test.helper';
import type { HandlerConfig, HandlerServices, InputContext } from './handler/HandlerContext';
import type { InputLaneHandler, ReadLaneHandler } from './handler/SessionHandler';
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

        it('appends two read-lane handlers and runs them in order', async () => {
            const logger = new Logger();
            const registry = new PacketHandlerRegistry({ getLogger: () => logger });
            const order: string[] = [];
            const part = (name: string): ReadLaneHandler<string> => ({
                lane: 'read',
                phases: ['play'],
                handle: async (packet, context) => {
                    await Promise.resolve();
                    order.push(`${name} ${packet} for ${context.session.identity.name}`);
                }
            });

            const merged = registry.appendHandler(part('first'), part('second'));
            const outputs: Promise<void>[] = [];
            await merged.handle('ping', {
                session: stub<PlayerSession>({ identity: STEVE }),
                log: logger,
                config: stub<HandlerConfig>({}),
                services: stub<HandlerServices>({}),
                step: { tick: 1, output: (send) => void outputs.push(send), defer: () => undefined }
            });
            expect(outputs).toHaveLength(0);

            expect(merged.lane).toBe('read');
            expect(order).toEqual(['first ping for Steve', 'second ping for Steve']);
        });

        it('takes the stricter lane, and hands the step what the read part of an input merge returns', async () => {
            const logger = new Logger();
            const registry = new PacketHandlerRegistry({ getLogger: () => logger });
            const order: string[] = [];
            const read: ReadLaneHandler<string> = {
                lane: 'read',
                phases: ['play'],
                handle: async () => {
                    await Promise.resolve();
                    order.push('read');
                }
            };
            const input: InputLaneHandler<string> = {
                lane: 'input',
                phases: ['play'],
                handle: () => {
                    order.push('input');
                    return undefined;
                }
            };
            const outputs: Promise<void>[] = [];
            const context: InputContext = {
                session: stub<PlayerSession>({ identity: STEVE }),
                log: logger,
                config: stub<HandlerConfig>({}),
                services: stub<HandlerServices>({}),
                step: { tick: 1, output: (send) => void outputs.push(send), defer: () => undefined }
            };

            const merged = registry.appendHandler(read, input);
            expect(merged.lane).toBe('input');
            expect(merged.handle('ping', context)).toBeUndefined();
            expect(order).toEqual(['input']);
            await Promise.all(outputs);
            expect(outputs).toHaveLength(1);
            expect(order).toEqual(['input', 'read']);
        });
    });
});
