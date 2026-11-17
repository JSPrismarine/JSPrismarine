/** Java's English strings, read from the `en_us.json` the cache holds. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadJavaEnglish } from './javaEnglish';

const directories: string[] = [];
const fileWith = (text: string): string => {
    const directory = mkdtempSync(join(tmpdir(), 'jsp-java-english-'));
    directories.push(directory);
    const file = join(directory, 'en_us.json');
    writeFileSync(file, text);
    return file;
};

afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Java's English strings", () => {
    it('map each key to its text and keep only string values', () => {
        const english = loadJavaEnglish(
            fileWith(JSON.stringify({ 'advancements.story.mine_stone.title': 'Stone Age', broken: 3 }))
        );

        expect([...english]).toEqual([['advancements.story.mine_stone.title', 'Stone Age']]);
    });

    it('are empty when there is no file, which leaves every key as it is', () => {
        expect(loadJavaEnglish(join(tmpdir(), 'jsp-no-such-dir', 'en_us.json')).size).toBe(0);
    });
});
