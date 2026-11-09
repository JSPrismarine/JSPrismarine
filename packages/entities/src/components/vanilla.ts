/**
 * The entity components this package implements with behavior, as opposed to
 * the ones it parses and exposes for another system to read.
 *
 * Each theme lives in its own module; this one re-exports them under the
 * names the package has always published. `./shared` holds their common
 * parsing helpers and stays out of the public surface.
 */

export type { SensorTrigger } from './shared';
export * from './body';
export * from './combat';
export * from './hazards';
export * from './movement';
export * from './lifecycle';
export * from './interactions';
export * from './sensors';
export * from './effects';
