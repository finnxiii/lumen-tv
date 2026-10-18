import 'react-native';
import {render} from '@testing-library/react-native';
import * as React from 'react';

// Stage 2: w3cmedia registers a TurboModule at import time which isn't available in Jest.
jest.mock('@amazon-devices/react-native-w3cmedia', () => ({}));

import {App} from '../src/App';

// Stage 2: App now renders PlaybackSpike which requires native media modules.
// These tests are skipped until the home screen is restored in Stage 4.
describe.skip('App', () => {
  it('matches snapshot', () => {
    const screen = render(<App />);
    expect(screen).toMatchSnapshot();
  });

  it('renders all tiles', () => {
    const screen = render(<App />);
    expect(screen.getByTestId('tile-home')).toBeTruthy();
    expect(screen.getByTestId('tile-get-started')).toBeTruthy();
    expect(screen.getByTestId('tile-debug')).toBeTruthy();
    expect(screen.getByTestId('tile-learn-more')).toBeTruthy();
  });
});
