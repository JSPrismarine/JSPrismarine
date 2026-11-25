import { Vector3 } from '@jsprismarine/math';

import type { InputContext } from '../../player/context/HandlerContext';
import { applyClientMovement } from '../../player/clientMovement';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/** The client said where its player is: a Bedrock client's input and a Java client's move packets. */
export default class MoveHandler implements IntentHandler<'move'> {
    public static readonly Kind = 'move';

    /** Takes the client's word for where the player is, through the `playerMove` event. */
    public handle({ position, ...pose }: Intent<'move'>, context: InputContext): undefined {
        return applyClientMovement(context, { ...pose, position: Vector3.fromObject(position) });
    }
}
