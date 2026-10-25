import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as Generators from './generators/Generators';
import { GeneratorManager } from './GeneratorManager';
import type Server from '../Server';

describe('world', () => {
    describe('GeneratorManager', () => {
        const server: Server = vi.fn().mockImplementation(() => ({
            getLogger: () => ({
                debug: () => {},
                verbose: () => {}
            }),
            getBlockManager: () => ({
                getBlock: () => {}
            }),
            releaseOnShutdown: () => {}
        }))();

        let generatorManager: GeneratorManager;

        beforeEach(() => {
            generatorManager = new GeneratorManager(server);
        });

        it('should register all generators', () => {
            const generatorKeys = Object.keys(Generators);
            generatorKeys.forEach((key) => {
                expect(generatorManager.getGenerator(key)).toBeDefined();
            });
        });

        it('should throw an error for an invalid generator id', () => {
            expect(() => {
                generatorManager.getGenerator('invalid');
            }).toThrowError('Invalid generator with id invalid');
        });

        it('stops every generator it holds', () => {
            let stopped = 0;

            class Stoppable {
                public async generateChunk(): Promise<never> {
                    throw new Error('This generator is only here to be stopped');
                }

                public stopGenerating(): void {
                    stopped++;
                }
            }

            generatorManager.registerClassGenerator('Stoppable', Stoppable, server);
            generatorManager.stopGenerating();

            expect(stopped).toBe(1);
        });

        it('leaves a generator that was never used alone', () => {
            // `Overworld` builds its pipeline on the first chunk it is asked for, so a server
            // that shuts down before generating anything must not make it read Mojang's data
            // on the way out just to be told to stop.
            expect(() => generatorManager.stopGenerating()).not.toThrow();
        });
    });
});
