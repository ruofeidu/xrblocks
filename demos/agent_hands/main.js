import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import {
  AgentHands,
  parseAgentGestures,
} from 'xrblocks/addons/agenthands/index.js';
import * as xb from 'xrblocks';

// AgentHands demo: a free-standing pair of agent hands that gesture as the
// agent "speaks". Here the speech is scripted with gesture markup so it runs
// without a key; the same parse -> gesture pipeline is driven by Gemini Live
// when a key is provided.

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
    this.lineIndex = 0;
    this.timer = 0;
    this.queue = [];
  }

  async init() {
    xb.core.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(0.5, 1, 1);
    xb.core.scene.add(key);

    await this.hands.load();
    // Place the pair in front of the user, raised to gesture height, palms
    // toward them. Tuned for the desktop simulator's starting view.
    this.hands.position.set(0, 1.25, -0.7);
    this.hands.rotation.set(Math.PI / 2, 0, 0);
    this.hands.left.root.position.set(-0.16, 0, 0);
    this.hands.right.root.position.set(0.16, 0, 0);
    xb.core.scene.add(this.hands);

    this.playLine_(0);
  }

  playLine_(index) {
    const line = SCRIPT[index % SCRIPT.length];
    const {text, gestures} = parseAgentGestures(line);
    this.setStatus_(text);
    // Schedule each gesture, then return to rest, then advance to the next line.
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
    if (el) el.textContent = `agent: "${text}"`;
  }
}

function start() {
  const options = new xb.Options();
  options.setAppTitle('Agent Hands');
  options.xrButton.showEnterSimulatorButton = true;
  xb.add(new AgentHandsDemo());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);
