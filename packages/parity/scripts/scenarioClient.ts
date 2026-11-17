/**
 * The headless client a scripting scenario's capture joins the Bedrock Dedicated Server with:
 * it answers each form the server sends as the scenario's {@link FormClientScript} says, and
 * records the form packets it received.
 *
 * The capture runs under plain node, whose resolver rejects the extensionless relative imports of
 * a workspace package's TypeScript sources. This loads `@jsprismarine/client` and
 * `@jsprismarine/protocol` through `tsx`, the resolver the other capture halves start under
 * (`packages/bedrock-data/utils/bedrock-dump/host.ts`).
 */
import { join } from 'node:path';

import { tsImport } from 'tsx/esm/api';

import type { ClientObservation, ScenarioClient } from '../src/scripting/formClient.ts';
import { cancelByte, FormClientScript } from '../src/scripting/formClient.ts';

const PACKAGES = join(import.meta.dirname, '..', '..');

/** A joined scenario client. */
export interface JoinedScenarioClient {
    /** The form packets received so far. */
    readonly observations: () => readonly ClientObservation[];
    /** Leaves the server, when it has not left already. */
    readonly leave: () => void;
}

/** Where the scenario client dials the staged server. */
export interface ScenarioClientTarget {
    readonly port: number;
    readonly network: 'raknet' | 'nethernet';
    readonly protocolVersion: number;
}

/**
 * Joins the staged server and starts answering forms.
 * @throws {Error} When the login fails.
 */
export const joinScenarioClient = async (
    scenario: ScenarioClient,
    target: ScenarioClientTarget
): Promise<JoinedScenarioClient> => {
    // tsImport returns an untyped namespace; the client and protocol sources declare these exports.
    const { Client } = await tsImport(join(PACKAGES, 'client', 'src', 'index.ts'), import.meta.url);
    const protocol = await tsImport(join(PACKAGES, 'protocol', 'src', 'index.ts'), import.meta.url);
    const { ModalFormRequestPacket, ModalFormResponsePacket, PacketIdentifier } = protocol;

    const script = new FormClientScript(scenario);
    const client = new Client({
        host: '127.0.0.1',
        port: target.port,
        displayName: 'FormClient',
        loginTimeoutMs: 120_000,
        network: target.network,
        protocolVersion: target.protocolVersion
    });
    let left = false;
    const leave = (): void => {
        if (left) return;
        left = true;
        client.disconnect();
    };

    const session = client.getSession();
    session.on('raw', ({ id, buffer }: { id: number; buffer: Buffer }) => {
        if (id === PacketIdentifier.MODAL_FORM_REQUEST) {
            const request = new ModalFormRequestPacket(buffer);
            request.decode();
            const answer = script.formRequested(request.formId, request.formUiJson);
            if ('leave' in answer) {
                leave();
                return;
            }
            if ('ignore' in answer) return;
            const response = new ModalFormResponsePacket();
            response.formId = request.formId;
            if (answer.response !== undefined) response.jsonResponse = answer.response;
            if (answer.cancel !== undefined) response.formCancelReason = cancelByte(answer.cancel);
            void session.send(response);
        } else if (id === PacketIdentifier.CLIENTBOUND_CLOSE_FORM) {
            script.formsClosed();
        }
    });
    await client.connect();
    return { observations: () => script.observations, leave };
};
