import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

/**
 * The start of a PNG file: its signature and an `IHDR` chunk with a width and a height, which is
 * all the build reads of a pack icon.
 */
export const pngHeader = (width: number, height: number): Uint8Array => {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set(new TextEncoder().encode('IHDR'), 12);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return bytes;
};

/**
 * Gives a copy of the `hello` fixture a listing: a title, tags, authors, an icon and one
 * screenshot under `media/`.
 */
export const listHello = async (addon: string): Promise<void> => {
    await mkdir(path.join(addon, 'media'));
    await writeFile(path.join(addon, 'media', 'wave.png'), pngHeader(640, 360));
    await writeFile(path.join(addon, 'pack_icon.png'), pngHeader(256, 256));
    await editJson(path.join(addon, 'addon.json'), (value) => ({
        ...value,
        title: 'Hello There',
        tags: ['chat'],
        authors: ['Ada'],
        screenshots: [{ file: 'media/wave.png', alt: 'A player waving.' }]
    }));
};
