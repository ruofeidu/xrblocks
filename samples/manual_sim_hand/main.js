// Provides optional 2D UIs for simulator on desktop.
import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';
import * as THREE from 'three';

const AXES = [
  {axis: 'x', label: 'X', description: 'Flexion/extension'},
  {axis: 'y', label: 'Y', description: 'Abduction/adduction'},
  {axis: 'z', label: 'Z', description: 'Twist'},
];

function formatJointName(jointName) {
  return jointName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function createSlider(jointName, axisConfig) {
  const row = document.createElement('label');
  row.className = 'manual-sim-hand-slider';

  const axis = document.createElement('span');
  axis.className = 'manual-sim-hand-axis';
  axis.textContent = axisConfig.label;
  axis.title = axisConfig.description;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = '-180';
  input.max = '180';
  input.step = '1';
  input.value = '0';
  input.dataset.handedness = 'left';
  input.dataset.joint = jointName;
  input.dataset.axis = axisConfig.axis;

  const value = document.createElement('output');
  value.className = 'manual-sim-hand-value';
  value.value = '0';
  value.textContent = '0 deg';

  input.addEventListener('input', () => {
    value.value = input.value;
    value.textContent = `${input.value} deg`;
  });

  row.append(axis, input, value);
  return row;
}

function createJointControl(jointName) {
  const section = document.createElement('section');
  section.className = 'manual-sim-hand-joint';

  const title = document.createElement('h2');
  title.textContent = formatJointName(jointName);
  section.append(title);

  for (const axisConfig of AXES) {
    section.append(createSlider(jointName, axisConfig));
  }

  return section;
}

function createSidebar() {
  const sidebar = document.createElement('aside');
  sidebar.className = 'manual-sim-hand-sidebar';

  const header = document.createElement('header');
  header.className = 'manual-sim-hand-header';

  const title = document.createElement('h1');
  title.textContent = 'Manual Sim Hand';

  const subtitle = document.createElement('p');
  subtitle.textContent = 'Left hand joint angles';

  header.append(title, subtitle);
  sidebar.append(header);

  const controls = document.createElement('div');
  controls.className = 'manual-sim-hand-controls';

  const bendableJointNames = xb.HAND_JOINT_NAMES.filter(
    (jointName) => !jointName.endsWith('-tip')
  );

  for (const jointName of bendableJointNames) {
    controls.append(createJointControl(jointName));
  }

  sidebar.append(controls);
  document.body.append(sidebar);
}

class ManualSimHandScene extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xaaaaaa, 0x666666, 3));
  }
}

async function start() {
  createSidebar();
  const options = new xb.Options();
  options.enableReticles();
  options.enableHands();
  options.setAppTitle('Manual Simulator Hand');
  options.hands.enabled = true;
  options.hands.visualization = true;
  options.hands.visualizeJoints = true;
  options.hands.visualizeMeshes = true;
  options.simulator.defaultMode = xb.SimulatorMode.POSE;

  xb.add(new ManualSimHandScene());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);
