import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it, vi } from 'vitest';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import { ConsoleSender } from './ConsoleSender';

describe('command', () => {
    describe('ConsoleSender', () => {
        const info = vi.fn();
        const logger = stub<Logger>({ info });
        const server = stub<Server>({ getLogger: () => logger });
        const sender = new ConsoleSender(server);

        it('should identify itself as the console', () => {
            expect(sender.getName()).toBe('CONSOLE');
            expect(sender.getFormattedUsername()).toBe('[CONSOLE]');
            expect(sender.getServer()).toBe(server);
        });

        it('should log replies at info level', () => {
            sender.sendMessage('hello');

            expect(info).toHaveBeenCalledWith('hello');
        });
    });
});
