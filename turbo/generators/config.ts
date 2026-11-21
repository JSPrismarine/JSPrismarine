import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { PlopTypes } from '@turbo/gen';

import addonTools from '../../packages/addon-tools/package.json' with { type: 'json' };
import { isAddonName } from '../../packages/addon-tools/src/addonIndex.ts';
import pkg from '../../packages/prismarine/package.json' with { type: 'json' };
import scriptApi from '../../packages/script-host/src/generated/script-modules/server.json' with { type: 'json' };
import { SCRIPT_METADATA_SOURCE } from '../../packages/script-host/src/generated/scriptModules.ts';
import server from '../../packages/server/package.json' with { type: 'json' };

const DIR_ADDONS = 'addons';
const DIR_PACKAGES = 'packages';
const DIR_TOOLS = 'tools';
const TARGET_TSCONFIG = 'tsconfig.build.json';

/**
 * The newest stable `@minecraft/server` version the script host offers. A new addon depends on it,
 * so it starts with the whole stable API.
 */
const scriptApiVersion = scriptApi.versions.findLast(({ stability }) => stability === 'stable')?.version;

/**
 * The engine version of the `bedrock-samples` release the script host's modules come from, such as
 * `1, 26, 60` for `v1.26.60.5`. Bedrock Dedicated Server loads a stable module version only from
 * that engine version on, so a new addon asks for no older one.
 */
const minEngineVersion = SCRIPT_METADATA_SOURCE.tag.slice(1).split('.').slice(0, 3).join(', ');

/** `tps-bar` as `Tps Bar`, the default display name of an addon. */
const titleCase = (name: string): string =>
    name
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

export default function generator(plop: PlopTypes.NodePlopAPI): void {
    // Templates fill JSON strings with `{{{ json value }}}`, which quotes and escapes the value.
    plop.setHelper('json', (value: unknown) => JSON.stringify(value));
    // Each use gives a new UUID, so a manifest's header and modules get one each.
    plop.setHelper('uuid', () => randomUUID());

    plop.setActionType('updateTsConfig', (answers) => {
        const file = path.join(plop.getDestBasePath(), TARGET_TSCONFIG);
        const reference = `{ "path": "./${DIR_PACKAGES}/${plop.renderString('{{ dashCase name }}', answers)}/tsconfig.json" }`;
        const text = readFileSync(file, 'utf8');
        if (text.includes(reference)) return `${TARGET_TSCONFIG} already references the package`;

        // `references` is the file's last array: add the package after its last entry.
        const updated = text.replace(/(\{ "path": "[^"]+" \})(\s*\]\s*\}\s*)$/, `$1,\n        ${reference}$2`);
        if (updated === text) throw `Could not find the references in ${TARGET_TSCONFIG}`;
        writeFileSync(file, updated);
        return `Added the package to ${TARGET_TSCONFIG}`;
    });

    plop.setGenerator('Package', {
        description: 'Create a new package',
        prompts: [
            {
                type: 'input',
                name: 'name',
                message: `What's the name of the package?`,
                filter: (input: string) => input.toLowerCase(),
                validate: (input: string) => {
                    if (!/^[\da-z-]+$/.test(input)) {
                        return 'Package name can only contain lowercase letters, numbers, and dashes.';
                    }

                    if (input.length < 3 || input.length > 213) {
                        return 'Package name must be between 3 and 213 characters.';
                    }

                    return true;
                }
            },
            {
                type: 'input',
                name: 'description',
                message: 'How would you describe the package?'
            }
        ],
        actions: [
            {
                type: 'addMany',
                destination: `{{ turbo.paths.root }}/${DIR_PACKAGES}/{{ dashCase name }}`,
                base: 'template/package',
                templateFiles: 'template/package/**/*',
                globOptions: {
                    dot: true
                },
                data: {
                    version: pkg.version,
                    pkg
                },
                skipIfExists: true
            },
            {
                type: 'updateTsConfig'
            },
            () => 'Run `pnpm install` to link the new package into the workspace'
        ]
    });

    plop.setGenerator('Tool', {
        description: 'Create a private workspace under tools/ that runs from source and is never published',
        prompts: [
            {
                type: 'input',
                name: 'name',
                message: `What's the name of the tool?`,
                filter: (input: string) => input.toLowerCase(),
                validate: (input: string) =>
                    /^[\da-z][\da-z-]{2,}$/.test(input) ||
                    'A tool name is at least three lowercase letters, numbers, and dashes, and starts with a letter or number.'
            },
            {
                type: 'input',
                name: 'description',
                message: 'What does it do, in one line?'
            }
        ],
        actions: [
            {
                type: 'addMany',
                destination: `{{ turbo.paths.root }}/${DIR_TOOLS}/{{ dashCase name }}`,
                base: 'template/tool',
                templateFiles: 'template/tool/**/*',
                data: {
                    version: pkg.version
                },
                abortOnFail: true
            },
            () => 'Run `pnpm install` to link the new tool into the workspace'
        ]
    });

    plop.setGenerator('Addon', {
        description: 'Create a new addon',
        prompts: [
            {
                type: 'input',
                name: 'name',
                message: `What's the name of the addon? Owners install it by this name.`,
                validate: (input: string) =>
                    isAddonName(input) || 'An addon name is lowercase letters and digits, with single hyphens between.'
            },
            {
                type: 'input',
                name: 'title',
                message: 'What do players see it called?',
                default: (answers: { name: string }) => titleCase(answers.name)
            },
            {
                type: 'input',
                name: 'description',
                message: 'What does it do, in one line?',
                validate: (input: string) =>
                    (input.trim().length > 0 && !/[\r\n]/.test(input)) || 'The description is one non-empty line.'
            },
            {
                type: 'input',
                name: 'minServer',
                message: 'What is the oldest JSPrismarine version it runs on?',
                default: server.version
            }
        ],
        actions: [
            {
                type: 'addMany',
                destination: `{{ turbo.paths.root }}/${DIR_ADDONS}/{{ name }}`,
                base: 'template/addon',
                templateFiles: 'template/addon/**/*',
                data: {
                    minEngineVersion,
                    scriptApiVersion,
                    // The compiler the addon tools build an addon with, and the rest of the workspace's cleaner.
                    tscTsVersion: addonTools.dependencies['tsc-ts'],
                    rimrafVersion: addonTools.devDependencies.rimraf
                },
                abortOnFail: true
            },
            () =>
                'Run `pnpm install` to link the addon, then `pnpm run docs:facts` to add it to the catalog in docs/addons/README.md'
        ]
    });
}
