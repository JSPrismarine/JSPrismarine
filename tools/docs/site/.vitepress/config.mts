import { defineConfig } from 'vitepress';
import typedocSidebar from '../api/typedoc-sidebar.json';

export default defineConfig({
    title: 'JSPrismarine',
    description: 'Dedicated Minecraft Bedrock Edition server written in TypeScript',
    base: '/JSPrismarine/',
    themeConfig: {
        nav: [
            { text: 'Guide', link: '/guide/running' },
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
