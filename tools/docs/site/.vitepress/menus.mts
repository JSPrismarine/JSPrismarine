import type { DefaultTheme } from 'vitepress';
import type { MegaMenu } from './theme/types.ts';

/** The single source for the desktop mega menu and the narrow-screen navigation. */
export const megaMenus = [
    {
        text: 'Guides',
        description: 'Run, configure and operate a server.',
        featured: {
            text: 'Run a server',
            description: 'Start from source and restart on every change.',
            command: 'pnpm run dev',
            link: '/guide/running'
        },
        sections: [
            {
                text: 'Operate',
                items: [
                    {
                        text: 'Running JSPrismarine',
                        description: 'Prerequisites, configuration and console.',
                        link: '/guide/running'
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
        text: 'Project',
        description: 'Where the server stands and where it is going.',
        sections: [
            {
                text: 'Status',
                items: [
                    {
                        text: 'Parity tracker',
                        description: 'Behavior checked against the vanilla server.',
                        link: '/parity'
                    },
                    {
                        text: 'Versioning policy',
                        description: 'How packages are versioned and released.',
                        link: '/guide/versioning'
                    },
                    {
                        text: 'Brand guide',
                        description: 'Colors, type, the prism mark and voice.',
                        link: '/brand/'
                    },
                    {
                        text: 'Brand kit',
                        description: 'The palette and components, rendered live.',
                        link: '/brand-kit'
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
            }
        ]
    },
    { text: 'API', description: 'Generated reference for the published packages.', link: '/api/', sections: [] },
    { text: 'Contributors', description: 'The people who write the code.', link: '/contributors', sections: [] }
] satisfies MegaMenu[];

/** Flat navigation for screens too narrow for the mega menu, derived from the same data. */
export const nav = megaMenus.map((menu): DefaultTheme.NavItem => {
    if (menu.link) return { text: menu.text, link: menu.link };
    return {
        text: menu.text,
        items: menu.sections.flatMap((section) => section.items.map(({ text, link }) => ({ text, link })))
    };
});
