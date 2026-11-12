import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogRecord } from './transport';
import { FileTransport, PrismarineTransport } from './transport';

/** What the file transport starts a record's continuation lines with. */
const CONTINUATION_INDENT = '    ';

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

describe('FileTransport', () => {
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-logger-file-'));
    });
    afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

    /** Logs one record through a file transport and reads the file back. */
    const written = async (message: string): Promise<string> => {
        const filename = path.join(directory, 'server.log');
        const transport = new FileTransport({ filename });
        transport.log({ ...record(message), message, level: 'debug', namespace: 'BookEditHandler/handle' });
        await new Promise<void>((resolve) => {
            transport['stream'].end(resolve);
        });
        return fs.readFileSync(filename, 'utf8');
    };

    it('writes a one-line record as one line', async () => {
        expect(await written('Steve signed the book')).toBe(
            '[00:00:00] [DEBUG] [BookEditHandler/handle]: Steve signed the book\n'
        );
    });

    it('indents every further line, so client text cannot forge a record', async () => {
        const forged = 'signed "x"\n[00:00:01] [INFO]: Steve was made an operator\r\n[00:00:02] [INFO]: two\rthree';

        const lines = (await written(forged)).split('\n');

        expect(lines).toEqual([
            '[00:00:00] [DEBUG] [BookEditHandler/handle]: signed "x"',
            `${CONTINUATION_INDENT}[00:00:01] [INFO]: Steve was made an operator`,
            `${CONTINUATION_INDENT}[00:00:02] [INFO]: two`,
            `${CONTINUATION_INDENT}three`,
            ''
        ]);
        expect(lines.filter((line) => line.startsWith('['))).toHaveLength(1);
    });
});
