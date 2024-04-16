import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismarineTransport } from './transport';

describe('transport', () => {
    let transport: PrismarineTransport;

    beforeEach(() => {
        transport = new PrismarineTransport();
    });

    it('should buffer log messages when console is not defined', () => {
        const info = { message: 'Test message' };
        transport.log(info, vi.fn());

        expect(transport.console).toBeUndefined();
        expect((transport as any).buffer).toContain(info);
    });

    it('should write buffered log messages when console is defined', () => {
        const info1 = { message: 'Test message 1' };
        const info2 = { message: 'Test message 2' };
        const write = vi.fn().mockReturnValue(() => {});

        transport.console = {
            write
        };
        (transport as any).buffer.push(info1, info2);
        transport.log(info1, vi.fn());

        expect((transport as any).buffer).toHaveLength(0);
        expect(write).toHaveBeenCalled();
    });
});
