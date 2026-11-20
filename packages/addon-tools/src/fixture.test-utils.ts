import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach } from 'vitest';

/** The folder of fixture addons; `hello` is a valid one, version 1.2.3. */
export const FIXTURE_ADDONS = path.join(import.meta.dirname, '../fixtures/addons');

const created: string[] = [];
afterEach(async () => {
    await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A fresh temporary folder, removed after the test. */
export const temporaryDirectory = async (): Promise<string> => {
    const directory = await mkdtemp(path.join(tmpdir(), 'jsp-addon-tools-'));
    created.push(directory);
    return directory;
};

/**
 * A copy of the `hello` fixture addon in a temporary addons folder, to change for one test.
 * @param name - The copy's folder name.
 * @returns The addons folder and the addon's folder in it.
 */
export const copyHello = async (name = 'hello'): Promise<{ addons: string; addon: string }> => {
    const addons = await temporaryDirectory();
    const addon = path.join(addons, name);
    await cp(path.join(FIXTURE_ADDONS, 'hello'), addon, { recursive: true });
    return { addons, addon };
};

/** Rewrites a JSON file of an addon through a function of its parsed contents. */
export const editJson = async (
    file: string,
    edit: (value: Record<string, unknown>) => Record<string, unknown>
): Promise<void> => {
    // The fixtures are objects; a test that edits one knows its shape.
    const value = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, JSON.stringify(edit(value)));
};

/**
 * Sets the version of a copy of the `hello` fixture, in its manifest header and every module.
 * @param version - Three numbers, as a manifest writes them.
 */
export const setHelloVersion = async (addon: string, version: readonly [number, number, number]): Promise<void> => {
    const file = path.join(addon, 'manifest.json');
    await writeFile(file, (await readFile(file, 'utf8')).replaceAll('[1, 2, 3]', JSON.stringify(version)));
};
