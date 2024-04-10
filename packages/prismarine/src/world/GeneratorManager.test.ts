import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as Generators from './generators/Generators';
import GeneratorManager from './GeneratorManager';
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
            })
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
    });
});
