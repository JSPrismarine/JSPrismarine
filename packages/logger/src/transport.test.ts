import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogRecord } from './transport';
import { PrismarineTransport } from './transport';

const record = (formatted: string): LogRecord => ({
    level: 'info',
    message: formatted,
    namespace: '',
    timestamp: '00:00:00',
    formatted
});

describe('transport', () => {
    let transport: PrismarineTransport;

    beforeEach(() => {
        transport = new PrismarineTransport();
    });

    it('should buffer log messages when console is not defined', () => {
        const write = vi.fn();
        transport.log(record('Test message'));
        expect(transport.console).toBeUndefined();

        transport.console = { write };
        transport.log(record('Test message 2'));

        expect(write).toHaveBeenNthCalledWith(1, 'Test message');
        expect(write).toHaveBeenNthCalledWith(2, 'Test message 2');
    });

    it('should write buffered log messages when console is defined', () => {
        const write = vi.fn();

        transport.log(record('Test message 1'));
        transport.log(record('Test message 2'));
        transport.console = {
            write
        };
        transport.log(record('Test message 3'));

        expect(write).toHaveBeenCalledTimes(3);
        expect(write).toHaveBeenLastCalledWith('Test message 3');

        // The buffer was emptied: another record writes once, with no replay.
        transport.log(record('Test message 4'));
        expect(write).toHaveBeenCalledTimes(4);
        expect(write).toHaveBeenLastCalledWith('Test message 4');
    });
});
