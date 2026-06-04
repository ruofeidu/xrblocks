import * as THREE from 'three';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import type {UserEventDetail} from 'netblocks';
import {BroadcastChannelTransport} from 'netblocks';

import {LipsyncMouth, StylizedMouth} from 'lipsync';

import {NetSample} from '../../../netblocks/samples/Sample';

/**
 * NetblocksLipsyncSample.
 *
 * Multiplayer demo: every remote peer's voice stream drives a stylised
 * mouth attached to their avatar's head. Opens this page in two browser
 * tabs and the avatars visibly speak with each other's voices.
 *
 * Uses `BroadcastChannelTransport` for zero-broker two-tab demos. Click
 * the room-code "Start new room" button in the top-left to switch to
 * the WebRTC transport for cross-machine multiplayer.
 *
 * One shared `AudioContext` is reused across all peer mouths so the
 * browser doesn't run out of context slots when more than a handful of
 * peers join.
 */
class NetblocksLipsyncSample extends NetSample {
  private sharedCtx = THREE.AudioContext.getContext() as AudioContext;
  // Per-peer face. Either a plain StylizedMouth (eyes + closed mouth)
  // when the peer has no active voice track, or a LipsyncMouth driving
  // the same look from audio when they do. Swapping between them on
  // voice-track add/remove keeps every visible peer showing a face.
  private faces = new Map<string, StylizedMouth | LipsyncMouth>();
  private domBtn?: HTMLButtonElement;
  private spatialBtn?: xb.TextButton;
  private spatialStatus?: xb.TextView;
  private voiceOn = false;

  protected override getJoinOptions() {
    return {
      roomId: 'lipsync-netblocks',
      options: {
        transport: new BroadcastChannelTransport(),
        displayName: `User-${Math.floor(Math.random() * 1000)}`,
      },
    };
  }

  protected override onSession(session: NonNullable<this['net']['session']>) {
    // Give every peer a face from the moment they join. Voice may
    // arrive later (or never, if they don't enable mic), but the eyes
    // and a closed mouth are visible immediately so a peer never looks
    // like a featureless sphere.
    const attachStatic = (peerId: string) => {
      const user = session.users.get(peerId);
      if (!user) return;
      this.detachFace(peerId);
      // Eyes-only when the peer has no voice track: the absence of a
      // mouth is the affordance for "you can't hear them".
      const face = new StylizedMouth();
      user.avatar.headPivot.add(face);
      this.faces.set(peerId, face);
    };
    session.addEventListener('user-join', (e) => {
      attachStatic((e as CustomEvent<UserEventDetail>).detail.user.peerId);
    });
    session.addEventListener('user-leave', (e) => {
      this.detachFace((e as CustomEvent<UserEventDetail>).detail.user.peerId);
    });
    // Peers already in the room when our session opens.
    for (const peerId of session.users.keys()) attachStatic(peerId);

    // When a peer's voice MediaStream arrives, swap their static face
    // for a LipsyncMouth that animates from the audio. Reuses the
    // shared AudioContext so N peers don't exhaust the browser's
    // per-page context quota. `voice.onTrack` is additive, so this
    // runs alongside NetSession's own SpatialVoice attach.
    session.voice.onTrack((peerId, stream) => {
      const user = session.users.get(peerId);
      if (!user) return;
      this.detachFace(peerId);
      const mouth = new LipsyncMouth(stream, {audioContext: this.sharedCtx});
      user.avatar.headPivot.add(mouth);
      this.faces.set(peerId, mouth);
    });
    session.voice.onTrackRemoved((peerId) => {
      // Voice ended but peer is still here; fall back to the static face.
      attachStatic(peerId);
    });

    // Track local voice state from the authoritative NetSession event
    // rather than an optimistic flag, so a fast double-tap or a failed
    // enable() can't drift the UI.
    session.addEventListener('local-voice-state', (e) => {
      const on = (e as CustomEvent<{on: boolean}>).detail.on;
      this.voiceOn = on;
      const label = on ? '🔇 Disable voice' : '🎙️ Enable voice';
      if (this.domBtn) this.domBtn.textContent = label;
      this.spatialBtn?.setText(label);
      this.spatialStatus?.setText(
        on ? 'voice: on. other tabs will see your mouth' : 'voice: off'
      );
    });

    this.buildDomButton(session);
    this.buildSpatialPanel(session);
  }

  private detachFace(peerId: string) {
    const f = this.faces.get(peerId);
    if (!f) return;
    f.parent?.remove(f);
    // LipsyncMouth's dispose runs via ScriptsManager on scene removal;
    // a standalone StylizedMouth needs explicit disposal of its texture
    // and geometry.
    if (f instanceof StylizedMouth) f.dispose();
    this.faces.delete(peerId);
  }

  private buildDomButton(session: NonNullable<this['net']['session']>) {
    const btn = document.createElement('button');
    btn.textContent = '🎙️ Enable voice';
    Object.assign(btn.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      padding: '10px 18px',
      background: '#9177c7',
      color: '#fff',
      border: 'none',
      borderRadius: '24px',
      fontSize: '14px',
      cursor: 'pointer',
      zIndex: '999',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(btn);
    btn.addEventListener('click', () => this.toggleVoice(session));
    this.domBtn = btn;
  }

  private buildSpatialPanel(session: NonNullable<this['net']['session']>) {
    const panel = new xb.SpatialPanel({
      width: 1.0,
      height: 0.5,
      backgroundColor: '#1a1a2add',
    });
    const grid = panel.addGrid();
    grid.addRow({weight: 0.25}).addText({
      text: '🎙️ Lipsync · netblocks',
      fontSize: 0.06,
      fontColor: '#bfa9ff',
      textAlign: 'center',
    });
    this.spatialStatus = grid.addRow({weight: 0.25}).addText({
      text: 'voice: off',
      fontSize: 0.05,
      fontColor: '#7ac0ff',
      textAlign: 'center',
    });
    this.spatialBtn = grid.addRow({weight: 0.5}).addTextButton({
      text: '🎙️ Enable voice',
      fontColor: '#ffffff',
      backgroundColor: '#9177c7',
      fontSize: 0.18,
    });
    this.spatialBtn.onTriggered = () => this.toggleVoice(session);
    panel.position.set(-1.0, 1.5, -1.4);
    panel.rotation.y = Math.PI / 8;
    this.add(panel);
  }

  private async toggleVoice(
    session: NonNullable<this['net']['session']>
  ): Promise<void> {
    if (session.voice.isEnabled()) {
      session.voice.disable();
    } else {
      try {
        await session.voice.enable(session.transport.remotePeerIds);
      } catch (err) {
        const msg = (err as Error).message;
        this.spatialStatus?.setText(`voice error: ${msg}`);
      }
    }
  }
}

NetSample.run(NetblocksLipsyncSample);
