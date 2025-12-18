import { AmbientLight } from 'three';

import { XRBlocks } from '../../src/xrblocks.js';
import { BalloonPop } from './BalloonPop.js';

const setup = async () => {
  const xr = new XRBlocks({
    debug: true,
  });

  const ambientLight = new AmbientLight(0xffffff, 1.0);
  xr.scene.add(ambientLight);

  const balloonPop = new BalloonPop(xr, {});

  xr.start();
  xr.scene.add(balloonPop.balloonsGroup);
  xr.setAnimationLoop(() => {
    const delta = xr.clock.getDelta();
    balloonPop.update(delta);
  });
};
setup();
