import MiniSearch from 'minisearch';
import { withBase } from 'vitepress';

import type { CommandData, SettingData } from '../../../../code-data.mts';
import type { PageEntry, SearchIndex } from '../../../../search-index.mts';

/** What a result is, which also decides its group and its preview. */
export type ResultKind = 'command' | 'page' | 'heading' | 'setting' | 'package' | 'api' | 'action';

/** A scope narrows a search to one kind. Typing its prefix at the start of the query selects it. */
export interface Scope {
    prefix: string;
    kind: ResultKind;
    label: string;
}

export const SCOPES: readonly Scope[] = [
    { prefix: '/', kind: 'command', label: 'commands' },
    { prefix: ':', kind: 'setting', label: 'settings' },
    { prefix: '@', kind: 'package', label: 'packages and API' },
    { prefix: '#', kind: 'heading', label: 'on this page' },
    { prefix: '>', kind: 'action', label: 'actions' }
];

/** One search result, ready to show. */
export interface SearchResult {
    id: string;
    kind: ResultKind;
    title: string;
    /** Where it lives, such as the page a heading is on. */
    context: string;
    /** A site path or a full URL; actions have none. */
    href?: string;
    /** For a page: its description and outline. For a heading: the start of its text. */
    description?: string;
    outline?: string[];
    command?: CommandData;
    setting?: SettingData;
    /** For an action: what running it does. */
    run?: () => void | Promise<void>;
}

/** Results of one kind, in the order the menu shows the groups. */
export interface ResultGroup {
    kind: ResultKind;
    label: string;
    results: SearchResult[];
    /** How many matched in total, which may be more than the group shows. */
    total: number;
}

const GROUP_ORDER: readonly ResultKind[] = ['action', 'command', 'page', 'heading', 'setting', 'package', 'api'];
const GROUP_LABELS: Record<ResultKind, string> = {
    action: 'Actions',
    command: 'Commands',
    page: 'Pages',
    heading: 'Headings',
    setting: 'Settings',
    package: 'Packages',
    api: 'API'
};

/** Results shown per group when searching everything; a scope shows more of its own kind. */
const PER_GROUP = 5;
const PER_SCOPE = 30;

interface Doc {
    id: string;
    kind: ResultKind;
    title: string;
    text: string;
    context: string;
}

/** The parsed query: the scope its first character picked, and the words after it. */
export function parseQuery(raw: string, forced?: Scope) {
    const trimmed = raw.trimStart();
    const scope = forced ?? SCOPES.find((candidate) => trimmed.startsWith(candidate.prefix));
    const text = forced || !scope ? trimmed : trimmed.slice(scope.prefix.length);
    return { scope, text: text.trim() };
}

let indexPromise: Promise<SearchEngine> | undefined;

/** Loads the index the docs build writes, once per visit, the first time anyone searches. */
export function loadSearch(): Promise<SearchEngine> {
    indexPromise ??= fetch(withBase('/search-index.json'))
        .then((response) => {
            if (!response.ok) throw new Error(`The search index answered ${response.status}.`);
            return response.json();
        })
        .then((index: SearchIndex) => new SearchEngine(index));
    return indexPromise;
}

/** The sidebar TypeDoc writes for the API reference: nested items with a text and a link. */
interface SidebarItem {
    text?: string;
    link?: string;
    items?: SidebarItem[];
}

/** Every page of the menu's search, built from the index and, on demand, the API reference. */
export class SearchEngine {
    private readonly search = new MiniSearch<Doc>({
        fields: ['title', 'text', 'context'],
        storeFields: ['kind'],
        searchOptions: { boost: { title: 4, context: 1.5 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' }
    });
    private readonly results = new Map<string, SearchResult>();
    private apiLoaded: Promise<void> | undefined;
    public readonly pages: ReadonlyMap<string, PageEntry>;

    public constructor(index: SearchIndex) {
        this.pages = new Map(index.pages.map((page) => [page.url, page]));
        const docs: Doc[] = [];
        const add = (result: SearchResult, text: string) => {
            this.results.set(result.id, result);
            docs.push({ id: result.id, kind: result.kind, title: result.title, text, context: result.context });
        };

        for (const page of index.pages) {
            add(
                {
                    id: `page:${page.url}`,
                    kind: 'page',
                    title: page.title,
                    context: page.section,
                    href: page.url,
                    description: page.description,
                    outline: page.headings.map(({ text }) => text)
                },
                page.description
            );
            for (const heading of page.headings) {
                add(
                    {
                        id: `heading:${page.url}#${heading.anchor}`,
                        kind: 'heading',
                        title: heading.text,
                        context: page.title,
                        href: `${page.url}#${heading.anchor}`,
                        description: heading.excerpt
                    },
                    heading.excerpt
                );
            }
        }
        for (const command of index.commands) {
            add(
                {
                    id: `command:${command.name}`,
                    kind: 'command',
                    title: `/${command.name}`,
                    context: 'Commands',
                    href: '/data-driven/commands',
                    description: command.description,
                    command
                },
                `${command.name} ${command.description}`
            );
        }
        for (const setting of index.settings) {
            add(
                {
                    id: `setting:${setting.key}`,
                    kind: 'setting',
                    title: setting.key,
                    context: 'config.json',
                    href: '/guide/running#every-setting',
                    description: setting.comment,
                    setting
                },
                setting.comment
            );
        }
        for (const pkg of index.packages) {
            add(
                {
                    id: `package:${pkg.name}`,
                    kind: 'package',
                    title: pkg.name,
                    context: `v${pkg.version}`,
                    href: `/api/${pkg.name}/`,
                    description: pkg.description
                },
                `${pkg.name.replace('@jsprismarine/', '')} ${pkg.description}`
            );
        }
        this.search.addAll(docs);
    }

    /**
     * Adds the API reference's symbols, from the sidebar TypeDoc writes. It is large, so it loads only
     * when a search reaches for packages; it is absent in a build that skipped the API reference.
     */
    public loadApi(): Promise<void> {
        this.apiLoaded ??= import('../../../api/typedoc-sidebar.json')
            .then((module) => {
                const docs: Doc[] = [];
                const walk = (items: readonly SidebarItem[], trail: string) => {
                    for (const item of items) {
                        const title = item.text ?? '';
                        if (item.link && trail) {
                            const id = `api:${item.link}`;
                            if (!this.results.has(id)) {
                                this.results.set(id, { id, kind: 'api', title, context: trail, href: item.link });
                                docs.push({ id, kind: 'api', title, text: '', context: trail });
                            }
                        }
                        if (item.items) walk(item.items, trail ? trail : title);
                    }
                };
                // The JSON module's default export is TypeDoc's sidebar array; its shape is outside our types.
                walk(module.default as SidebarItem[], '');
                this.search.addAll(docs);
            })
            .catch(() => undefined);
        return this.apiLoaded;
    }

    public get(id: string) {
        return this.results.get(id);
    }

    /** Searches every kind, or one scope's kind, and groups what it finds. */
    public query(text: string, scope?: Scope, extra: { actions?: SearchResult[]; pageUrl?: string } = {}) {
        const groups = new Map<ResultKind, SearchResult[]>();
        /** Each group's best match, so the group holding the closest result comes first. */
        const best = new Map<ResultKind, number>();
        const push = (result: SearchResult, score: number) => {
            const list = groups.get(result.kind) ?? [];
            list.push(result);
            groups.set(result.kind, list);
            best.set(result.kind, Math.max(best.get(result.kind) ?? 0, score));
        };

        if (!scope || scope.kind === 'action') {
            const words = text.toLowerCase().split(/\s+/).filter(Boolean);
            for (const action of extra.actions ?? []) {
                const titleWords = action.title.toLowerCase().split(/\W+/);
                // An action matches from the start of its words, so "port" finds no "Report a problem".
                const matches = words.every((word) => titleWords.some((titleWord) => titleWord.startsWith(word)));
                // In the `>` scope an empty query lists every action; elsewhere an action needs a match.
                if (matches && (scope || words.length > 0)) push(action, 0);
            }
        }
        if (text && scope?.kind !== 'action') {
            const kinds = scope ? (scope.kind === 'package' ? ['package', 'api'] : [scope.kind]) : undefined;
            for (const hit of this.search.search(text, {
                filter: (result) => !kinds || kinds.includes(result.kind)
            })) {
                const result = this.results.get(String(hit.id));
                if (!result) continue;
                // `#` searches the page being read; a heading's href starts with its page's path.
                if (scope?.kind === 'heading' && extra.pageUrl && !result.href?.startsWith(`${extra.pageUrl}#`))
                    continue;
                // A title that is the query outright, such as the setting `port`, outranks every partial match.
                const exact = result.title.toLowerCase().replace(/^\//, '') === text.toLowerCase();
                push(result, exact ? Number.MAX_SAFE_INTEGER : hit.score);
            }
        }

        const limit = scope ? PER_SCOPE : PER_GROUP;
        const out: ResultGroup[] = [];
        for (const kind of GROUP_ORDER) {
            const results = groups.get(kind);
            if (results?.length)
                out.push({ kind, label: GROUP_LABELS[kind], results: results.slice(0, limit), total: results.length });
        }
        // Closest match first; actions, which carry no score, follow the searched groups.
        return out.sort((a, b) => (best.get(b.kind) ?? 0) - (best.get(a.kind) ?? 0));
    }
}
