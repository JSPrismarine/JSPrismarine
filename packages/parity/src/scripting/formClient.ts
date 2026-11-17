/**
 * The client of a scripting scenario that shows forms: what it answers each form the server
 * sends, and what it records of the form packets it receives.
 *
 * On the pinned Bedrock Dedicated Server the capture drives a headless client that joins over the
 * network. On JSPrismarine the scenario runner stands in for the client at the world seam. Both
 * follow the same {@link FormClientScript}, so the two records line up form for form.
 *
 * This module imports nothing beyond node and relative paths, so the capture script runs it
 * under plain node.
 */
import { isRecord } from '../isRecord.ts';

/**
 * What the client does with one form: send a response, leave the form open, or leave the server.
 * A response carries JSON text, a cancel reason, both or neither, as a client could send them;
 * a reason is a name or the raw byte.
 */
export type FormAnswer =
    | { readonly response?: string; readonly cancel?: FormCancelReason | number }
    | { readonly ignore: true }
    | { readonly leave: true };

/** Why a client dismissed a form, as `ModalFormResponsePacket` names it. */
export type FormCancelReason = 'UserClosed' | 'UserBusy';

/** The wire value of each cancel reason. */
export const FORM_CANCEL_REASONS: Readonly<Record<FormCancelReason, number>> = { UserClosed: 0, UserBusy: 1 };

/** The byte a response's cancel reason travels as. */
export const cancelByte = (reason: FormCancelReason | number): number =>
    typeof reason === 'number' ? reason : FORM_CANCEL_REASONS[reason];

/** A scenario's client: the answer to each form it receives, in the order it receives them. */
export interface ScenarioClient {
    readonly answers: readonly FormAnswer[];
}

/** A form packet the client received, in the order it received them. */
export type ClientObservation =
    | {
          readonly packet: 'ModalFormRequest';
          /** The form id. Scripts never see it, so a record compares only whether ids repeat. */
          readonly formId: number;
          /** The Form UI JSON exactly as it came, which the server must reproduce byte for byte. */
          readonly json: string;
      }
    | { readonly packet: 'ClientboundCloseForm' };

/** Whether a parsed value is a {@link ClientObservation}. */
export const isClientObservation = (value: unknown): value is ClientObservation =>
    isRecord(value) &&
    ((value.packet === 'ModalFormRequest' &&
        Number.isInteger(value.formId) &&
        typeof value.json === 'string' &&
        Object.keys(value).length === 3) ||
        (value.packet === 'ClientboundCloseForm' && Object.keys(value).length === 1));

/** Plays one scenario's client: records each form packet and picks the answer to each form. */
export class FormClientScript {
    private readonly answers: readonly FormAnswer[];
    private readonly received: ClientObservation[] = [];
    private forms = 0;

    public constructor(client: ScenarioClient) {
        this.answers = client.answers;
    }

    /** What the client received so far. */
    public get observations(): readonly ClientObservation[] {
        return this.received;
    }

    /**
     * Records a form request and returns what to do with it: the next of the scenario's answers,
     * or leave it open once they run out.
     */
    public formRequested(formId: number, json: string): FormAnswer {
        this.received.push({ packet: 'ModalFormRequest', formId, json });
        return this.answers[this.forms++] ?? { ignore: true };
    }

    /** Records the server closing every form the client has open. */
    public formsClosed(): void {
        this.received.push({ packet: 'ClientboundCloseForm' });
    }
}

/**
 * The client records with each form id replaced by the order it first appeared in, from 0. The
 * ids are the server's own choice and no script sees them, so two servers agree when the same
 * forms share an id.
 */
export const normalizeFormIds = (observations: readonly ClientObservation[]): ClientObservation[] => {
    const order = new Map<number, number>();
    return observations.map((observation) => {
        if (observation.packet !== 'ModalFormRequest') return observation;
        const known = order.get(observation.formId);
        const formId = known ?? order.size;
        if (known === undefined) order.set(observation.formId, formId);
        return { ...observation, formId };
    });
};
