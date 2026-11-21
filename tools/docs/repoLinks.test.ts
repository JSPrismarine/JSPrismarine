import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { loadAddons } from './addons.mts';
import { addonReadmePath, isUnpublished, rootPages, sections } from './sections.mts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The parsed package.json is an untyped boundary; only the repository URL is read.
const manifest: { repository: { url: string } } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
// The same URL `assemble.mts` sends unpublished files to.
const blobUrl = `${manifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')}/blob/master`;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blobLink = new RegExp(`${escapeRegExp(blobUrl)}/([^)\\s#>"'\`]+)`, 'g');

const addonReadmes = (await loadAddons()).map(({ name }) => addonReadmePath(name));

/** The Markdown sources the docs build stages as pages, relative to the repository root. */
function stagedSources() {
    const files = [...rootPages.map(({ source }) => source), ...addonReadmes];
    for (const section of sections) {
        if (section.generated) continue;
        const dir = path.join(repoRoot, 'docs', section.dir);
        for (const entry of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
            if (entry.endsWith('.md') && !isUnpublished(section, entry)) {
                files.push(path.posix.join('docs', section.dir, entry.split(path.sep).join('/')));
            }
        }
    }
    return files;
}

/** Whether the site publishes the file at this repository path as a page. */
function isPublishedPage(repoPath: string) {
    if (rootPages.some(({ source }) => source === repoPath) || addonReadmes.includes(repoPath)) return true;
    return sections.some(
        (section) =>
            !section.generated &&
            repoPath.startsWith(`docs/${section.dir}/`) &&
            repoPath.endsWith('.md') &&
            !isUnpublished(section, repoPath.slice(`docs/${section.dir}/`.length))
    );
}

describe('staged docs pages', () => {
    it('link to other published pages relatively, so the site keeps readers on its own pages', () => {
        const offenders: string[] = [];
        for (const file of stagedSources()) {
            const lines = readFileSync(path.join(repoRoot, file), 'utf8').split('\n');
            lines.forEach((line, index) => {
                for (const [url, repoPath] of line.matchAll(blobLink)) {
                    if (repoPath !== undefined && isPublishedPage(repoPath))
                        offenders.push(`${file}:${index + 1} ${url}`);
                }
            });
        }
        expect(offenders, 'Replace these GitHub URLs with relative links to the files').toEqual([]);
    });

    it('recognizes a published page and leaves unpublished files alone', () => {
        expect(isPublishedPage('docs/data-driven/dimensions.md')).toBe(true);
        expect(isPublishedPage('CONTRIBUTING.md')).toBe(true);
        expect(isPublishedPage('docs/research/console-tui/ballot.md')).toBe(false);
        expect(isPublishedPage('docs/design/README.md')).toBe(false);
        expect(isPublishedPage('.agents/skills/codebase-design/SKILL.md')).toBe(false);
    });
});
