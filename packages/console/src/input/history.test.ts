import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CommandHistory } from './history';

describe('CommandHistory', () => {
    describe('push', () => {
        it('keeps entries in submission order', () => {
            const history = new CommandHistory();
            history.push('list');
            history.push('stop');

            expect(history.entries).toEqual(['list', 'stop']);
        });

        it('collapses consecutive duplicates but keeps repeats that are apart', () => {
            const history = new CommandHistory();
            history.push('list');
            history.push('list');
            history.push('stop');
            history.push('list');

            expect(history.entries).toEqual(['list', 'stop', 'list']);
        });

        it('ignores blank lines and trims surrounding whitespace', () => {
            const history = new CommandHistory();
            history.push('   ');
            history.push('  say hi  ');

            expect(history.entries).toEqual(['say hi']);
        });

        it('drops the oldest entry past the cap', () => {
            const history = new CommandHistory(3);
            for (const line of ['a', 'b', 'c', 'd']) history.push(line);

            expect(history.entries).toEqual(['b', 'c', 'd']);
        });
    });

    describe('navigation', () => {
        it('walks back from the newest entry and forward to the stashed draft', () => {
            const history = new CommandHistory();
            history.push('first');
            history.push('second');

            expect(history.previous('draft')).toBe('second');
            expect(history.previous('second')).toBe('first');
            expect(history.previous('first')).toBeUndefined();
            expect(history.next()).toBe('second');
            expect(history.next()).toBe('draft');
            expect(history.next()).toBeUndefined();
        });

        it('returns nothing when the history is empty', () => {
            const history = new CommandHistory();

            expect(history.previous('draft')).toBeUndefined();
            expect(history.next()).toBeUndefined();
        });

        it('restarts from the newest entry after reset', () => {
            const history = new CommandHistory();
            history.push('first');
            history.push('second');
            history.previous('');
            history.previous('');
            history.reset();

            expect(history.previous('')).toBe('second');
        });

        it('restarts from the newest entry after a push', () => {
            const history = new CommandHistory();
            history.push('first');
            history.previous('');
            history.push('second');

            expect(history.previous('')).toBe('second');
        });
    });

    describe('search', () => {
        it('returns the most recent entry containing the query', () => {
            const history = new CommandHistory();
            history.push('say hello');
            history.push('list');
            history.push('say goodbye');

            expect(history.search('say')).toBe('say goodbye');
            expect(history.search('hello')).toBe('say hello');
        });

        it('returns nothing for an empty query or no match', () => {
            const history = new CommandHistory();
            history.push('list');

            expect(history.search('')).toBeUndefined();
            expect(history.search('stop')).toBeUndefined();
        });
    });

    describe('files', () => {
        let directory: string;

        beforeEach(async () => {
            directory = await mkdtemp(join(tmpdir(), 'jsp-history-'));
        });

        afterEach(async () => {
            await rm(directory, { recursive: true, force: true });
        });

        it('round-trips entries one per line', async () => {
            const file = join(directory, 'nested', 'history');
            const history = new CommandHistory();
            history.push('list');
            history.push('say hi');
            await history.save(file);

            expect(await readFile(file, 'utf8')).toBe('list\nsay hi\n');

            const loaded = new CommandHistory();
            await loaded.load(file);
            expect(loaded.entries).toEqual(['list', 'say hi']);
        });

        it('ignores a missing file', async () => {
            const history = new CommandHistory();
            await expect(history.load(join(directory, 'missing'))).resolves.toBeUndefined();

            expect(history.entries).toEqual([]);
        });

        it('applies the cap and dedupe rules to loaded lines', async () => {
            const file = join(directory, 'history');
            const seed = new CommandHistory();
            for (const line of ['a', 'a', 'b', '', 'c']) seed.push(line);
            await seed.save(file);

            const history = new CommandHistory(2);
            await history.load(file);
            expect(history.entries).toEqual(['b', 'c']);
        });
    });
});
