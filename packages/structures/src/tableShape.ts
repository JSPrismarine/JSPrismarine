/**
 * The placement transform vocabulary, shared by the runtime and by the table
 * generator under `utils/`.
 */

/** A rotation about the template's vertical axis. */
export type Rotation = 'none' | 'clockwise_90' | 'clockwise_180' | 'counterclockwise_90';

/** A reflection of the template: `left_right` flips the z axis, `front_back` the x axis. */
export type Mirror = 'none' | 'left_right' | 'front_back';

/** The five transforms the state table stores, which is every one that moves a state. */
export const TRANSFORM_NAMES = [
    'clockwise_90',
    'clockwise_180',
    'counterclockwise_90',
    'left_right',
    'front_back'
] as const;

/** One of the transforms the state table stores. */
export type TransformName = (typeof TRANSFORM_NAMES)[number];
