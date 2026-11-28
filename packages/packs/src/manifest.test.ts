import { describe, expect, it } from 'vitest';

import { parseManifest } from './manifest';

const valid = () => ({
    format_version: 2,
    header: {
        name: 'Test Pack',
        uuid: '11111111-2222-3333-4444-555555555555',
        version: [1, 0, 0],
        min_engine_version: [1, 26, 50]
    },
    modules: [{ type: 'data', uuid: '66666666-7777-8888-9999-aaaaaaaaaaaa', version: [1, 0, 0] }]
});

describe('parseManifest', () => {
    it('parses a valid behavior pack manifest', () => {
        const { manifest, diagnostics } = parseManifest(valid(), 'test');
        expect(diagnostics).toEqual([]);
        expect(manifest).toMatchObject({
            formatVersion: 2,
            header: {
                name: 'Test Pack',
                uuid: '11111111-2222-3333-4444-555555555555',
                version: [1, 0, 0],
                minEngineVersion: [1, 26, 50]
            },
            modules: [{ type: 'data' }]
        });
    });

    it('keeps pack dependencies and skips native module dependencies', () => {
        const manifest = {
            ...valid(),
            dependencies: [
                { uuid: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', version: [1, 0, 0] },
                { module_name: '@minecraft/server', version: '1.0.0' }
            ]
        };
        const { manifest: parsed, diagnostics } = parseManifest(manifest, 'test');
        expect(diagnostics).toEqual([]);
        expect(parsed?.dependencies).toEqual([{ uuid: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', version: [1, 0, 0] }]);
    });

    it('reads metadata.product_type, and leaves it out when the manifest names none', () => {
        const addon = parseManifest({ ...valid(), metadata: { product_type: 'addon' } }, 'test');
        expect(addon.manifest?.productType).toBe('addon');
        expect(parseManifest(valid(), 'test').manifest).not.toHaveProperty('productType');
    });

    it('reads capabilities and subpacks, leaving out a subpack with no folder name', () => {
        const { manifest } = parseManifest(
            {
                ...valid(),
                capabilities: ['raytraced', 7],
                subpacks: [
                    { folder_name: 'low', name: 'Low', memory_tier: 0 },
                    { folder_name: 'high' },
                    { name: 'No folder' }
                ]
            },
            'test'
        );
        expect(manifest?.capabilities).toEqual(['raytraced']);
        expect(manifest?.subpacks).toEqual([
            { folderName: 'low', name: 'Low' },
            { folderName: 'high', name: 'high' }
        ]);
        expect(parseManifest(valid(), 'test').manifest).toMatchObject({ capabilities: [], subpacks: [] });
    });

    it('requires format_version 2 or 3 for a data pack', () => {
        const { manifest, diagnostics } = parseManifest({ ...valid(), format_version: 1 }, 'test');
        expect(manifest).toBeUndefined();
        expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'manifest.invalid' });
        expect(diagnostics[0]?.message).toContain('format_version must be 2 or 3');
        expect(parseManifest({ ...valid(), format_version: 4 }, 'test').manifest).toBeUndefined();
    });

    it('parses a format_version 3 manifest with SemVer string versions', () => {
        const { manifest, diagnostics } = parseManifest(
            {
                format_version: 3,
                header: {
                    name: 'Test Pack',
                    uuid: '11111111-2222-3333-4444-555555555555',
                    version: '1.1.2',
                    min_engine_version: '1.21.90'
                },
                modules: [{ type: 'resources', uuid: '66666666-7777-8888-9999-aaaaaaaaaaaa', version: '1.0.0-beta+7' }],
                dependencies: [
                    { uuid: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', version: '2.0.0' },
                    { module_name: '@minecraft/server', version: '2.1.0-beta' }
                ]
            },
            'test'
        );
        expect(diagnostics).toEqual([]);
        expect(manifest).toMatchObject({
            formatVersion: 3,
            header: { version: [1, 1, 2], minEngineVersion: [1, 21, 90] },
            modules: [{ type: 'resources', version: [1, 0, 0] }],
            dependencies: [{ uuid: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', version: [2, 0, 0] }]
        });
    });

    it('rejects a version string with no numeric core', () => {
        for (const version of ['-1.0.0', '+1', '1.0.0-', '1..0', '']) {
            const manifest = { ...valid(), format_version: 3, header: { ...valid().header, version } };
            const { manifest: parsed, diagnostics } = parseManifest(manifest, 'test');
            expect(parsed, version).toBeUndefined();
            expect(diagnostics[0]?.message).toContain('header.version must be a version');
        }
    });

    it('requires format_version 1 for a skin pack', () => {
        const manifest = valid();
        manifest.modules[0]!.type = 'skin_pack';
        expect(parseManifest(manifest, 'test').manifest).toBeUndefined();
        expect(parseManifest({ ...manifest, format_version: 1 }, 'test').manifest).toBeDefined();
    });

    it('rejects a manifest with no modules', () => {
        const { manifest, diagnostics } = parseManifest({ ...valid(), modules: [] }, 'test');
        expect(manifest).toBeUndefined();
        expect(diagnostics[0]?.message).toContain('at least one entry');
    });

    it('rejects a malformed header uuid', () => {
        const manifest = valid();
        manifest.header.uuid = 'not-a-uuid';
        expect(parseManifest(manifest, 'test').manifest).toBeUndefined();
    });

    it('rejects non-object input', () => {
        expect(parseManifest('[]', 'test').manifest).toBeUndefined();
        expect(parseManifest(null, 'test').manifest).toBeUndefined();
    });
});
