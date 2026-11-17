import type { ScriptEngine } from '../ScriptEngine';
import type { BuiltForm } from './forms';
import { readFormResponse } from './forms';
import type { FormDeferred, PackForms } from './PackForms';
import type { ScriptFormChannel, ScriptFormResponse } from './world';

/** A form a player has been sent and not answered, with the pack whose script showed it. */
interface OpenForm<Owner> {
    readonly id: number;
    readonly player: string;
    readonly owner: Owner;
    readonly forms: PackForms;
    readonly form: BuiltForm;
    readonly deferred: FormDeferred;
}

/**
 * Settles a form's promise for its pack: runs `settle` with the pack's context current, so the
 * promise jobs it queues are the pack's, and reports what it throws as the runtime reports any
 * error of the pack's.
 */
export type SettleInPack<Owner> = (owner: Owner, settle: () => void) => void;

/**
 * The forms every pack of one runtime has open, and what settles them. A client's answer enters as
 * an input ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)) and
 * settles its form in the next script flush, as does a player who left. What settles a form, and
 * with what, is the pinned Bedrock Dedicated Server's (`readFormResponse`):
 *
 * - an answer for a form id the player has not been sent, or was sent and already answered, is
 *   dropped, as is one with neither JSON nor a cancel reason, which leaves its form open;
 * - a player who left rejects each of their open forms with `PlayerQuit`, the newest first;
 * - `uiManager.closeAllForms` closes the player's forms and settles none of them.
 *
 * @typeParam Owner - What the runtime knows a pack by.
 */
export class ScriptForms<Owner> {
    private readonly engineOf: () => ScriptEngine;
    private open: OpenForm<Owner>[] = [];
    /** Form ids count from 1 for the runtime's life, as BDS's do, and a reload keeps counting. */
    private nextId = 1;

    /** @param engine - The runtime's engine now, which a reload replaces. */
    public constructor(engine: () => ScriptEngine) {
        this.engineOf = engine;
    }

    private get engine(): ScriptEngine {
        return this.engineOf();
    }

    /** The forms waiting for an answer, for tests that count them. */
    public get openCount(): number {
        return this.open.length;
    }

    /**
     * Sends a player a form and returns the promise `show()` returns, which the pack's forms free
     * once the call is over.
     */
    public show(
        channel: ScriptFormChannel | undefined,
        owner: Owner,
        forms: PackForms,
        player: string,
        form: BuiltForm
    ): FormDeferred['promise'] {
        const deferred = forms.deferred();
        const id = this.nextId++;
        this.open.push({ id, player, owner, forms, form, deferred });
        channel?.show(player, id, form.json);
        return forms.returning(deferred.promise);
    }

    /**
     * Settles what the input step admitted: each answer, then each form of a player no longer in
     * the world.
     * @param players - The ids of the players in the world now.
     */
    public update(
        responses: readonly ScriptFormResponse[],
        players: readonly string[],
        settle: SettleInPack<Owner>
    ): void {
        for (const response of responses) {
            const at = this.open.findIndex((each) => each.id === response.formId && each.player === response.player);
            const open = this.open[at];
            if (open === undefined) continue;
            const outcome = readFormResponse(open.form, response.response, response.cancelReason);
            if (outcome.settle === 'none') continue;
            this.open.splice(at, 1);
            settle(open.owner, () => {
                if (outcome.settle === 'malformed') this.reject(open, 'MalformedResponse');
                else this.resolve(open, open.forms.response(open.form.kind, outcome));
            });
            this.release(open);
        }
        const present = new Set(players);
        const gone = this.open.filter((each) => !present.has(each.player)).reverse();
        this.open = this.open.filter((each) => present.has(each.player));
        for (const open of gone) {
            settle(open.owner, () => this.reject(open, 'PlayerQuit'));
            this.release(open);
        }
    }

    /** Forgets every open form without settling it, as a reload or a shutdown does, and frees its handles. */
    public clear(): void {
        for (const open of this.open.splice(0)) this.release(open);
    }

    private resolve(open: OpenForm<Owner>, response: ReturnType<PackForms['response']>): void {
        try {
            this.engine.call(open.deferred.resolve, undefined, response);
        } finally {
            this.engine.free(response);
        }
    }

    private reject(open: OpenForm<Owner>, reason: 'MalformedResponse' | 'PlayerQuit'): void {
        const error = open.forms.rejection(reason);
        try {
            this.engine.call(open.deferred.reject, undefined, error);
        } finally {
            this.engine.free(error);
        }
    }

    private release(open: OpenForm<Owner>): void {
        this.engine.free(open.deferred.resolve);
        this.engine.free(open.deferred.reject);
    }
}
