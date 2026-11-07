import { defineConfig } from 'vitepress';
import mcfunction from './mcfunction.tmLanguage.json';
import molang from './molang.tmLanguage.json';
import typedocSidebar from '../api/typedoc-sidebar.json';
import { megaMenus, nav } from './menus.mts';
import { sections } from '../../sections.mts';
import { sidebar } from './sidebar.mts';

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
        languages: [mcfunction, molang],
        config(md) {
            // The staged docs are written for GitHub. Vue would compile their `{{` and bare `<tag>` text as
            // template syntax, so these pages render as literal markdown.
            const render = md.render.bind(md);
            md.render = (source, env) => {
                const staged = sections.some(({ dir }) => env?.relativePath?.startsWith(`${dir}/`));
                md.set({ html: !staged });
                return render(staged ? `::: v-pre\n${source}\n:::` : source, env);
            };
        }
    },
    themeConfig: {
        nav,
        megaMenus,
        sidebar: { ...sidebar, '/api/': typedocSidebar },
        socialLinks: [{ icon: 'github', link: 'https://github.com/JSPrismarine/JSPrismarine' }],
        search: { provider: 'local' }
    }
});
