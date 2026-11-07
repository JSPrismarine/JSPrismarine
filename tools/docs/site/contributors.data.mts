import type { LoaderModule } from 'vitepress';
import manifest from '../../../package.json' with { type: 'json' };

const GITHUB_API = 'https://api.github.com';
const BOT_LOGIN = /(?:\[bot\]$|[-_]bot$)|^(?:renovate|dependabot|github-actions|github-bot|web-flow)$/i;
const NAME_QUERY = `query ContributorNames($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on User {
      login
      name
    }
  }
}`;

interface GitHubContributor {
    avatar_url: string;
    contributions: number;
    html_url: string;
    login: string;
    node_id: string;
    type: string;
}

/** A person shown on the contributors page. */
export interface Contributor {
    avatar: string;
    contributions: number;
    isOwner: boolean;
    login: string;
    name: string;
    url: string;
}

declare const data: Contributor[];
export { data };

const repo = new URL(manifest.repository.url.replace(/^git\+/, '')).pathname.slice(1).replace(/\.git$/, '');
const [owner] = repo.split('/');
// biome-ignore lint/suspicious/noUndeclaredEnvVars: VitePress runs outside Turborepo.
const token = process.env.GITHUB_TOKEN;
const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token && { Authorization: `Bearer ${token}` })
};

async function fetchContributors() {
    const people: GitHubContributor[] = [];
    for (let page = 1; ; page++) {
        const response = await fetch(`${GITHUB_API}/repos/${repo}/contributors?per_page=100&page=${page}`, {
            headers,
            signal: AbortSignal.timeout(30_000)
        });
        if (response.status === 204) break;
        if (!response.ok) {
            throw new Error(`GitHub contributor lookup failed (${response.status}). Set GITHUB_TOKEN if rate limited.`);
        }
        // GitHub's documented response shape; the array check guards the boundary.
        const body: GitHubContributor[] = await response.json();
        if (!Array.isArray(body)) throw new Error('GitHub returned an invalid contributor list.');
        people.push(...body.filter(({ type, login }) => type === 'User' && !BOT_LOGIN.test(login)));
        if (body.length < 100) break;
    }
    return people;
}

/** Display names need the GraphQL API, which rejects anonymous requests; usernames are the fallback. */
async function fetchNames(people: GitHubContributor[]) {
    const names = new Map<string, string>();
    if (!token || !people.length) return names;
    try {
        const response = await fetch(`${GITHUB_API}/graphql`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: NAME_QUERY, variables: { ids: people.map(({ node_id }) => node_id) } }),
            signal: AbortSignal.timeout(30_000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result: { data?: { nodes?: ({ login?: string; name?: string | null } | null)[] } } =
            await response.json();
        for (const profile of result.data?.nodes ?? []) {
            const name = profile?.name?.trim();
            if (profile?.login && name) names.set(profile.login, name);
        }
    } catch (error) {
        console.warn(`GitHub contributor name lookup failed; using usernames. ${error}`);
    }
    return names;
}

/** Loads human contributors at build time, so the token never reaches the client bundle. */
export default {
    watch: ['../../../package.json'],
    async load(): Promise<Contributor[]> {
        let people: GitHubContributor[];
        try {
            people = await fetchContributors();
        } catch (error) {
            // A published site must not silently lose its contributors, but local previews work offline.
            // biome-ignore lint/suspicious/noUndeclaredEnvVars: VitePress runs outside Turborepo.
            if (process.env.CI) throw error;
            console.warn(`${error} Rendering an empty contributor list.`);
            return [];
        }
        const names = await fetchNames(people);
        return people
            .map((person) => ({
                avatar: person.avatar_url,
                contributions: person.contributions,
                isOwner: person.login.toLowerCase() === owner.toLowerCase(),
                login: person.login,
                name: names.get(person.login) ?? person.login,
                url: person.html_url
            }))
            .sort(
                (left, right) =>
                    Number(right.isOwner) - Number(left.isOwner) ||
                    right.contributions - left.contributions ||
                    left.login.localeCompare(right.login)
            );
    }
} satisfies LoaderModule;
