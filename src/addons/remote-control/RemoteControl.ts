import * as THREE from 'three';
import {
  Core,
  Handedness,
  Input,
  Options,
  Script,
  Simulator,
  SimulatorMode,
} from 'xrblocks';
import {
  EmbodiedControl,
  type EmbodiedControlOptions,
} from '../embodied-control';

import {createRemoteControlBuiltInTools} from './RemoteControlBuiltInTools';
import {RemoteControlObserver} from './RemoteControlObserver';
import {
  type RemoteControlCallToolRequest,
  type RemoteControlRequest,
  type RemoteControlResponse,
  type RemoteControlToolHandler,
  type RemoteControlToolMetadata,
} from './RemoteControlProtocol';
import {
  WebSocketRemoteControlTransport,
  type WebSocketRemoteControlTransportOptions,
} from './WebSocketRemoteControlTransport';

export type RemoteControlOptions = WebSocketRemoteControlTransportOptions & {
  embodiedControl?: EmbodiedControl;
  embodiedOptions?: EmbodiedControlOptions;
  autoConfigureSimulator?: boolean;
  tools?: Record<string, RemoteControlToolHandler>;
};

type RegisteredTool = {
  handler: RemoteControlToolHandler;
  metadata?: RemoteControlToolMetadata;
};

export class RemoteControl extends Script {
  static dependencies = {
    core: Core,
    simulator: Simulator,
    input: Input,
    camera: THREE.Camera,
  };

  editorIcon = 'settings_remote';
  embodiedControl: EmbodiedControl;
  observer?: RemoteControlObserver;
  transport?: WebSocketRemoteControlTransport;

  dependencies!: {
    core: Core;
    simulator: Simulator;
    input: Input;
    camera: THREE.Camera;
  };

  private tools = new Map<string, RegisteredTool>();

  constructor(private options: RemoteControlOptions = {}) {
    super();
    this.embodiedControl =
      options.embodiedControl ?? new EmbodiedControl(options.embodiedOptions);

    for (const [name, handler] of Object.entries(options.tools ?? {})) {
      this.registerTool(name, handler);
    }
  }

  override setupOptions(options: Options) {
    if (this.options.autoConfigureSimulator === false) return;

    options.formFactor = 'desktop';
    options.xrButton.enabled = false;
    options.xrButton.alwaysAutostartSimulator = true;
    options.enableHands();
    options.enableCamera();
    options.simulator.defaultMode = SimulatorMode.POSE;
    options.simulator.defaultHand = Handedness.RIGHT;
    options.simulator.simulatorSettingsPanel.enabled = false;
    options.simulator.instructions.enabled = false;
    options.simulator.handPosePanel.enabled = false;
  }

  init(dependencies: {
    core: Core;
    simulator: Simulator;
    input: Input;
    camera: THREE.Camera;
  }) {
    this.dependencies = dependencies;
    if (!this.embodiedControl.executor) {
      this.embodiedControl.init(dependencies);
    }

    this.observer = new RemoteControlObserver(dependencies);
    this.registerBuiltInTools();
    this.transport = new WebSocketRemoteControlTransport(
      {
        url: this.options.url,
        reconnect: this.options.reconnect,
        reconnectDelayMs: this.options.reconnectDelayMs,
      },
      (request) => this.handleRequest(request)
    );
    this.transport.connect();
  }

  dispose() {
    this.transport?.disconnect();
  }

  override onSimulatorStarted() {
    if (
      !this.dependencies.core.scriptsManager.scripts.has(this.embodiedControl)
    ) {
      this.embodiedControl.onSimulatorStarted();
    }
    this.transport?.announceSimulatorReady();
  }

  registerTool(
    name: string,
    handler: RemoteControlToolHandler,
    metadata?: RemoteControlToolMetadata
  ) {
    if (!name) {
      throw new Error('RemoteControl tool names must be non-empty.');
    }
    this.tools.set(name, {handler, metadata});
  }

  unregisterTool(name: string) {
    this.tools.delete(name);
  }

  listTools() {
    return [...this.tools.entries()].map(([name, tool]) => ({
      name,
      metadata: tool.metadata,
    }));
  }

  async handleRequest(
    request: RemoteControlRequest
  ): Promise<RemoteControlResponse> {
    try {
      const result = await this.executeRequest(request);
      return {
        type: 'response',
        id: request.id,
        ok: true,
        result,
      };
    } catch (error) {
      const code =
        error instanceof Error && error.name === 'EmbodiedControlBusyError'
          ? 'active_step'
          : 'execution_error';
      return {
        type: 'response',
        id: request.id,
        ok: false,
        error: {
          code,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async executeRequest(
    request: RemoteControlRequest
  ): Promise<unknown> {
    switch (request.type) {
      case 'ping':
        return {pong: true};
      case 'step':
        await this.embodiedControl.step(request.step);
        return {completed: true};
      case 'apply':
        this.embodiedControl.applyControl(request.control);
        return {completed: true};
      case 'callTool':
        return this.callTool(request);
      case 'teleportTo': {
        const target = this.resolveTarget(request.target);
        await this.embodiedControl.teleportTo(target, request.options);
        return {completed: true};
      }
      case 'lookAtTarget': {
        const target = this.resolveTarget(request.target);
        await this.embodiedControl.lookAtTarget(target, request.options);
        return {completed: true};
      }
      case 'pointTo': {
        const target = this.resolveTarget(request.target);
        await this.embodiedControl.pointTo(
          request.handIndex,
          target,
          request.options
        );
        return {completed: true};
      }
      case 'reachTo': {
        const target = this.resolveTarget(request.target);
        await this.embodiedControl.reachTo(
          request.handIndex,
          target,
          request.options
        );
        return {completed: true};
      }
      case 'click':
        await this.embodiedControl.click(request.handIndex, request.options);
        return {completed: true};
    }
  }

  private async callTool(request: RemoteControlCallToolRequest) {
    const tool = this.tools.get(request.name);
    if (!tool) {
      throw new Error(`RemoteControl tool not found: ${request.name}`);
    }
    return tool.handler(request.args, {request});
  }

  private registerBuiltInTools() {
    if (!this.observer) return;
    for (const tool of createRemoteControlBuiltInTools(this.observer)) {
      this.registerBuiltInTool(tool.name, tool.handler, tool.metadata);
    }
  }

  private registerBuiltInTool(
    name: string,
    handler: RemoteControlToolHandler,
    metadata?: RemoteControlToolMetadata
  ) {
    if (this.tools.has(name)) return;
    this.tools.set(name, {handler, metadata});
  }

  private resolveTarget(
    target: [number, number, number] | string
  ): THREE.Vector3 | THREE.Object3D {
    if (typeof target === 'string') {
      const obj = this.dependencies.core.scene.getObjectByName(target);
      if (!obj) {
        throw new Error(`Object target not found in scene: ${target}`);
      }
      return obj;
    }
    return new THREE.Vector3().fromArray(target);
  }
}
