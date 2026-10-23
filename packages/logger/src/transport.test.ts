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
        const info = record('Test message');
        transport.log(info);

        expect(transport.console).toBeUndefined();
        expect((transport as any).buffer).toContain(info);
    });

    it('should write buffered log messages when console is defined', () => {
        const write = vi.fn();

        (transport as any).buffer.push(record('Test message 1'), record('Test message 2'));
        transport.console = {
            write
        };
        transport.log(record('Test message 3'));

        expect((transport as any).buffer).toHaveLength(0);
        expect(write).toHaveBeenCalledTimes(3);
        expect(write).toHaveBeenLastCalledWith('Test message 3');
    });
});
