import type { DriverPeer, IceState, PeerState } from '../WebRtcDriver';

/** A peer whose states a test sets, with the listeners a trace installs. */
export const fakePeer = () => {
    const onState: ((state: PeerState) => void)[] = [];
    const onIce: ((state: IceState) => void)[] = [];
    let state: PeerState = 'connecting';
    let iceState: IceState = 'checking';
    const peer: DriverPeer = {
        get state() {
            return state;
        },
        get iceState() {
            return iceState;
        },
        setRemoteDescription: () => {},
        addRemoteCandidate: () => {},
        createDataChannel: () => {
            throw new Error('The fake peer opens no channel');
        },
        localDescription: async () => '',
        onDataChannel: () => {},
        onStateChange: (listener) => void onState.push(listener),
        onIceStateChange: (listener) => void onIce.push(listener),
        remoteAddress: () => ({ address: '198.51.100.7', port: 50_000 }),
        localAddress: () => ({ address: '203.0.113.9', port: 19_132 }),
        close: () => {}
    };
    return {
        peer,
        ice: (next: IceState) => {
            iceState = next;
            for (const listener of onIce) listener(next);
        },
        state: (next: PeerState) => {
            state = next;
            for (const listener of onState) listener(next);
        }
    };
};
