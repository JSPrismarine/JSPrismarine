import type { PlopTypes } from '@turbo/gen';

import pkg from '../../packages/prismarine/package.json' with { type: 'json' };

const DIR_PACKAGES = 'packages';
const TARGET_TSCONFIG = 'tsconfig.build.json';

export default function generator(plop: PlopTypes.NodePlopAPI): void {
    plop.setActionType('updateTsConfig', (_answers) => {
        // TODO
        return `Append package to ${TARGET_TSCONFIG} references`;
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
                base: 'template/{{ lowerCase type }}',
                templateFiles: 'template/{{ lowerCase type }}/**/*',
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
                type: 'updateTsConfig',
                data: {
                    type: 'package'
                }
            }
        ]
    });
}
