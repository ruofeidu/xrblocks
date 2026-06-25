import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import {
  AgentHands,
  parseAgentGestures,
} from 'xrblocks/addons/agenthands/index.js';
import * as xb from 'xrblocks';

// AgentHands demo: a free-standing pair of agent hands that gesture as the
// agent speaks.
//
// Without a Gemini key it plays a scripted monologue. Provide a key (?key=...)
// to talk to the agent: it replies with [gesture:...] markup, which is parsed
// into hand gestures played in sync with spoken (TTS) text.

const META_INSTRUCTION = `You are a friendly assistant with a visible pair of hands you gesture with. Reply in one or two short sentences. Embed gesture markup inline using [gesture:NAME] right before the word it emphasizes, where NAME is one of: point, thumbs_up, thumbs_down, fist, victory, rock, open. Use a gesture or two per reply. Do not mention the markup.`;

const SCRIPT = [
  'Hi there! [gesture:thumbs_up] great to see you.',
  'Look at that [gesture:point] over on the shelf.',
  'Two options [gesture:victory] to choose from.',
  'Got it [gesture:fist], let me handle that.',
];

class AgentHandsDemo extends xb.Script {
  constructor() {
    super();
    this.hands = new AgentHands();
    this.queue = [];
    this.timer = 0;
    this.busy = false;
  }

  async init() {
    xb.core.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(0.5, 1, 1);
    xb.core.scene.add(key);

    await this.hands.load();
    // Raised in front of the user, fingers up, palms toward them.
    this.hands.position.set(0, 1.25, -0.7);
    this.hands.rotation.set(Math.PI / 2, 0, 0);
    this.hands.left.root.position.set(-0.16, 0, 0);
    this.hands.right.root.position.set(0.16, 0, 0);
    xb.core.scene.add(this.hands);

    if (xb.core.ai?.model?.options?.apiKey) {
      this.startInteractive_();
    } else {
      this.setStatus_('no key, playing a scripted demo. add ?key= to talk.');
      this.playLine_(0);
    }
  }

  // ---- interactive (Gemini) mode ----

  startInteractive_() {
    const button = document.getElementById('talk');
    const recognizer = xb.core.sound?.speechRecognizer;
    if (button) {
      button.style.display = 'block';
      button.addEventListener('click', () => recognizer?.start());
    }
    recognizer?.addEventListener('result', (event) => {
      if (event.isFinal && event.transcript.trim()) {
        this.respond_(event.transcript.trim());
      }
    });
    this.setStatus_('press 🎙️ Talk and say something to the agent.');
  }

  async respond_(userText) {
    if (this.busy) return;
    this.busy = true;
    this.setStatus_(`you: "${userText}"  ·  thinking...`);
    try {
      const result = await xb.core.ai.query({
        prompt: `${META_INSTRUCTION}\n\nUser: ${userText}\nAssistant:`,
      });
      const reply = typeof result === 'string' ? result : (result?.text ?? '');
      const {text, gestures} = parseAgentGestures(reply);
      this.speakWithGestures_(text || "I'm not sure what to say.", gestures);
    } catch (error) {
      console.error('[agent_hands]', error);
      this.setStatus_('error talking to Gemini (see console).');
    } finally {
      this.busy = false;
    }
  }

  // Speaks `text` and schedules each gesture at its relative point in the line.
  speakWithGestures_(text, gestures) {
    this.setStatus_(`agent: "${text}"`);
    xb.core.sound?.speechSynthesizer?.speak(text);
    const duration = Math.max(1.2, text.length * 0.06);
    this.queue = [];
    for (const gesture of gestures) {
      const at = (gesture.index / Math.max(1, text.length)) * duration;
      this.queue.push({at, pose: gesture.pose});
    }
    this.queue.push({at: duration + 0.6, pose: xb.SimulatorHandPose.RELAXED});
    this.timer = 0;
  }

  // ---- scripted (no-key) mode ----

  playLine_(index) {
    const {text, gestures} = parseAgentGestures(SCRIPT[index % SCRIPT.length]);
    this.setStatus_(`agent: "${text}"`);
    this.queue = [];
    let t = 0.4;
    for (const gesture of gestures) {
      this.queue.push({at: t, pose: gesture.pose});
      t += 1.2;
    }
    this.queue.push({at: t + 0.4, pose: xb.SimulatorHandPose.RELAXED});
    this.queue.push({at: t + 2.2, next: (index + 1) % SCRIPT.length});
    this.timer = 0;
  }

  update() {
    const dt = xb.getDeltaTime?.() ?? 0.016;
    this.timer += dt;
    while (this.queue.length && this.timer >= this.queue[0].at) {
      const step = this.queue.shift();
      if (step.pose) this.hands.gesture(step.pose);
      if (step.next !== undefined) this.playLine_(step.next);
    }
    this.hands.update();
  }

  setStatus_(text) {
    const el = document.getElementById('status');
    if (el) el.textContent = text;
  }
}

function start() {
  const options = new xb.Options();
  options.enableAI();
  options.sound.speechSynthesizer.enabled = true;
  options.sound.speechRecognizer.enabled = true;
  options.setAppTitle('Agent Hands');
  options.setAppDescription(
    'A pair of agent hands that gesture as the agent speaks. Add ?key=... to ' +
      'talk to it.'
  );
  options.xrButton.showEnterSimulatorButton = true;
  xb.add(new AgentHandsDemo());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);
