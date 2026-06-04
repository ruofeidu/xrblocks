import {describe, it, expect, vi} from 'vitest';

import {VoiceChat} from './VoiceChat';

describe('VoiceChat subscriptions', () => {
  it('onTrack supports multiple listeners; unsubscribe removes only that listener', () => {
    const vc = new VoiceChat(() => {});
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = vc.onTrack(a);
    vc.onTrack(b);

    // Synthesise a dispatch via the internal Set. Avoids spinning up a
    // full RTCPeerConnection just to verify subscription semantics.
    const inner = vc as unknown as {
      _onTrack: Set<(peerId: string, stream: MediaStream) => void>;
    };
    const fakeStream = {} as MediaStream;
    for (const h of inner._onTrack) h('p1', fakeStream);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubA();
    for (const h of inner._onTrack) h('p2', fakeStream);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('onTrackRemoved supports multiple listeners with idempotent unsubscribe', () => {
    const vc = new VoiceChat(() => {});
    const a = vi.fn();
    const unsub = vc.onTrackRemoved(a);
    const inner = vc as unknown as {
      _onTrackRemoved: Set<(peerId: string) => void>;
    };
    for (const h of inner._onTrackRemoved) h('p1');
    expect(a).toHaveBeenCalledTimes(1);

    unsub();
    unsub(); // idempotent
    for (const h of inner._onTrackRemoved) h('p2');
    expect(a).toHaveBeenCalledTimes(1);
  });
});
