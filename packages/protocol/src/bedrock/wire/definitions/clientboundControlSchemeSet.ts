/**
 * `ClientboundControlSchemeSetPacket`: tells the client which control scheme to use, usually
 * alongside a custom camera. The vanilla `/controlscheme` command sends it.
 *
 * Protocol 2193 layout: `Control Scheme` as one byte holding a {@link ControlScheme} value, the
 * same enum a `CameraPreset` carries (0 `locked_player_relative_strafe` through
 * 4 `player_relative_strafe`).
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { ControlScheme } from '../../structure/CameraPreset';
import type { PayloadOf } from '../../../wire/define';

/** The fields of a `ClientboundControlSchemeSetPacket`, in wire order. */
export const clientboundControlSchemeSetPacket = definePacket('ClientboundControlSchemeSetPacket', {
    /** `Control Scheme`: the {@link ControlScheme} the client switches to, one byte. */
    controlScheme: t.enumOf<ControlScheme>(t.uint8)
});

/** The fields of a `ClientboundControlSchemeSetPacket`, in wire order. */
export type ClientboundControlSchemeSetPayload = PayloadOf<typeof clientboundControlSchemeSetPacket>;
