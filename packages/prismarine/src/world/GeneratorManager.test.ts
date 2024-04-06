import GeneratorManager from './GeneratorManager';
import type Server from '../Server';
import * as Generators from './generators/Generators';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('world', () => {
    describe('GeneratorManager', () => {
        let generatorManager: GeneratorManager;
        let server: Server = vi.fn().mockImplementation(() => {
            return {
                getLogger: () => {
                    return {
                        debug: () => {},
                        verbose: () => {}
                    };
                },
                getBlockManager: () => {
                    return {
                        getBlock: () => {}
                    };
                }
            };
        })();

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
    });
});
