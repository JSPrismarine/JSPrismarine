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

    describe('replay buffer', () => {
        it('keeps at most `capacity` records, dropping the oldest first', () => {
            const write = vi.fn();
            const bounded = new PrismarineTransport({ capacity: 2 });
            bounded.log(record('one'));
            bounded.log(record('two'));
            bounded.log(record('three'));
            expect(bounded.dropped).toBe(1);

            bounded.console = { write };
            bounded.log(record('four'));

            expect(write.mock.calls.map(([line]) => line)).toEqual([
                '... 1 earlier log lines were not retained',
                'two',
                'three',
                'four'
            ]);
        });

        it('writes the gap line once and resets the dropped count after replay', () => {
            const write = vi.fn();
            const bounded = new PrismarineTransport({ capacity: 1 });
            bounded.log(record('one'));
            bounded.log(record('two'));
            bounded.log(record('three'));
            expect(bounded.dropped).toBe(2);

            bounded.console = { write };
            bounded.log(record('four'));
            bounded.log(record('five'));

            expect(bounded.dropped).toBe(0);
            expect(write.mock.calls.map(([line]) => line)).toEqual([
                '... 2 earlier log lines were not retained',
                'three',
                'four',
                'five'
            ]);
        });

        it('writes no gap line when nothing was dropped', () => {
            const write = vi.fn();
            const bounded = new PrismarineTransport({ capacity: 2 });
            bounded.log(record('one'));
            bounded.log(record('two'));
            bounded.console = { write };
            bounded.log(record('three'));

            expect(bounded.dropped).toBe(0);
            expect(write.mock.calls.map(([line]) => line)).toEqual(['one', 'two', 'three']);
        });

        it('retains 1000 records by default', () => {
            const write = vi.fn();
            for (let index = 0; index < 1001; index++) {
                transport.log(record(`line ${index}`));
            }
            expect(transport.dropped).toBe(1);

            transport.console = { write };
            transport.log(record('last'));

            expect(write).toHaveBeenCalledTimes(1002);
            expect(write).toHaveBeenNthCalledWith(1, '... 1 earlier log lines were not retained');
            expect(write).toHaveBeenNthCalledWith(2, 'line 1');
            expect(write).toHaveBeenNthCalledWith(1001, 'line 1000');
            expect(write).toHaveBeenLastCalledWith('last');
        });
    });
});
