import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

import { controllerEnvironment } from './controllerEnvironment.mts';

describe('controllerEnvironment', () => {
    it('keeps the display a Linux client opens its window on', () => {
        const environment = controllerEnvironment({ DISPLAY: ':99', WAYLAND_DISPLAY: 'wayland-0', XAUTHORITY: '/x' });

        expect(environment).toMatchObject({ DISPLAY: ':99', WAYLAND_DISPLAY: 'wayland-0', XAUTHORITY: '/x' });
    });

    it('keeps the backtrace switch and wgpu adapter overrides', () => {
        const environment = controllerEnvironment({ RUST_BACKTRACE: '1', WGPU_BACKEND: 'vulkan' });

        expect(environment).toMatchObject({ RUST_BACKTRACE: '1', WGPU_BACKEND: 'vulkan' });
    });

    it('starts from the SDK default and adds nothing else from the caller', () => {
        const environment = controllerEnvironment({ CODECOV_TOKEN: 'secret', NODE_OPTIONS: '--inspect' });

        expect(environment).toEqual(getDefaultEnvironment());
    });
});
