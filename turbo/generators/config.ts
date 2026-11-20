import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { PlopTypes } from '@turbo/gen';

import pkg from '../../packages/prismarine/package.json' with { type: 'json' };

const DIR_PACKAGES = 'packages';
const TARGET_TSCONFIG = 'tsconfig.build.json';

export default function generator(plop: PlopTypes.NodePlopAPI): void {
    // Templates fill JSON strings with `{{{ json value }}}`, which quotes and escapes the value.
    plop.setHelper('json', (value: unknown) => JSON.stringify(value));

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
}
