import { defineConfig } from 'vitepress';
import mcfunction from './mcfunction.tmLanguage.json';
import molang from './molang.tmLanguage.json';
import typedocSidebar from '../api/typedoc-sidebar.json';

export default defineConfig({
    title: 'JSPrismarine',
    description: 'Dedicated Minecraft Bedrock Edition server written in TypeScript',
    base: '/JSPrismarine/',
    ignoreDeadLinks: [
        (link, source) => {
            console.warn(`Found dead link ${link} in ${source}`);
            return true;
        }
    ],
    markdown: {
        // Shiki ships no grammar for mcfunction or Molang, so their fences fall
        // back to plain text; register the local ones.
        languages: [mcfunction, molang]
    },
    themeConfig: {
        nav: [
            { text: 'Guide', link: '/guide/running' },
            { text: 'Parity tracker', link: '/parity' },
            { text: 'API', link: '/api/' }
        ],
        sidebar: {
            '/guide/': [
                {
                    text: 'Guides',
                    items: [
                        { text: 'Running JSPrismarine', link: '/guide/running' },
                        { text: 'Log levels', link: '/guide/log-levels' }
                    ]
                }
            ],
            '/api/': typedocSidebar
        },
        socialLinks: [{ icon: 'github', link: 'https://github.com/JSPrismarine/JSPrismarine' }],
        search: { provider: 'local' }
    }
});
