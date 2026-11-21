/**
 * Fixes the files TypeDoc copies into the API reference's `_media` directory, one for each file a doc
 * comment links to.
 *
 * A copy of a file the repository has is replaced by a link to it: to its page when the site
 * publishes it, such as an ADR, and to the file on GitHub otherwise. The copies were second
 * published pages beside the ones they copied (#3586). The links in any copy left, one whose source
 * this cannot find, are rewritten so they still resolve from the generated API reference.
 *
 * It runs after every `docs:api`, also when the build cache restored an API reference an earlier run
 * already fixed, so a second run over its own output changes nothing.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { linkRoute, publishedPage } from './sections.mts';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDirectory, '..', '..');
const apiDirectory = path.join(packageDirectory, 'site', 'api');
const mediaDirectory = path.join(apiDirectory, '_media');
const rootPackage: unknown = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
if (
    typeof rootPackage !== 'object' ||
    rootPackage === null ||
    !('repository' in rootPackage) ||
    typeof rootPackage.repository !== 'object' ||
    rootPackage.repository === null ||
    !('url' in rootPackage.repository) ||
    typeof rootPackage.repository.url !== 'string'
) {
    throw new Error('The root package.json must declare a repository URL.');
}
const repositoryUrl = rootPackage.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');

function rewritePackageLink(target: string, mediaFilePath: string): string {
    const packageTarget = target.slice('../../packages/'.length);
    const fragmentStart = packageTarget.indexOf('#');
    const fragment = fragmentStart === -1 ? '' : packageTarget.slice(fragmentStart);
    const packagePath = fragmentStart === -1 ? packageTarget : packageTarget.slice(0, fragmentStart);
    const segments = packagePath.split('/').filter(Boolean);
    const [packageName, ...packagePathSegments] = segments;

    if (packageName === undefined) return target;

    if (packagePathSegments.length === 0) {
        const apiPage = path.join(apiDirectory, '@jsprismarine', packageName, 'index.md');
        if (existsSync(apiPage)) {
            const relativeApiPage = path.relative(path.dirname(mediaFilePath), apiPage).split(path.sep).join('/');
            return `${relativeApiPage}${fragment}`;
        }
    }

    const normalizedPath = [packageName, ...packagePathSegments].join('/');
    const route = packagePath.endsWith('/') || packagePathSegments.length === 0 ? 'tree' : 'blob';
    return `${repositoryUrl}/${route}/master/packages/${normalizedPath}${fragment}`;
}

/** A copy's links to package files, which it copied relative to its source, pointed at what they name. */
function rewritePackageLinks(content: string, mediaFilePath: string): string {
    return content.replace(/\]\((\.\.\/\.\.\/packages\/[^)\s]+)\)/g, (_match, target: string) => {
        return `](${rewritePackageLink(target, mediaFilePath)})`;
    });
}

function rewriteMarkdown(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            rewriteMarkdown(entryPath);
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

        const content = readFileSync(entryPath, 'utf8');
        const rewritten = rewritePackageLinks(content, entryPath);
        if (rewritten !== content) writeFileSync(entryPath, rewritten);
    }
}

/** An image a doc comment shows, which stays in `_media` since a page cannot show a link instead. */
const IMAGE = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

/** The repository's tracked files by file name, which is what TypeDoc names a copy after. */
function trackedFilesByName() {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' }).split('\0');
    const byName = new Map<string, string[]>();
    for (const file of files.filter(Boolean)) {
        const name = path.posix.basename(file);
        byName.set(name, [...(byName.get(name) ?? []), file]);
    }
    return byName;
}

/**
 * The repository file a copy was made from. TypeDoc names a copy after its source, adding `-1`, `-2`
 * and so on when two sources share a name, and copies its bytes as they are. A copy an earlier run
 * of this script kept has had its package links rewritten, so it matches its source rewritten alike.
 */
function copySource(copyPath: string, byName: ReadonlyMap<string, readonly string[]>) {
    const name = path.basename(copyPath);
    const unsuffixed = name.replace(/-\d+(?=\.[^.]+$)/, '');
    const copy = readFileSync(copyPath);
    return [...new Set([...(byName.get(name) ?? []), ...(byName.get(unsuffixed) ?? [])])].find((file) => {
        const source = readFileSync(path.join(repoRoot, file));
        if (source.equals(copy)) return true;
        return name.endsWith('.md') && rewritePackageLinks(source.toString('utf8'), copyPath) === copy.toString('utf8');
    });
}

/** Where a link to a repository file opens: its page on the site, or the file on GitHub. */
function sourceLink(repoPath: string) {
    const page = publishedPage(repoPath);
    // VitePress adds the base to a site-absolute link.
    return page === undefined ? `${repositoryUrl}/blob/master/${repoPath}` : `/${linkRoute(page)}`;
}

/** Every Markdown page of the API reference outside `_media`. */
function apiPages(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return entryPath === mediaDirectory ? [] : apiPages(entryPath);
        return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
    });
}

/**
 * Points the API reference's links to each copy of a repository file at that file, and deletes the
 * copy. Fails when a link to a deleted copy is left, which would publish a dead link.
 *
 * @returns How many copies it replaced.
 */
function replaceCopies(): number {
    const byName = trackedFilesByName();
    const links = new Map<string, string>();
    for (const entry of readdirSync(mediaDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || IMAGE.test(entry.name)) continue;
        const source = copySource(path.join(mediaDirectory, entry.name), byName);
        if (source !== undefined) links.set(entry.name, sourceLink(source));
    }
    const mediaLink = /\]\((?:\.{1,2}\/)*_media\/([^)#\s]+)(#[^)\s]*)?\)/g;
    for (const page of apiPages(apiDirectory)) {
        const content = readFileSync(page, 'utf8');
        const rewritten = content.replace(mediaLink, (match, name: string, anchor = '') => {
            const link = links.get(name);
            return link === undefined ? match : `](${link}${anchor})`;
        });
        if (rewritten !== content) writeFileSync(page, rewritten);
        const left = [...rewritten.matchAll(mediaLink)].filter(([, name]) => name !== undefined && links.has(name));
        if (left.length) throw new Error(`${page} still links to a copy this script deletes: ${left[0]?.[0]}`);
    }
    for (const name of links.keys()) rmSync(path.join(mediaDirectory, name));
    return links.size;
}

// A project whose doc comments link to no file has no `_media` directory.
if (existsSync(mediaDirectory)) {
    const replaced = replaceCopies();
    rewriteMarkdown(mediaDirectory);
    console.log(`Replaced ${replaced} copies in the API reference's _media with links to the files they copied.`);
}
