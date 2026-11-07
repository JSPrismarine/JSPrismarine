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
            }
        ]
    },
    {
        text: 'Parity tracker',
        description: 'Behavior checked against the vanilla server.',
        link: '/parity',
        sections: []
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
