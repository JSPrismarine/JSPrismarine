import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdownRenderer } from 'vitepress';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** The server package's changelog. Changesets versions every server package together, so it speaks for all of them. */
const changelog = path.join(repoRoot, 'packages', 'prismarine', 'CHANGELOG.md');
/** Releases shown in full on the page; older ones are linked on GitHub. */
const SHOWN_RELEASES = 6;

/** Characters of body text after a note's lead sentence beyond which the body folds behind "Details". */
const FOLD_AFTER = 360;

/** One changeset in a release. */
export interface ReleaseChange {
    /** Rendered HTML of the change's description. */
    html: string;
    /** The description's first sentence as plain text, for teasers. */
    summary: string;
    /** Whether the change breaks or removes something an upgrader has to act on. */
    breaking: boolean;
    commit?: { sha: string; url: string };
    pullRequest?: { number: number; url: string };
}

/** One version of the server, newest first. */
export interface Release {
    version: string;
    /** The day the release was tagged, when the checkout has its tag. */
    date?: string;
    kind: 'major' | 'minor' | 'patch';
    major: ReleaseChange[];
    minor: ReleaseChange[];
    patch: ReleaseChange[];
    /** Dependency bumps, counted rather than listed. */
    dependencyUpdates: number;
}

export interface ReleaseData {
    releases: Release[];
    /** Every version in the changelog, including those not shown in full. */
    totalReleases: number;
    changelogUrl: string;
}

const COMMIT = /\[`([0-9a-f]{7})`\]\((https:\/\/github\.com\/[^)]+\/commit\/[0-9a-f]+)\)/;
const PULL = /\[#(\d+)\]\((https:\/\/github\.com\/[^)]+\/pull\/\d+)\)/;

/** The repository's web URL, from the root manifest. */
function repositoryUrl() {
    // The parsed package.json is an untyped boundary; only the repository URL is read.
    const manifest: { repository: { url: string } } = JSON.parse(
        readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
    );
    return manifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
}

/** Reads the tag date of each server release; a shallow checkout without tags yields none. */
function tagDates() {
    try {
        const refs = execFileSync(
            'git',
            ['for-each-ref', '--format=%(refname:short) %(creatordate:short)', 'refs/tags/@jsprismarine/prismarine@*'],
            { cwd: repoRoot, encoding: 'utf8' }
        );
        return new Map(
            refs
                .trim()
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                    const [ref, date] = line.split(' ');
                    return [ref.slice(ref.lastIndexOf('@') + 1), date] as const;
                })
        );
    } catch {
        return new Map<string, string>();
    }
}

/** Splits a section into its top-level bullets, keeping each bullet's continuation lines. */
function bullets(section: string) {
    return section
        .split(/^- /m)
        .slice(1)
        .map((bullet) => bullet.replace(/\n {2,}/g, '\n').trim());
}

/** The first sentence of a Markdown description, with code spans and links reduced to their text. */
function firstSentence(markdown: string) {
    const text = markdown
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    return /^.+?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
}

async function load(): Promise<ReleaseData> {
    const md = await createMarkdownRenderer(repoRoot);
    const source = readFileSync(changelog, 'utf8');
    const dates = tagDates();
    const versions = source.split(/^## /m).slice(1);

    const releases = versions.slice(0, SHOWN_RELEASES).map((block): Release => {
        const [heading, ...rest] = block.split('\n');
        const version = heading.trim();
        const release: Release = {
            version,
            date: dates.get(version),
            kind: 'patch',
            major: [],
            minor: [],
            patch: [],
            dependencyUpdates: 0
        };
        for (const section of rest.join('\n').split(/^### /m).slice(1)) {
            const kind = /^(Major|Minor|Patch) Changes/.exec(section)?.[1].toLowerCase();
            if (kind !== 'major' && kind !== 'minor' && kind !== 'patch') continue;
            for (const bullet of bullets(section)) {
                if (bullet.startsWith('Updated dependencies')) continue;
                // Changesets writes "Thanks @author! - description" after the links.
                const description = bullet.replace(/^[\s\S]*?Thanks \[@[^\]]+\]\([^)]+\)! - /, '');
                if (/^chore\(deps\)/.test(description)) {
                    release.dependencyUpdates++;
                    continue;
                }
                const commit = COMMIT.exec(bullet);
                const pull = PULL.exec(bullet);
                const html = markChange(md.render(description));
                release[kind].push({
                    html,
                    breaking: html.includes('release__breaking'),
                    summary: firstSentence(description),
                    commit: commit ? { sha: commit[1], url: commit[2] } : undefined,
                    pullRequest: pull ? { number: Number(pull[1]), url: pull[2] } : undefined
                });
            }
        }
        release.kind = release.major.length ? 'major' : release.minor.length ? 'minor' : 'patch';
        return release;
    });

    return {
        releases,
        totalReleases: versions.length,
        changelogUrl: `${repositoryUrl()}/blob/master/${path.relative(repoRoot, changelog).split(path.sep).join('/')}`
    };
}

declare const data: ReleaseData;
export { data };

/**
 * Marks up a rendered change for scanning: its opening sentence becomes a lead-in, when that sentence
 * is plain text, a long body after it folds behind "Details", and the paragraphs that break or remove
 * something fold into a labeled disclosure the notes set apart.
 */
function markChange(html: string) {
    return (
        html
            .replace(/^<p>((?:[^<.!?]|<[^>]+>)+?[.!?])(?=\s|<\/p>)/, '<p><strong class="release__lead">$1</strong>')
            .replace(/<p>(?=(?:Breaking|Removed)\b)/g, '<p class="release__breaking">')
            // The notes label these paragraphs, so a leading "Breaking:" would say it twice.
            .replace(/<p class="release__breaking">Breaking:\s*/g, '<p class="release__breaking">')
            // A breaking note lists removed names, which only upgraders need, so it folds behind its label.
            .replace(
                /<p class="release__breaking">([\s\S]*?)<\/p>/g,
                '<details class="release__breaking"><summary>Breaking: what to update</summary><p>$1</p></details>'
            )
            // A long note keeps its lead sentence in view and folds what follows, up to its first breaking
            // note, so the list stays scannable.
            .replace(
                /^(<p><strong class="release__lead">[\s\S]*?<\/strong>)([\s\S]*?)(?=<details class="release__breaking"|$)/,
                (note, lead: string, body: string) =>
                    body.replace(/<[^>]+>/g, '').trim().length > FOLD_AFTER
                        ? `${lead}</p><details class="release__details"><summary>Details</summary><p>${body.trimStart()}</details>`
                        : note
            )
    );
}

export default {
    watch: ['../../../packages/prismarine/CHANGELOG.md'],
    load
};
