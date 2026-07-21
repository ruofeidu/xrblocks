import {describe, expect, it} from 'vitest';

import {XR_BLOCKS_ASSETS_PATH} from '../constants';
import {loadSimulatorSceneManifest} from './scene/SimulatorEnvironmentManifest';
import {SimulatorOptions} from './SimulatorOptions';

describe('default simulator manifests', () => {
  it('embeds loadable default environments in the bundle', async () => {
    const environments = new SimulatorOptions().environments;

    expect(environments.map(({name}) => name)).toEqual([
      'Living Room',
      'Office',
      'Emulator Scene V5',
      'Emulator Scene Dark',
    ]);
    for (const environment of environments) {
      expect(environment.manifestPath).toMatch(/^data:application\/json,/);
      expect(environment.manifestPath).not.toContain('/src/');

      const manifest = await loadSimulatorSceneManifest(
        environment.manifestPath
      );
      expect(manifest.name).toBe(environment.name);
      expect(manifest.objects).toEqual([]);
      expect(
        manifest.scenePath?.startsWith(
          `${XR_BLOCKS_ASSETS_PATH}simulator/scenes/`
        )
      ).toBe(true);
    }
  });

  it('gives each options instance its own environment records', () => {
    const first = new SimulatorOptions();
    const second = new SimulatorOptions();

    first.environments[0].name = 'Changed';

    expect(second.environments[0].name).toBe('Living Room');
  });
});
