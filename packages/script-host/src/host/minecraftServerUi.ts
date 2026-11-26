/**
 * The behavior of `@minecraft/server-ui`'s three older form builders, `ActionFormData`,
 * `ModalFormData` and `MessageFormData`, their responses and `uiManager.closeAllForms`, in the
 * stable and beta shapes alike. The data-driven `CustomForm`, `MessageBox` and observables of
 * 2.1.0 and later live in {@link DataDrivenUi}
 * ([ADR 0022](../../../../docs/adr/0022-the-script-api-surface-is-generated.md)).
 *
 * Each builder call copies its arguments out of the engine and turns them into a fragment of form
 * JSON at once, as BDS converts them when the call is made, so a script that changes a
 * `RawMessage` afterwards does not change the form. `show()` writes the form, sends it and returns
 * a promise that the client's answer settles in a later script flush ({@link ScriptForms}).
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import type { BuiltForm, FormKind } from './forms';
import { buildForm, formChange } from './forms';
import type { PackForms } from './PackForms';
import { SERVER_UI } from './PackForms';
import { invalidEntity, PLAYER } from './serverObjects';

/** A `Player` argument, as the world knows the player it stands for. */
export interface FormPlayer {
    /** The player's entity id, as the world's players list it. */
    readonly id: string;
    /** Whether the player is still in the world. */
    readonly present: boolean;
}

/** What one pack's `@minecraft/server-ui` reaches of the runtime and the world. */
export interface FormHost {
    readonly forms: PackForms;
    /**
     * The player a `Player` argument stands for, by the entity its object carries, or undefined
     * for an object the host did not make.
     */
    player(value: ScriptValue): FormPlayer | undefined;
    /** Sends a form and returns the promise `show()` returns. */
    show(player: string, form: BuiltForm): ScriptValue;
    /** Closes every form a player has open. */
    closeAll(player: string): void;
    /** Closes every data-driven screen a player has open, which `closeAllForms` does too. */
    closeAllDataDriven?(player: string): void;
}

/** The builder members of each form kind, after its constructor and `show`. */
const BUILDERS = {
    ActionFormData: { kind: 'action', members: ['title', 'body', 'button', 'header', 'label', 'divider'] },
    ModalFormData: {
        kind: 'modal',
        members: ['title', 'textField', 'dropdown', 'slider', 'toggle', 'submitButton', 'header', 'label', 'divider']
    },
    MessageFormData: { kind: 'message', members: ['title', 'body', 'button1', 'button2'] }
} as const satisfies Record<string, { kind: FormKind; members: readonly string[] }>;

/**
 * Registers the behavior of one pack's `@minecraft/server-ui` on its implementations.
 * @param implementations - The pack's implementations, which `@minecraft/server`'s are on too.
 */
export const serverUiImplementations = (
    implementations: ScriptApiImplementations,
    host: FormHost
): ScriptApiImplementations => {
    const { forms } = host;
    const playerOf = (call: ScriptCall, member: string): FormPlayer => {
        const player = host.player(call.args[0]);
        if (player?.present === true) return player;
        throw invalidEntity('call', member, { id: player?.id ?? '', typeId: PLAYER });
    };

    for (const [className, { kind, members }] of Object.entries(BUILDERS)) {
        // The names come from the generated shape's own classes, which the table above lists.
        const owner = className as keyof typeof BUILDERS;
        implementations.implement(SERVER_UI, owner, 'constructor', () => undefined);
        implementations.implement(SERVER_UI, owner, 'show', (call) => {
            const player = playerOf(call, 'show');
            return host.show(player.id, buildForm(kind, forms.major, forms.read(call.self)));
        });
        for (const member of members) {
            // Each member is one of the class's own, by the table above.
            implementations.implement(SERVER_UI, owner, member as 'title', (call) => {
                const args = call.args.map((arg) => forms.plain(arg));
                forms.apply(call.self, formChange(kind, member, args, forms.major));
                return call.self;
            });
        }
    }

    return implementations
        .implement(SERVER_UI, 'FormResponse', 'canceled', { get: (call) => forms.field(call.self, 'canceled') })
        .implement(SERVER_UI, 'FormResponse', 'cancelationReason', {
            get: (call) => forms.field(call.self, 'cancelationReason')
        })
        .implement(SERVER_UI, 'ActionFormResponse', 'selection', { get: (call) => forms.field(call.self, 'selection') })
        .implement(SERVER_UI, 'MessageFormResponse', 'selection', {
            get: (call) => forms.field(call.self, 'selection')
        })
        .implement(SERVER_UI, 'ModalFormResponse', 'formValues', {
            get: (call) => forms.field(call.self, 'formValues')
        })
        .implement(SERVER_UI, 'UIManager', 'closeAllForms', (call) => {
            const player = host.player(call.args[0]);
            // BDS's own words for a player who left, from a plain Error rather than one of the API's.
            if (player?.present !== true) throw new ScriptHostErrors.InvalidPlayerHandle();
            host.closeAll(player.id);
            host.closeAllDataDriven?.(player.id);
            return undefined;
        });
};
