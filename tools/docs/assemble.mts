/**
 * Stages VitePress inputs that live outside this package: handwritten guides,
 * generated bedrock-data, and a parity tracker snapshot from the full suite.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TrackerCase, TrackerData, TrackerVideo } from '../../packages/parity/src/dashboard/tracker.ts';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '..', '..');
const guideDir = path.join(packageDir, 'site', 'guide');
const publicDir = path.join(packageDir, 'site', 'public');
const trackerPath = path.join(publicDir, 'parity-tracker.json');
const evidencePath = path.join(packageDir, 'parity-evidence.json');

interface ParityEvidenceManifest {
    readonly version: 1;
    readonly cases: Readonly<Record<string, readonly TrackerVideo[]>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseVideo = (value: unknown, caseId: string): TrackerVideo => {
    if (
        !isRecord(value) ||
        typeof value.label !== 'string' ||
        value.label.trim() === '' ||
        typeof value.src !== 'string' ||
        value.src.trim() === '' ||
        (value.caption !== undefined && typeof value.caption !== 'string') ||
        (value.poster !== undefined && typeof value.poster !== 'string')
    ) {
        throw new Error(`Invalid video evidence for parity case ${caseId}.`);
    }

    return {
        label: value.label,
        src: value.src,
        ...(value.caption === undefined ? {} : { caption: value.caption }),
        ...(value.poster === undefined ? {} : { poster: value.poster })
    };
};

const parseEvidenceManifest = (value: unknown): ParityEvidenceManifest => {
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.cases)) {
        throw new Error(`Invalid parity evidence manifest: ${evidencePath}.`);
    }

    const cases = Object.fromEntries(
        Object.entries(value.cases).map(([caseId, entries]) => {
            if (caseId.trim() === '' || !Array.isArray(entries) || entries.length === 0) {
                throw new Error(`Parity evidence for ${caseId || '(empty case id)'} must contain at least one clip.`);
            }
            return [caseId, entries.map((entry) => parseVideo(entry, caseId))];
        })
    );

    return { version: 1, cases };
};

const validateStaticAsset = (assetPath: string, kind: 'video' | 'poster', required: boolean): boolean => {
    const allowedExtensions = kind === 'video' ? ['.mp4', '.webm'] : ['.avif', '.jpeg', '.jpg', '.png', '.webp'];
    const segments = assetPath.split('/');
    if (
        !assetPath.startsWith('parity-evidence/') ||
        assetPath.includes('\\') ||
        segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
        !allowedExtensions.includes(path.extname(assetPath).toLowerCase())
    ) {
        throw new Error(`Invalid ${kind} asset path in ${evidencePath}: ${assetPath}`);
    }

    const absolutePath = path.resolve(publicDir, assetPath);
    const relativePath = path.relative(publicDir, absolutePath);
    if (
        relativePath === '' ||
        relativePath === '..' ||
        relativePath.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error(`Invalid ${kind} asset path in ${evidencePath}: ${assetPath}`);
    }
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        if (!required) return false;
        throw new Error(`Missing ${kind} asset for parity evidence: ${assetPath}`);
    }
    return true;
};

const addParityEvidence = (tracker: TrackerData, manifest: ParityEvidenceManifest, required: boolean): TrackerData => {
    const caseIds = new Set(tracker.cases.map((entry) => entry.id));
    const availableVideos = new Map<string, TrackerVideo[]>();
    for (const [caseId, videos] of Object.entries(manifest.cases)) {
        if (!caseIds.has(caseId)) throw new Error(`Parity evidence references unknown case id: ${caseId}`);
        for (const video of videos) {
            if (!validateStaticAsset(video.src, 'video', required)) continue;
            const posterExists = video.poster === undefined || validateStaticAsset(video.poster, 'poster', required);
            const available = availableVideos.get(caseId) ?? [];
            available.push({
                label: video.label,
                src: video.src,
                ...(video.caption === undefined ? {} : { caption: video.caption }),
                ...(posterExists && video.poster !== undefined ? { poster: video.poster } : {})
            });
            availableVideos.set(caseId, available);
        }
    }

    const attachEvidence = (entry: TrackerCase): TrackerCase => {
        const videos = availableVideos.get(entry.id);
        return videos === undefined ? entry : { ...entry, videos };
    };

    return {
        ...tracker,
        cases: tracker.cases.map(attachEvidence),
        families: tracker.families.map((family) => ({ ...family, cases: family.cases.map(attachEvidence) }))
    };
};

execFileSync('pnpm', ['--filter', '@jsprismarine/bedrock-data', 'run', 'generate'], {
    cwd: repoRoot,
    stdio: 'inherit'
});

execFileSync('pnpm', ['--filter', '@jsprismarine/parity', 'run', 'dashboard'], {
    cwd: repoRoot,
    env: { ...process.env, GITHUB_STEP_SUMMARY: '' },
    stdio: ['ignore', 'ignore', 'inherit']
});
mkdirSync(publicDir, { recursive: true });
// This generated JSON uses the schema produced by the parity dashboard.
const tracker = JSON.parse(
    readFileSync(path.join(repoRoot, 'packages', 'parity', 'dist', 'tracker.json'), 'utf8')
) as TrackerData;
const evidenceManifest = parseEvidenceManifest(JSON.parse(readFileSync(evidencePath, 'utf8')));
const requireParityEvidence = process.env.PARITY_EVIDENCE_REQUIRED === 'true';
writeFileSync(trackerPath, JSON.stringify(addParityEvidence(tracker, evidenceManifest, requireParityEvidence)));

rmSync(guideDir, { recursive: true, force: true });
mkdirSync(guideDir, { recursive: true });
for (const entry of readdirSync(path.join(repoRoot, 'docs'))) {
    if (!entry.endsWith('.md')) continue;
    cpSync(path.join(repoRoot, 'docs', entry), path.join(guideDir, entry));
}
console.log(`Staged ${readdirSync(guideDir).length} guide pages.`);
