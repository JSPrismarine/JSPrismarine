import { describe, expect, it } from 'vitest';

import { newestRelease, ProtocolVersions } from './ProtocolVersion';
import type { ProtocolVersionDefinition } from './ProtocolVersion';

describe('newestRelease', () => {
    const definitions: readonly ProtocolVersionDefinition[] = Object.values(ProtocolVersions);

    it('is the highest protocol that is not a preview', () => {
        const releases = definitions.filter((definition) => definition.preview !== true);

        expect(newestRelease.preview).not.toBe(true);
        for (const release of releases)
            expect(release.protocolVersion).toBeLessThanOrEqual(newestRelease.protocolVersion);
    });

    it('skips a preview newer than it', () => {
        const previews = definitions.filter((definition) => definition.preview === true);

        for (const preview of previews) expect(preview.protocolVersion).toBeGreaterThan(newestRelease.protocolVersion);
    });
});
