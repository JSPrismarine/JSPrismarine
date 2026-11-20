import { readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AddonToolsErrors, InvalidAddonError } from '@jsprismarine/errors/addon-tools';
import { readZip } from '@jsprismarine/packs/zip';
import { describe, expect, it } from 'vitest';

import { addonIndexEntry, packAddon, readAddon } from './addon';
import { copyHello, editJson, FIXTURE_ADDONS } from './fixture.test-utils';

describe('readAddon', () => {
    it('reads the version from the manifest header and the rest from addon.json', async () => {
        const addon = await readAddon(path.join(FIXTURE_ADDONS, 'hello'));

        expect(addon).toMatchObject({
            name: 'hello',
            version: '1.2.3',
            description: 'Says hello.',
            minServer: '0.22.0',
            license: 'MIT'
        });
        expect([...addon.files.keys()]).toEqual(['README.md', 'addon.json', 'manifest.json', 'scripts/main.js']);
    });

    it('leaves out files and folders whose names start with a dot', async () => {
        const { addon } = await copyHello();
        await writeFile(path.join(addon, '.DS_Store'), '');
        await writeFile(path.join(addon, 'scripts', '.eslintrc'), '');

        expect([...(await readAddon(addon)).files.keys()]).not.toContain('.DS_Store');
        expect([...(await readAddon(addon)).files.keys()]).not.toContain('scripts/.eslintrc');
    });

    /** Each way an addon can be wrong, the change that makes it so, and the error it gets. */
    const invalid: [string, (addon: string) => Promise<unknown>, abstract new (...args: never[]) => Error][] = [
        ['has no README', (addon) => rm(path.join(addon, 'README.md')), AddonToolsErrors.MissingAddonFile],
        ['has no addon.json', (addon) => rm(path.join(addon, 'addon.json')), AddonToolsErrors.MissingAddonFile],
        [
            'carries a version in addon.json',
            (addon) => editJson(path.join(addon, 'addon.json'), (value) => ({ ...value, version: '1.2.3' })),
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'gives a minServer that is not a version',
            (addon) => editJson(path.join(addon, 'addon.json'), (value) => ({ ...value, minServer: 'latest' })),
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'has no license',
            (addon) => editJson(path.join(addon, 'addon.json'), ({ license: _, ...value }) => value),
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'has an addon.json that is not JSON',
            (addon) => writeFile(path.join(addon, 'addon.json'), '{ description: hello }'),
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'has a manifest that is not JSON',
            (addon) => writeFile(path.join(addon, 'manifest.json'), '{ "header": '),
            AddonToolsErrors.InvalidAddonManifest
        ],
        [
            'has a script module and a manifest only a lenient reader takes',
            async (addon) => {
                const file = path.join(addon, 'manifest.json');
                await writeFile(file, `// A comment.\n${await readFile(file, 'utf8')}`);
            },
            AddonToolsErrors.InvalidAddonManifest
        ],
        [
            'has a manifest without a header',
            (addon) => editJson(path.join(addon, 'manifest.json'), ({ header: _, ...value }) => value),
            AddonToolsErrors.InvalidAddonManifest
        ],
        [
            'declares a resource pack module',
            (addon) =>
                editJson(path.join(addon, 'manifest.json'), (value) => ({
                    ...value,
                    modules: [{ type: 'resources', uuid: '8b2c1d4e-6f70-4a81-9c2d-3e4f5a6b7c80', version: [1, 2, 3] }]
                })),
            AddonToolsErrors.NotABehaviorPack
        ],
        [
            'gives its header a version the index cannot read',
            // A bare number in the header and every module, which parseManifest reads as [1.2, 0, 0].
            async (addon) => {
                const file = path.join(addon, 'manifest.json');
                await writeFile(file, (await readFile(file, 'utf8')).replaceAll('[1, 2, 3]', '1.2'));
            },
            AddonToolsErrors.InvalidAddonManifest
        ],
        [
            'has a module whose version differs from the header',
            (addon) =>
                editJson(path.join(addon, 'manifest.json'), (value) => ({
                    ...value,
                    modules: [{ type: 'data', uuid: '8b2c1d4e-6f70-4a81-9c2d-3e4f5a6b7c80', version: [1, 0, 0] }]
                })),
            AddonToolsErrors.ModuleVersionDiffers
        ],
        [
            'names a script entry it does not have',
            (addon) => rename(path.join(addon, 'scripts', 'main.js'), path.join(addon, 'scripts', 'index.js')),
            AddonToolsErrors.MissingScriptEntry
        ],
        [
            'holds a symbolic link',
            (addon) => symlink(path.join(addon, 'README.md'), path.join(addon, 'LICENSE')),
            AddonToolsErrors.UnsupportedAddonEntry
        ]
    ];

    it.each(invalid)('refuses an addon that %s', async (_, change, error) => {
        const { addon } = await copyHello();
        await change(addon);

        const read = readAddon(addon);
        await expect(read).rejects.toBeInstanceOf(error);
        await expect(read).rejects.toBeInstanceOf(InvalidAddonError);
    });

    it('refuses a folder whose name is not an addon name', async () => {
        const { addon } = await copyHello('Hello_World');

        await expect(readAddon(addon)).rejects.toBeInstanceOf(AddonToolsErrors.InvalidAddonName);
    });
});

describe('packAddon', () => {
    it('zips every file of the addon under its own path', async () => {
        const addon = await readAddon(path.join(FIXTURE_ADDONS, 'hello'));
        const pack = packAddon(addon);

        expect(pack.fileName).toBe('hello-1.2.3.mcpack');
        expect(readZip(pack.bytes)).toEqual(addon.files);
    });

    it('writes the same bytes for the same files, on any machine', async () => {
        const pack = packAddon(await readAddon(path.join(FIXTURE_ADDONS, 'hello')));
        const { addon: copy } = await copyHello();

        // The fixture's digest, recorded once: a change to the zip writer or the fixture changes it.
        expect(pack.sha256).toBe('96f060eed228c518cc9a0051f31e85f6ea5adfa38a990ff227c570296e50f3f5');
        expect(packAddon(await readAddon(copy))).toEqual(pack);
    });

    it('gives a different hash when a file changes', async () => {
        const pack = packAddon(await readAddon(path.join(FIXTURE_ADDONS, 'hello')));
        const { addon } = await copyHello();
        await writeFile(path.join(addon, 'README.md'), '# Hello\n\nChanged.\n');

        expect(packAddon(await readAddon(addon)).sha256).not.toBe(pack.sha256);
    });
});

describe('addonIndexEntry', () => {
    it('puts the pack under the base URL', async () => {
        const addon = await readAddon(path.join(FIXTURE_ADDONS, 'hello'));
        const pack = packAddon(addon);

        expect(addonIndexEntry(addon, pack, 'https://example.com/download/')).toEqual({
            name: 'hello',
            version: '1.2.3',
            description: 'Says hello.',
            minServer: '0.22.0',
            url: 'https://example.com/download/hello-1.2.3.mcpack',
            sha256: pack.sha256
        });
    });
});
