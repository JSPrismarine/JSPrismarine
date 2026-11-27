import type { CommandHost } from '@jsprismarine/commands';
import { describe, expect, it } from 'vitest';

import { carryOut } from '../command/host/support';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import type { Level } from '../world/Level';
import { scriptHostVerbs } from './scriptHostVerbs';

/** A server whose command manager hands out `host`, and the lines it warns. */
const serverWith = (host: CommandHost) => {
    const warned: string[] = [];
    const server = stub<Server>({
        getCommandManager: () => stub<ReturnType<Server['getCommandManager']>>({ getHost: () => host }),
        getLogger: () => stub<ReturnType<Server['getLogger']>>({ warn: (line) => void warned.push(String(line)) })
    });
    return { server, warned };
};

describe('scriptHostVerbs', () => {
    it("runs a verb that parks work, which a script's call has no dispatch for", () => {
        const host = stub<CommandHost>({});
        const { server } = serverWith(host);

        const answer = scriptHostVerbs(server, stub<Level>({}))(() => carryOut(Promise.resolve(), 'done'));

        expect(answer).toBe('done');
    });

    it('logs a failure in the work, which nothing else awaits', async () => {
        const { server, warned } = serverWith(stub<CommandHost>({}));

        scriptHostVerbs(server, stub<Level>({}))(() => carryOut(Promise.reject(new Error('no such player')), true));

        await expect.poll(() => warned).toEqual(["A script's command work failed: Error: no such player"]);
    });
});
