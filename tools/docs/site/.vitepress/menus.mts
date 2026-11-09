import type { DefaultTheme } from 'vitepress';
import type { MegaMenu } from './theme/types.ts';

/** The single source for the desktop mega menu and the narrow-screen navigation. */
export const megaMenus = [
    {
        text: 'Guides',
        description: 'Run, configure and operate a server.',
        featured: {
            text: 'Run a server',
            description: 'Download the prebuilt server and start it. Nothing else to install.',
            link: '/guide/running#run-the-prebuilt-server'
        },
        sections: [
            {
                text: 'Operate',
                items: [
                    {
                        text: 'Run the prebuilt server',
                        description: 'Download, first start and updates.',
                        link: '/guide/running#run-the-prebuilt-server'
                    },
                    {
                        text: 'Every setting',
                        description: 'What each key in config.json does.',
                        link: '/guide/running#every-setting'
                    },
                    {
                        text: 'Joining a server',
                        description: 'For players: add a server, versions, fixes.',
                        link: '/guide/joining'
                    },
                    {
                        text: 'Log levels',
                        description: 'What each level prints and how to change it.',
                        link: '/guide/log-levels'
                    }
                ]
            },
            {
                text: 'Data-driven engine',
                items: [
                    {
                        text: 'Overview',
                        description: 'How vanilla behavior comes from data.',
                        link: '/data-driven/'
                    },
                    {
                        text: 'Using packs',
                        description: 'Load and write your own data packs.',
                        link: '/data-driven/using-packs'
                    }
                ]
            }
        ]
    },
    {
        text: 'Build',
        description: 'Packages, packs and the API for add-ons and tools.',
        featured: {
            text: 'Packages',
            description: 'Every package on npm, with its API, README and npm page.',
            command: 'pnpm add @jsprismarine/nbt',
            link: '/packages'
        },
        sections: [
            {
                text: 'Start',
                items: [
                    {
                        text: 'Extending JSPrismarine',
                        description: 'Packs for content, embedding for code.',
                        link: '/guide/extending'
                    },
                    {
                        text: 'Run from source',
                        description: 'pnpm run dev restarts on every change.',
                        link: '/guide/running#run-from-source'
                    }
                ]
            },
            {
                text: 'Reference',
                items: [
                    { text: 'API reference', description: 'Generated from the published packages.', link: '/api/' },
                    { text: 'Packages', description: 'Find a package and its docs.', link: '/packages' }
                ]
            },
            {
                text: 'Content',
                items: [
                    {
                        text: 'Using packs',
                        description: 'Formats, load order and conflicts.',
                        link: '/data-driven/using-packs'
                    },
                    { text: 'Molang', description: 'Expressions in behavior packs.', link: '/data-driven/molang' },
                    {
                        text: 'Commands',
                        description: 'Commands, functions and datapacks.',
                        link: '/data-driven/commands'
                    }
                ]
            }
        ]
    },
    {
        text: 'Project',
        description: 'Where the server stands and where it is going.',
        featured: {
            text: 'Releases',
            description: 'What changed in each version, from the changelog.',
            link: '/releases'
        },
        sections: [
            {
                text: 'Status',
                items: [
                    {
                        text: 'Parity tracker',
                        description: 'Behavior checked against the vanilla server.',
                        link: '/parity'
                    },
                    { text: 'Releases', description: 'Release notes for every version.', link: '/releases' },
                    {
                        text: 'Versioning policy',
                        description: 'How packages are versioned and released.',
                        link: '/guide/versioning'
                    }
                ]
            },
            {
                text: 'Direction',
                items: [
                    { text: 'Plans', description: 'Execution order for larger efforts.', link: '/plans/' },
                    { text: 'Decisions', description: 'Architecture decision records.', link: '/adr/' },
                    { text: 'Research', description: 'Notes from primary sources.', link: '/research/' }
                ]
            },
            {
                text: 'Brand',
                items: [
                    { text: 'Brand guide', description: 'Colors, type, the mark and voice.', link: '/brand/' },
                    { text: 'Brand kit', description: 'The palette and components, live.', link: '/brand-kit' }
                ]
            }
        ]
    },
    {
        text: 'Community',
        description: 'Join in, report a bug or send a change.',
        featured: {
            text: 'Contributing',
            description: 'How to report bugs, suggest features and open a pull request.',
            command: 'pnpm run dev',
            link: '/contributing'
        },
        sections: [
            {
                text: 'People',
                items: [
                    { text: 'Contributors', description: 'The people who write the code.', link: '/contributors' },
                    {
                        text: 'Code of Conduct',
                        description: 'How we expect everyone to behave.',
                        link: '/code-of-conduct'
                    }
                ]
            }
        ]
    }
] satisfies MegaMenu[];

/** Flat navigation for screens too narrow for the mega menu, derived from the same data. */
export const nav = megaMenus.map((menu): DefaultTheme.NavItem => {
    if (menu.link) return { text: menu.text, link: menu.link };
    return {
        text: menu.text,
        items: menu.sections.flatMap((section) => section.items.map(({ text, link }) => ({ text, link })))
    };
});
