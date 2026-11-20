import { describe, expect, it } from 'vitest';

import type { Addon } from '../../packages/addon-tools/src/addon.ts';
import { addonCatalog, addonPage, workflowInputs } from './addons.mts';

/** An addon as `readAddon` returns it, with only the README among its files. */
const addon = (readme: string, name = 'tps-bar'): Addon => ({
    name,
    version: '1.2.0',
    description: 'Shows TPS, MSPT and ping on a boss bar.',
    minServer: '0.23.0',
    license: 'MIT',
    files: new Map([['README.md', new TextEncoder().encode(readme)]])
});

describe('addonCatalog', () => {
    it('says so when there are no addons', () => {
        expect(addonCatalog([], 'addon')).toBe('\nJSPrismarine has not published any addons yet.\n');
    });

    it('lists each addon under its README title, linked to its README, with its install command', () => {
        const catalog = addonCatalog([addon('# TPS bar\n\nA bar.\n'), addon('No heading.\n', 'warps')], 'addon');
        expect(catalog).toContain('### [TPS bar](../../addons/tps-bar/README.md)\n\nShows TPS, MSPT and ping');
        expect(catalog).toContain('| `1.2.0` | JSPrismarine `0.23.0` or newer | MIT |');
        expect(catalog).toContain('```text\naddon install tps-bar\n```');
        expect(catalog).toContain('### [warps](../../addons/warps/README.md)');
        expect(catalog.indexOf('tps-bar')).toBeLessThan(catalog.indexOf('warps'));
    });
});

describe('addonPage', () => {
    it('takes the title from the first heading outside a code fence', () => {
        const readme = '```sh\n# Example\n```\n\n# Actual\n\nText.\n';

        expect(addonPage(addon(readme), 'addon')).toMatch(/^---\ntitle: "Actual"\n/);
        expect(addonCatalog([addon(readme)], 'addon')).toContain('### [Actual](../../addons/tps-bar/README.md)');
    });

    it('reads past a fence that only a matching fence closes', () => {
        const readme = '~~~~md\n```\n# Example\n```\n~~~\n~~~~\n\n# Actual\n\nText.\n';

        expect(addonPage(addon(readme), 'addon')).toMatch(/^---\ntitle: "Actual"\n/);
    });

    it('puts the version, license and install command after the introduction', () => {
        const page = addonPage(addon('# TPS bar\n\nShows the server load.\n\n## Use it\n\nRun `/tpsbar`.\n'), 'addon');
        expect(page).toMatch(/^---\ntitle: "TPS bar"\ndescription: "Shows TPS, MSPT and ping on a boss bar."\n---\n/);
        const order = ['# TPS bar', 'Shows the server load.', '| Version |', 'addon install tps-bar', '## Use it'];
        const positions = order.map((text) => page.indexOf(text));
        expect(positions.every((position) => position !== -1)).toBe(true);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it('does not take a heading inside a code block for the first section', () => {
        const page = addonPage(addon('# TPS bar\n\n```md\n## not a section\n```\n\n## Use it\n'), 'addon');
        const positions = ['## not a section', '| Version |', '## Use it'].map((text) => page.indexOf(text));
        expect(positions.every((position) => position !== -1)).toBe(true);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it('gives a README without a title the addon name as its heading', () => {
        const page = addonPage(addon('Just text.\n'), 'addon');
        expect(page).toContain('title: "tps-bar"');
        expect(page).toContain('# tps-bar');
        expect(page.indexOf('# tps-bar')).toBeLessThan(page.indexOf('Just text.'));
    });
});

describe('workflowInputs', () => {
    it('reads each input of workflow_call in order, with its default and a one-line description', () => {
        const inputs = workflowInputs(`on:
    workflow_call:
        inputs:
            tools:
                description: >-
                    The version to run,
                    such as \`latest\`.
                type: string
                default: 'latest'
            publish:
                description: 'Whether to publish.'
                required: true
                type: boolean
`);
        expect(inputs).toEqual([
            {
                name: 'tools',
                type: 'string',
                required: false,
                default: 'latest',
                description: 'The version to run, such as `latest`.'
            },
            { name: 'publish', type: 'boolean', required: true, description: 'Whether to publish.' }
        ]);
    });

    it('refuses a workflow that takes no inputs', () => {
        expect(() => workflowInputs('on:\n    push:\n')).toThrow(/workflow_call inputs/);
    });
});
