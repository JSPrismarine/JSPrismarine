import { mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AddonToolsErrors, InvalidAddonError } from '@jsprismarine/errors/addon-tools';
import { readZip } from '@jsprismarine/packs/zip';
import { describe, expect, it } from 'vitest';

import { addonIndexEntry, addonListingFiles, packAddon, readAddon } from './addon';
import { isRecord } from './isRecord';
import { copyHello, editJson, FIXTURE_ADDONS, listHello, pngHeader } from './fixture.test-utils';

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

    it('takes its title from the README heading, then the manifest header', async () => {
        const { addon } = await copyHello();
        expect((await readAddon(addon)).title).toBe('Hello');

        await writeFile(path.join(addon, 'README.md'), '```md\n# Not this\n```\n\nNo heading.\n');
        expect((await readAddon(addon)).title).toBe('Hello');
        await writeFile(path.join(addon, 'README.md'), '---\ntitle: x\n---\n\n## Usage\n');
        expect((await readAddon(addon)).title).toBe('Hello');
        // A fence line with text after it does not close the fence.
        await writeFile(path.join(addon, 'README.md'), '```md\n```example\n# Example only\n```\n# Greetings\n');
        expect((await readAddon(addon)).title).toBe('Greetings');
        await writeFile(path.join(addon, 'README.md'), '   # Indented greetings\n');
        expect((await readAddon(addon)).title).toBe('Indented greetings');
        await writeFile(path.join(addon, 'README.md'), 'No heading.\n');

        await editJson(path.join(addon, 'manifest.json'), (value) => ({
            ...value,
            header: { ...(isRecord(value.header) ? value.header : {}), name: 'Hello Header' }
        }));
        expect((await readAddon(addon)).title).toBe('Hello Header');
    });

    it('reads the listing fields and keeps media out of the pack', async () => {
        const { addon } = await copyHello();
        await listHello(addon);
        await editJson(path.join(addon, 'addon.json'), (value) => ({
            ...value,
            deprecated: 'Use greetings instead.',
            replacedBy: 'owner/repo/greetings'
        }));

        const read = await readAddon(addon);

        expect(read).toMatchObject({
            title: 'Hello There',
            tags: ['chat'],
            authors: ['Ada'],
            screenshots: [{ file: 'media/wave.png', alt: 'A player waving.' }],
            deprecated: 'Use greetings instead.',
            replacedBy: 'owner/repo/greetings'
        });
        expect([...read.media.keys()]).toEqual(['media/wave.png']);
        expect([...read.files.keys()]).toEqual([
            'README.md',
            'addon.json',
            'manifest.json',
            'pack_icon.png',
            'scripts/main.js'
        ]);
        expect([...readZip(packAddon(read).bytes).keys()]).not.toContain('media/wave.png');
    });

    it('leaves out files and folders whose names start with a dot', async () => {
        const { addon } = await copyHello();
        await writeFile(path.join(addon, '.DS_Store'), '');
        await writeFile(path.join(addon, 'scripts', '.eslintrc'), '');

        expect([...(await readAddon(addon)).files.keys()]).not.toContain('.DS_Store');
        expect([...(await readAddon(addon)).files.keys()]).not.toContain('scripts/.eslintrc');
    });

    it('leaves out the build configuration', async () => {
        const { addon } = await copyHello();
        await writeFile(path.join(addon, 'tsconfig.json'), '{}');
        await writeFile(path.join(addon, 'turbo.json'), '{}');

        expect([...(await readAddon(addon)).files.keys()]).not.toContain('turbo.json');
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
            'lists a tag outside the fixed list',
            (addon) => editJson(path.join(addon, 'addon.json'), (value) => ({ ...value, tags: ['economy'] })),
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'lists a tag twice',
            (addon) => editJson(path.join(addon, 'addon.json'), (value) => ({ ...value, tags: ['chat', 'chat'] })),
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'gives a title on two lines',
            (addon) => editJson(path.join(addon, 'addon.json'), (value) => ({ ...value, title: 'Hello\nThere' })),
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'names a replacement that is not an install id',
            (addon) => editJson(path.join(addon, 'addon.json'), (value) => ({ ...value, replacedBy: 'Greetings' })),
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'lists a screenshot outside media/',
            async (addon) => {
                await writeFile(path.join(addon, 'wave.png'), pngHeader(1, 1));
                await editJson(path.join(addon, 'addon.json'), (value) => ({
                    ...value,
                    screenshots: [{ file: 'wave.png', alt: 'Waving.' }]
                }));
            },
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'lists a screenshot it does not have',
            (addon) =>
                editJson(path.join(addon, 'addon.json'), (value) => ({
                    ...value,
                    screenshots: [{ file: 'media/wave.png', alt: 'Waving.' }]
                })),
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'lists a screenshot without alt text',
            async (addon) => {
                await mkdir(path.join(addon, 'media'));
                await writeFile(path.join(addon, 'media', 'wave.png'), pngHeader(1, 1));
                await editJson(path.join(addon, 'addon.json'), (value) => ({
                    ...value,
                    screenshots: [{ file: 'media/wave.png' }]
                }));
            },
            AddonToolsErrors.InvalidAddonJson
        ],
        [
            'has an icon that is not a PNG',
            (addon) => writeFile(path.join(addon, 'pack_icon.png'), 'GIF89a'),
            AddonToolsErrors.InvalidAddonIcon
        ],
        [
            'has an icon that is not square',
            (addon) => writeFile(path.join(addon, 'pack_icon.png'), pngHeader(256, 128)),
            AddonToolsErrors.InvalidAddonIcon
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
            sha256: pack.sha256,
            listing: {
                title: 'Hello',
                license: 'MIT',
                tags: [],
                authors: [],
                readme: {
                    url: 'https://example.com/download/hello-1.2.3.md',
                    sha256: addonListingFiles(addon).readme.sha256
                },
                screenshots: []
            }
        });
    });

    it('names each listing file for the addon and version, and links it from the listing', async () => {
        const { addon: folder } = await copyHello();
        await listHello(folder);
        await editJson(path.join(folder, 'addon.json'), (value) => ({ ...value, deprecated: 'Use greetings.' }));
        const addon = await readAddon(folder);
        const files = addonListingFiles(addon);

        expect(files.readme).toMatchObject({ fileName: 'hello-1.2.3.md', bytes: addon.files.get('README.md') });
        expect(files.icon).toMatchObject({ fileName: 'hello-1.2.3.png', bytes: addon.files.get('pack_icon.png') });
        expect(files.screenshots).toMatchObject([
            {
                fileName: 'hello-1.2.3-1.png',
                bytes: addon.media.get('media/wave.png'),
                alt: 'A player waving.',
                file: 'media/wave.png'
            }
        ]);
        expect(addonIndexEntry(addon, packAddon(addon), 'https://example.com').listing).toEqual({
            title: 'Hello There',
            license: 'MIT',
            tags: ['chat'],
            authors: ['Ada'],
            deprecated: 'Use greetings.',
            readme: { url: 'https://example.com/hello-1.2.3.md', sha256: files.readme.sha256 },
            icon: { url: 'https://example.com/hello-1.2.3.png', sha256: files.icon?.sha256 },
            screenshots: [
                {
                    url: 'https://example.com/hello-1.2.3-1.png',
                    sha256: files.screenshots[0]?.sha256,
                    alt: 'A player waving.',
                    file: 'media/wave.png'
                }
            ]
        });
    });
});
