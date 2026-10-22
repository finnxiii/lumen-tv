/**
 * Rendering tests require a native Vega environment (native modules not
 * available in Jest). Full UI is verified on the Virtual Device.
 * This suite tests pure-JS logic that runs everywhere.
 */

import reelData from '../src/data/reel.json';
import {MockSessionClient} from '../src/session/MockSessionClient';

describe('reel.json', () => {
  it('has 10 segments in the correct order', () => {
    expect(reelData.order).toHaveLength(10);
    expect(reelData.order[0]).toMatchObject({clip: 'night', variant: 'original', start: 0});
    expect(reelData.order[9]).toMatchObject({clip: 'day', variant: 'sports', start: 405});
  });

  it('segment starts are contiguous multiples of segmentSeconds', () => {
    reelData.order.forEach((seg, i) => {
      expect(seg.start).toBe(i * reelData.segmentSeconds);
    });
  });
});

describe('MockSessionClient', () => {
  it('generates a 4-char code with allowed characters', () => {
    const c = new MockSessionClient();
    expect(c.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });

  it('emits session:state on connect', () => {
    const c = new MockSessionClient();
    const states: unknown[] = [];
    c.on('session:state', s => states.push(s));
    c.connect();
    c.disconnect();
    expect(states.length).toBeGreaterThanOrEqual(1);
  });

  it('emits settings:apply immediately on sendModeUpdate', () => {
    const c = new MockSessionClient();
    const applies: unknown[] = [];
    c.on('settings:apply', p => applies.push(p));
    c.connect();
    c.sendModeUpdate('cinema', 'tv');
    c.disconnect();
    expect(applies).toHaveLength(1);
    expect(applies[0]).toMatchObject({mode: 'cinema', source: 'tv'});
  });
});
