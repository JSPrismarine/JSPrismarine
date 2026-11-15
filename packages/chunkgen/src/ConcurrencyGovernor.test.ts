import { describe, expect, it } from 'vitest';

import {
    cgroupV2PathOf,
    CgroupThrottleSampler,
    ConcurrencyGovernor,
    parseCpuMax,
    parseCpuStat
} from './ConcurrencyGovernor';

describe('ConcurrencyGovernor', () => {
    it('starts at half, rises one step per calm second, and stops at the maximum', () => {
        const governor = new ConcurrencyGovernor({ max: 6 });
        expect(governor.active).toBe(3);

        let now = 0;
        const seen: number[] = [];
        for (let second = 0; second < 6; second++) {
            seen.push(governor.observe({ latenessMs: 2 }, now));
            now += 1000;
        }

        expect(seen).toEqual([3, 4, 5, 6, 6, 6]);
    });

    it('cuts sharply on late ticks, holds off a while, then recovers', () => {
        const governor = new ConcurrencyGovernor({ max: 8, initial: 8 });

        expect(governor.observe({ latenessMs: 90 }, 0)).toBe(4);
        expect(governor.observe({ latenessMs: 90 }, 50)).toBe(2);
        expect(governor.observe({ latenessMs: 90 }, 100)).toBe(1);
        // Never below the floor, so background work keeps moving.
        expect(governor.observe({ latenessMs: 90 }, 150)).toBe(1);

        // Calm again, but the hold-off after the last pressure (until 2150) has not passed.
        expect(governor.observe({ latenessMs: 1 }, 1200)).toBe(1);
        // Hold-off over and more than a second since the last change: one step up.
        expect(governor.observe({ latenessMs: 1 }, 2300)).toBe(2);
        // Another step needs another calm second.
        expect(governor.observe({ latenessMs: 1 }, 3200)).toBe(2);
        expect(governor.observe({ latenessMs: 1 }, 3400)).toBe(3);
    });

    it('counts a stall once, not the ticks that catch up on it', () => {
        const governor = new ConcurrencyGovernor({ max: 8, initial: 8 });

        // A 300 ms stall, then the ticker running the ticks it owes back to back.
        expect(governor.observe({ latenessMs: 300 }, 0)).toBe(4);
        let now = 300;
        for (const latenessMs of [255, 210, 165, 120, 75, 30]) {
            now += 5;
            expect(governor.observe({ latenessMs }, now)).toBe(4);
        }

        // A second stall is pressure again.
        expect(governor.observe({ latenessMs: 1 }, 400)).toBe(4);
        expect(governor.observe({ latenessMs: 120 }, 500)).toBe(2);
    });

    it('counts a late tick only while the server thread has been busy', () => {
        const governor = new ConcurrencyGovernor({ max: 8, initial: 8 });

        // A burst on a thread that was mostly waiting: fewer workers would not shorten it.
        expect(governor.observe({ latenessMs: 200, utilization: 0.45 }, 0)).toBe(8);
        expect(governor.observe({ latenessMs: 1, utilization: 0.45 }, 100)).toBe(8);
        // The same on a thread busy most of the time is load that more chunks would add to.
        expect(governor.observe({ latenessMs: 200, utilization: 0.9 }, 200)).toBe(4);
        // The bar is the one it was built with.
        const strict = new ConcurrencyGovernor({ max: 8, initial: 8, busyUtilization: 0.4 });
        expect(strict.observe({ latenessMs: 200, utilization: 0.45 }, 0)).toBe(4);
    });

    it('still cuts while ticks stay late, which is a server that cannot keep up', () => {
        const governor = new ConcurrencyGovernor({ max: 8, initial: 8 });

        expect(governor.observe({ latenessMs: 80, utilization: 1 }, 0)).toBe(4);
        expect(governor.observe({ latenessMs: 85, utilization: 1 }, 50)).toBe(2);
        expect(governor.observe({ latenessMs: 90, utilization: 1 }, 100)).toBe(1);
    });

    it('treats a throttled control group as pressure before any tick is late', () => {
        const governor = new ConcurrencyGovernor({ max: 6, initial: 6 });

        expect(governor.observe({ latenessMs: 0, throttledDelta: 3 }, 0)).toBe(3);
        expect(governor.observe({ latenessMs: 0, throttledDelta: 0 }, 100)).toBe(3);
    });

    it('keeps the bounds it was given', () => {
        const governor = new ConcurrencyGovernor({ max: 4, min: 2, initial: 99 });
        expect(governor.active).toBe(4);
        governor.observe({ latenessMs: 500 }, 0);
        governor.observe({ latenessMs: 500 }, 10);
        governor.observe({ latenessMs: 500 }, 20);
        expect(governor.active).toBe(2);
    });
});

describe('control group files', () => {
    it('reads version 2 throttle counters, which are in microseconds', () => {
        const text =
            'usage_usec 5\nuser_usec 3\nsystem_usec 2\nnr_periods 40\nnr_throttled 7\nthrottled_usec 912000\nnr_bursts 0\nburst_usec 0\n';
        expect(parseCpuStat(text)).toEqual({ nrPeriods: 40, nrThrottled: 7, throttledUsec: 912000 });
    });

    it('reads version 1 throttle counters, which are in nanoseconds', () => {
        expect(parseCpuStat('nr_periods 10\nnr_throttled 2\nthrottled_time 5000000\n')).toEqual({
            nrPeriods: 10,
            nrThrottled: 2,
            throttledUsec: 5000
        });
    });

    it('answers nothing for a group without the controller', () => {
        expect(parseCpuStat('usage_usec 5\nuser_usec 3\nsystem_usec 2\n')).toBeUndefined();
    });

    it('reads cpu.max with and without a limit', () => {
        expect(parseCpuMax('max 100000\n')).toEqual({ quotaUsec: undefined, periodUsec: 100000 });
        expect(parseCpuMax('50000 100000\n')).toEqual({ quotaUsec: 50000, periodUsec: 100000 });
        expect(parseCpuMax('200000')).toEqual({ quotaUsec: 200000, periodUsec: 100000 });
        expect(parseCpuMax('')).toBeUndefined();
    });

    it('finds the version 2 group in /proc/self/cgroup', () => {
        expect(cgroupV2PathOf('12:cpu:/legacy\n0::/system.slice/jsp.service\n')).toBe('/system.slice/jsp.service');
        expect(cgroupV2PathOf('0::/gone (deleted)\n')).toBe('/gone');
        expect(cgroupV2PathOf('1:cpu:/legacy\n')).toBeUndefined();
    });

    it('samples the growth of the throttle counter, and nothing off Linux', () => {
        let throttled = 4;
        const files = {
            read: (path: string): string | undefined => {
                if (path === '/proc/self/cgroup') return '0::/app\n';
                if (path === '/sys/fs/cgroup/app/cpu.stat')
                    return `nr_periods 100\nnr_throttled ${throttled}\nthrottled_usec 1\n`;
                return undefined;
            }
        };
        const sampler = new CgroupThrottleSampler(files);

        expect(sampler.available).toBe(true);
        expect(sampler.sample()).toBe(0);
        throttled = 9;
        expect(sampler.sample()).toBe(5);
        expect(sampler.sample()).toBe(0);

        const none = new CgroupThrottleSampler({ read: () => undefined });
        expect(none.available).toBe(false);
        expect(none.sample()).toBeUndefined();
    });
});
