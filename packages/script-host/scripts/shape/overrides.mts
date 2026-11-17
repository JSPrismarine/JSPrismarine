/**
 * Corrections for gaps in Mojang's script module metadata, applied by the shape generator.
 *
 * Each override names a gap: something the metadata leaves out that BDS or Mojang's documentation
 * shows. The generator applies it to every generated version that has the gap, and fails when no
 * version has the member any more, or when one records a value of its own, so an override goes
 * away once Mojang fills the gap.
 */
import type { Privilege } from '../../src/shape/format.ts';

/** A callback argument whose closure type carries no `call_privilege`, and the one BDS runs it under. */
export interface CallbackPrivilegeOverride {
    readonly kind: 'callback-privilege';
    /** A stable id, which the generated entry records as `override`. */
    readonly id: string;
    readonly module: string;
    readonly declaration: string;
    readonly member: string;
    readonly argument: string;
    readonly privilege: readonly Privilege[];
    /** Where the value comes from. */
    readonly evidence: string;
}

/** One correction. More kinds join the union as the metadata shows other gaps. */
export type ShapeOverride = CallbackPrivilegeOverride;

/** The corrections the generator applies. */
export const SHAPE_OVERRIDES: readonly ShapeOverride[] = [
    {
        kind: 'callback-privilege',
        id: 'custom-command-callback-restricted',
        module: '@minecraft/server',
        declaration: 'CustomCommandRegistry',
        member: 'registerCommand',
        argument: 'callback',
        privilege: ['restricted_execution'],
        evidence:
            'docs/research/bedrock-script-api.md section 3: the callback has no call_privilege, and ' +
            "Microsoft's execution-privilege.md says custom command callbacks run in restricted execution"
    }
];
