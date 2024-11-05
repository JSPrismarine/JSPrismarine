import { beforeEach, describe, expect, it } from 'vitest';
import Timer from './Timer';

describe('utils', () => {
    describe('Timer', () => {
        let timer: Timer;

        beforeEach(() => {
            timer = new Timer();
        });

        it('should start the timer upon instantiation', () => {
            expect(timer).toBeInstanceOf(Timer);
            expect(timer['startTime']).toBeDefined();
        });

        it('should reset the timer', () => {
            timer.reset();
            expect(timer['startTime']).toBeDefined();
            expect(timer['endTime']).toBeUndefined();
        });

        it('should stop the timer and return the duration in ms', () => {
            const duration = timer.stop();
            expect(duration).toBeGreaterThanOrEqual(0);
            expect(timer['endTime']).toBeDefined();
        });

        it('throws an error if getResult is called before stop', () => {
            expect(() => timer.getResult()).toThrow('You need to stop the timer before getting the result.');
        });

        it('returns the correct duration in ms', async () => {
            await new Promise((resolve) => setTimeout(resolve, 110));
            const duration = timer.stop();
            expect(duration).toBeGreaterThanOrEqual(100);
        });
    });
});
