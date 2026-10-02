import { describe, expect, it } from 'vitest';
import Random from './Random';
import { Samples } from './Metrics';

describe('Random', () => {
    it('gives the same sequence for the same seed', () => {
        // The whole reason this exists instead of Math.random: two runs against one server
        // have to differ because the *server* behaved differently.
        const draw = (seed: number) => Array.from({ length: 20 }, () => new Random(seed).next());

        expect(draw(1234)).toEqual(draw(1234));
        expect(new Random(1).next()).not.toBe(new Random(2).next());
    });

    it('gives each fleet member its own sequence', () => {
        // A single generator shared across five hundred bots would have them take turns
        // drawing from one sequence, so what each did would depend on how the others were
        // scheduled - exactly the non-determinism the seed exists to remove.
        const first = Array.from({ length: 10 }, () => Random.forMember(99, 0).next());
        const second = Array.from({ length: 10 }, () => Random.forMember(99, 1).next());

        expect(first).not.toEqual(second);
        expect(Array.from({ length: 10 }, () => Random.forMember(99, 7).next())).toEqual(
            Array.from({ length: 10 }, () => Random.forMember(99, 7).next())
        );
    });

    it('survives a seed of zero instead of returning it for ever', () => {
        const random = new Random(0);
        const values = new Set(Array.from({ length: 10 }, () => random.next()));

        expect(values.size).toBe(10);
    });

    it('stays inside the ranges it is asked for', () => {
        const random = new Random(7);

        for (let i = 0; i < 500; i++) {
            const value = random.next();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);

            const integer = random.nextInt(3, 6);
            expect(integer).toBeGreaterThanOrEqual(3);
            expect(integer).toBeLessThanOrEqual(6);
        }
    });

    it('refuses to pick out of nothing rather than returning undefined', () => {
        expect(() => new Random(1).pick([])).toThrow(/empty/);
    });
});

describe('Samples', () => {
    it('reports exact percentiles by nearest rank', () => {
        const samples = new Samples();
        for (let value = 1; value <= 100; value++) samples.add(value);

        expect(samples.percentile(0.5)).toBe(50);
        expect(samples.percentile(0.95)).toBe(95);
        expect(samples.percentile(0.99)).toBe(99);
        expect(samples.min()).toBe(1);
        expect(samples.max()).toBe(100);
        expect(samples.mean()).toBeCloseTo(50.5, 5);
    });

    it('reports nulls rather than NaN when nothing was measured', () => {
        // A fleet where every bot failed to connect still has to produce a report.
        expect(new Samples().summary()).toEqual({
            count: 0,
            min: null,
            mean: null,
            p50: null,
            p95: null,
            p99: null,
            max: null
        });
    });

    it('does not care what order samples arrived in', () => {
        const forwards = new Samples();
        const backwards = new Samples();
        for (let value = 1; value <= 50; value++) forwards.add(value);
        for (let value = 50; value >= 1; value--) backwards.add(value);

        expect(forwards.summary()).toEqual(backwards.summary());
    });
});
