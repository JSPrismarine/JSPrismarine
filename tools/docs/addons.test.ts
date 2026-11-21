import { describe, expect, it } from 'vitest';

import type { Addon } from '../../packages/addon-tools/src/addon.ts';
import { addonCatalog, workflowInputs } from './addons.mts';

/** An addon as `readAddon` returns it, with only the README among its files. */
const addon = (title: string, name = 'tps-bar'): Addon => ({
    name,
    title,
    version: '1.2.0',
    description: 'Shows TPS, MSPT and ping on a boss bar.',
    minServer: '0.23.0',
    license: 'MIT',
    files: new Map([['README.md', new TextEncoder().encode(`# ${title}\n`)]]),
    media: new Map()
});

describe('addonCatalog', () => {
    it('says so when there are no addons', () => {
        expect(addonCatalog([], 'addon')).toBe('\nJSPrismarine has not published any addons yet.\n');
    });

    it('lists each addon under its title, linked to its README, with its install command', () => {
        const catalog = addonCatalog([addon('TPS bar'), addon('warps', 'warps')], 'addon');
        expect(catalog).toContain('### [TPS bar](../../addons/tps-bar/README.md)\n\nShows TPS, MSPT and ping');
        expect(catalog).toContain('| `1.2.0` | JSPrismarine `0.23.0` or newer | MIT |');
        expect(catalog).toContain('```text\naddon install tps-bar\n```');
        expect(catalog).toContain('### [warps](../../addons/warps/README.md)');
        expect(catalog.indexOf('tps-bar')).toBeLessThan(catalog.indexOf('warps'));
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
