import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Config } from '../config/Config';
import { stub } from '../testing/stub.test.helper';
import type { Logger } from '@jsprismarine/logger';
import AllowList from './AllowList';

let directory: string;

beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-allowlist-'));
    vi.stubEnv('JSP_DIR', directory);
});

afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(directory, { recursive: true, force: true });
});

const errors: unknown[] = [];
const allowListOf = (enabled = false) =>
    new AllowList({
        getLogger: () => stub<Logger>({ info: () => {}, error: (error: unknown) => void errors.push(error) }),
        getConfig: () => stub<Config>({ getAllowList: () => enabled })
    });
const file = () => JSON.parse(fs.readFileSync(path.join(directory, 'allowlist.json'), 'utf8'));

describe('the allow list', () => {
    it('starts empty and off, with an empty file in BDS’s format', async () => {
        const list = allowListOf();
        await list.enable();

        expect(list.isEnabled()).toBe(false);
        expect(list.getEntries()).toEqual([]);
        expect(file()).toEqual([]);
    });

    it('matches a name exactly and a xuid, and lists each player once', async () => {
        const list = allowListOf();
        await list.enable();

        expect(list.add({ name: 'Steve', ignoresPlayerLimit: false })).toBe(true);
        expect(list.add({ name: 'Steve', ignoresPlayerLimit: true })).toBe(false);
        expect(list.add({ xuid: '2535400000000001', ignoresPlayerLimit: false })).toBe(true);

        expect(list.contains({ name: 'Steve' })).toBe(true);
        expect(list.contains({ name: 'steve' })).toBe(false);
        expect(list.contains({ name: 'Alex', xuid: '2535400000000001' })).toBe(true);
        expect(file()).toEqual([
            { ignoresPlayerLimit: false, name: 'Steve' },
            { ignoresPlayerLimit: false, xuid: '2535400000000001' }
        ]);
    });

    it('writes every change at once, so reading the file back keeps them', async () => {
        const list = allowListOf();
        await list.enable();
        list.add({ name: 'Steve', ignoresPlayerLimit: false });
        list.add({ name: 'Alex', ignoresPlayerLimit: true });

        expect(list.remove({ name: 'Steve' })).toBe(true);
        expect(list.remove({ name: 'Steve' })).toBe(false);
        list.reload();

        expect(list.getEntries()).toEqual([{ name: 'Alex', ignoresPlayerLimit: true }]);
        list.clear();
        list.reload();
        expect(list.getEntries()).toEqual([]);
    });

    it('lets only the players whose entry says so past the player limit, on or off', async () => {
        const list = allowListOf();
        await list.enable();
        list.add({ name: 'Steve', ignoresPlayerLimit: true });
        list.add({ name: 'Alex', ignoresPlayerLimit: false });

        expect(list.ignoresPlayerLimit({ name: 'Steve' })).toBe(true);
        expect(list.ignoresPlayerLimit({ name: 'Alex' })).toBe(false);
        expect(list.ignoresPlayerLimit({ name: 'Herobrine' })).toBe(false);
        list.setEnabled(true);
        expect(list.ignoresPlayerLimit({ name: 'Steve' })).toBe(true);
    });

    it('lets everybody in while off, and only the listed players while on', async () => {
        const list = allowListOf(true);
        await list.enable();
        list.add({ name: 'Steve', ignoresPlayerLimit: false });

        expect(list.allows({ name: 'Steve' })).toBe(true);
        expect(list.allows({ name: 'Alex' })).toBe(false);
        list.setEnabled(false);
        expect(list.allows({ name: 'Alex' })).toBe(true);
    });

    it('keeps its list when the file is not a list, and says why', async () => {
        fs.writeFileSync(path.join(directory, 'allowlist.json'), '{}');
        const list = allowListOf();
        errors.length = 0;
        await list.enable();

        expect(list.getEntries()).toEqual([]);
        expect(errors).toHaveLength(1);
    });
});
