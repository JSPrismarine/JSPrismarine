/**
 * Rewrites repository-relative links in Markdown files copied into TypeDoc's
 * `_media` directory so they still resolve from the generated API reference.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (!existsSync(mediaDirectory)) {
    throw new Error(`TypeDoc media directory was not generated: ${mediaDirectory}`);
}

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

function rewriteMarkdown(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            rewriteMarkdown(entryPath);
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

        const content = readFileSync(entryPath, 'utf8');
        const rewritten = content.replace(/\]\((\.\.\/\.\.\/packages\/[^)\s]+)\)/g, (_match, target: string) => {
            return `](${rewritePackageLink(target, entryPath)})`;
        });

        if (rewritten !== content) writeFileSync(entryPath, rewritten);
    }
}

rewriteMarkdown(mediaDirectory);
