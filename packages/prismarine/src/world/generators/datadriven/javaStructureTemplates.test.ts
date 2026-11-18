import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { javaServerCacheFolder } from '@jsprismarine/bedrock-data/sources';

import { JAVA_TEMPLATE_ENV, findJavaTemplates, javaTemplateDirectory } from './javaStructureTemplates';

/** A preview pinned beside the default; it sorts after it, so a newest-first reader would pick it. */
const PREVIEW = '99.0-snapshot-1';

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

/** Writes one loose template file under a release's `java-structures/` folder. */
const writeTemplate = (cacheRoot: string, release: string, name: string): void => {
    const directory = join(cacheRoot, 'java-structures', release);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${name}.nbt`), name);
};

describe('the Java structure template lookup', () => {
    let cacheRoot: string;

    beforeEach(() => {
        cacheRoot = mkdtempSync(join(tmpdir(), 'jsp-java-templates-'));
        temporaryDirs.push(cacheRoot);
        vi.stubEnv(JAVA_TEMPLATE_ENV.templates, '');
        vi.stubEnv(JAVA_TEMPLATE_ENV.jar, '');
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("reads the extracted templates of the release it is asked for, not the newest folder's", () => {
        writeTemplate(cacheRoot, javaServerCacheFolder, 'default_only');
        writeTemplate(cacheRoot, PREVIEW, 'preview_only');

        expect(javaTemplateDirectory(cacheRoot)).toBe(join(cacheRoot, 'java-structures', javaServerCacheFolder));
        expect([...(findJavaTemplates(cacheRoot)?.keys() ?? [])]).toEqual(['minecraft:default_only']);
        expect([...(findJavaTemplates(cacheRoot, PREVIEW)?.keys() ?? [])]).toEqual(['minecraft:preview_only']);
    });

    it("finds nothing rather than another release's templates or jar", () => {
        writeTemplate(cacheRoot, PREVIEW, 'preview_only');
        // Never opened: the default release's jar is looked up by name in both cache folders.
        mkdirSync(join(cacheRoot, 'java-server', PREVIEW), { recursive: true });
        writeFileSync(join(cacheRoot, 'java-server', PREVIEW, 'server.jar'), 'not a jar');

        expect(javaTemplateDirectory(cacheRoot)).toBeUndefined();
        expect(findJavaTemplates(cacheRoot)).toBeUndefined();
    });
});
