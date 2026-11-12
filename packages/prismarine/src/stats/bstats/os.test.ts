import { describe, expect, it } from 'vitest';

import { bstatsOs } from './os';

describe('stats/bstats/os', () => {
    it.each([
        {
            type: 'Linux',
            release: '6.1.0-18-amd64',
            version: '#1 SMP PREEMPT_DYNAMIC Debian 6.1.76-1',
            osName: 'Linux',
            osVersion: '6.1.0-18-amd64'
        },
        {
            type: 'Linux',
            release: '5.15.153.1-microsoft-standard-WSL2',
            version: '#1 SMP',
            osName: 'Linux',
            osVersion: '5.15.153.1-microsoft-standard-WSL2'
        }
    ])('keeps Linux $release as node:os gives it', ({ osName, osVersion, ...platform }) => {
        expect(bstatsOs(platform)).toStrictEqual({ osName, osVersion });
    });

    it.each([
        { release: '19.6.0', osVersion: '10.15' },
        { release: '20.6.0', osVersion: '11.6' },
        { release: '21.6.0', osVersion: '12.6' },
        { release: '22.6.0', osVersion: '13.6' },
        { release: '23.5.0', osVersion: '14.5' },
        { release: '24.1.0', osVersion: '15.1' },
        { release: '25.0.0', osVersion: '26.0' },
        { release: '25.1.0', osVersion: '26.1' }
    ])('reports Darwin $release as Mac OS X $osVersion', ({ release, osVersion }) => {
        expect(
            bstatsOs({ type: 'Darwin', release, version: `Darwin Kernel Version ${release}: Thu Jun 1 2024` })
        ).toStrictEqual({
            osName: 'Mac OS X',
            osVersion
        });
    });

    it.each([
        { release: '10.0.19045', version: 'Windows 10 Pro', osName: 'Windows 10' },
        { release: '10.0.22631', version: 'Windows 11 Pro', osName: 'Windows 11' },
        // Windows 11 still names itself Windows 10 in the product name some APIs read.
        { release: '10.0.26100', version: 'Windows 10 Enterprise', osName: 'Windows 11' },
        { release: '10.0.17763', version: 'Windows Server 2019 Datacenter', osName: 'Windows Server 2019' },
        { release: '10.0.20348', version: 'Windows Server 2022 Standard', osName: 'Windows Server 2022' },
        { release: '10.0.26100', version: 'Windows Server 2025 Datacenter', osName: 'Windows Server 2025' },
        { release: '6.3.9600', version: 'Windows Server 2012 R2 Standard', osName: 'Windows Server 2012 R2' },
        { release: '6.3.9600', version: 'Windows 8.1 Pro', osName: 'Windows 8.1' },
        { release: '10.0.22631', version: '', osName: 'Windows' }
    ])('reports $version ($release) as $osName', ({ release, version, osName }) => {
        expect(bstatsOs({ type: 'Windows_NT', release, version })).toStrictEqual({
            osName,
            osVersion: release.split('.').slice(0, 2).join('.')
        });
    });

    it('keeps another OS name and release as node:os gives them', () => {
        expect(
            bstatsOs({ type: 'FreeBSD', release: '13.1-RELEASE-p9', version: 'FreeBSD 13.1-RELEASE-p9 GENERIC' })
        ).toStrictEqual({
            osName: 'FreeBSD',
            osVersion: '13.1-RELEASE-p9'
        });
    });
});
