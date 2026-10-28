import { appendFileSync } from 'node:fs';

import type { Family } from './families.ts';

/** A non-gating measure of how much real data a parity comparison covers. */
export interface ParityMeasurement {
    readonly family: Family;
    readonly name: string;
    readonly value: number;
}

/** Reports non-gating parity measurements to CI and, when requested, the dashboard artifact. */
export const reportParityProgress = (family: Family, values: Readonly<Record<string, number>>): void => {
    const measurements = Object.entries(values).map(([name, value]) => ({ family, name, value }));
    const outputPath = process.env.PARITY_PROGRESS_FILE;

    if (outputPath !== undefined && outputPath !== '') {
        appendFileSync(outputPath, `${measurements.map((measurement) => JSON.stringify(measurement)).join('\n')}\n`);
        return;
    }

    for (const { name, value } of measurements) {
        const message = `${family} ${name}: ${value}`;
        if (process.env.GITHUB_ACTIONS === 'true') {
            process.stdout.write(`::warning title=Parity progress::${message}\n`);
        } else {
            console.warn(`[parity progress] ${message}`);
        }
    }
};
