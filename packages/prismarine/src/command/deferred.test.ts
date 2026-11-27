import { PrismarineCommandErrors } from '@jsprismarine/errors/prismarine/command';
import { describe, expect, it } from 'vitest';

import { collectAsyncCommands, deferCommandWork, requireCommandDispatch } from './deferred';
import { carryOut } from './host/support';

describe('work a command parks', () => {
    it('reaches the dispatch that ran the body', async () => {
        const started = collectAsyncCommands(() => deferCommandWork(Promise.resolve('done')));

        await expect(Promise.all(started)).resolves.toEqual(['done']);
    });

    it('refuses a host verb outside a dispatch, where nothing would await its work', () => {
        expect(() => requireCommandDispatch()).toThrow(PrismarineCommandErrors.CommandWorkOutsideDispatch);
        expect(() => carryOut(Promise.resolve(), true)).toThrow(PrismarineCommandErrors.CommandWorkOutsideDispatch);
    });

    it('lets a host verb run inside a dispatch, and inside one nested in another', async () => {
        let nested: Promise<unknown>[] = [];
        const outer = collectAsyncCommands(() => {
            carryOut(Promise.resolve(), true);
            nested = collectAsyncCommands(() => carryOut(Promise.resolve(), true));
            carryOut(Promise.resolve(), true);
        });

        expect(outer).toHaveLength(2);
        expect(nested).toHaveLength(1);
        await Promise.all([...outer, ...nested]);
    });
});
