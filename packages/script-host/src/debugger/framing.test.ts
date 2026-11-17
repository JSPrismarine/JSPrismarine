import { describe, expect, it } from 'vitest';

import { DebuggerFramingError, FrameDecoder, encodeFrame } from './framing';

/**
 * Frames as the extension writes them. `Session.sendDebuggeeMessage` in `src/session.ts` of
 * `Mojang/minecraft-debugger` v1.61.0 sends `JSON.stringify(envelope)`, prefixed with the byte
 * length of the JSON plus one as 8 zero-padded hexadecimal digits and a newline, and followed by
 * a newline. These are the bytes that code produces for messages it sends during an attach, from
 * running its body on each message.
 */
const extensionFrames = [
    {
        message: { type: 'protocol', version: 11, target_module_uuid: '4f2b6b3a-0000-4000-8000-000000000001' },
        bytes: '0000005d\n{"type":"protocol","version":11,"target_module_uuid":"4f2b6b3a-0000-4000-8000-000000000001"}\n'
    },
    {
        message: { type: 'stopOnException', stopOnException: false },
        bytes: '00000033\n{"type":"stopOnException","stopOnException":false}\n'
    },
    { message: { type: 'resume' }, bytes: '00000012\n{"type":"resume"}\n' },
    {
        message: { type: 'request', request: { request_seq: 7, command: 'next', args: { threadId: 1 } } },
        bytes: '00000056\n{"type":"request","request":{"request_seq":7,"command":"next","args":{"threadId":1}}}\n'
    }
];

/**
 * A frame as koush's `quickjs-debugger.c` writes one (`js_transport_write_message_newline`):
 * `%08x\n` with the length of the JSON plus one, the JSON from `JS_JSONStringify`, then `\n`.
 */
const runtimeFrame = {
    message: { type: 'event', event: { type: 'StoppedEvent', reason: 'breakpoint', thread: 1 } },
    bytes: '00000052\n{"type":"event","event":{"type":"StoppedEvent","reason":"breakpoint","thread":1}}\n'
};

describe('debugger framing', () => {
    it('writes the bytes the extension and koush’s runtime write', () => {
        for (const { message, bytes } of [...extensionFrames, runtimeFrame]) {
            expect(encodeFrame(message).toString('utf8')).toBe(bytes);
        }
    });

    it('reads the extension’s frames back, whatever the chunk boundaries', () => {
        const stream = Buffer.from(extensionFrames.map(({ bytes }) => bytes).join(''), 'utf8');
        const expected = extensionFrames.map(({ message }) => message);

        expect(new FrameDecoder().push(stream)).toEqual(expected);

        const decoder = new FrameDecoder();
        const byteByByte = [...stream].flatMap((byte) => decoder.push(Uint8Array.of(byte)));
        expect(byteByByte).toEqual(expected);
    });

    it('counts the length in bytes, so text beyond ASCII round-trips', () => {
        const message = { type: 'event', event: { type: 'PrintEvent', message: 'héllo ✓', logLevel: 1 } };
        const frame = encodeFrame(message);

        expect(Number.parseInt(frame.toString('ascii', 0, 8), 16)).toBe(Buffer.byteLength(JSON.stringify(message)) + 1);
        expect(new FrameDecoder().push(frame)).toEqual([message]);
    });

    it('refuses a header that is not 8 hexadecimal digits and a newline, and a body that is not JSON', () => {
        expect(() => new FrameDecoder().push(Buffer.from('0000012\n{}\n'))).toThrow(DebuggerFramingError);
        expect(() => new FrameDecoder().push(Buffer.from('00000003\n{x\n'))).toThrow(DebuggerFramingError);
    });
});
