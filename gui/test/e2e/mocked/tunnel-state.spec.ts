import { test } from '@playwright/test';
import { Page } from 'playwright';

import { startMockedApp, MockIpcHandle, SendMockIpcResponse } from './mocked-utils';
import { ErrorStateCause, ILocation, ITunnelEndpoint, TunnelState } from '../../../src/shared/daemon-rpc-types';
import { assertConnected, assertConnecting, assertDisconnected, assertDisconnecting, assertError } from '../shared/tunnel-state';

const mockLocation: ILocation = {
  country: 'Sweden',
  city: 'Gothenburg',
  latitude: 58,
  longitude: 12,
  mullvadExitIp: false,
};

let page: Page;
let mockIpcHandle: MockIpcHandle;
let sendMockIpcResponse: SendMockIpcResponse;

test.beforeAll(async () => {
  ({ page, mockIpcHandle, sendMockIpcResponse } = await startMockedApp());
});

test.afterAll(async () => {
  await page.close();
});

/**
 * Disconnected state
 */
test('App should show disconnected tunnel state', async () => {
  await mockIpcHandle<ILocation>({
    channel: 'location-get',
    response: mockLocation,
  });
  await sendMockIpcResponse<TunnelState>({
    channel: 'tunnel-',
    response: { state: 'disconnected' },
  });
  await assertDisconnected(page);
});

/**
 * Connecting state
 */
test('App should show connecting tunnel state', async () => {
  await mockIpcHandle<ILocation>({
    channel: 'location-get',
    response: mockLocation,
  });
  await sendMockIpcResponse<TunnelState>({
    channel: 'tunnel-',
    response: { state: 'connecting' },
  });
  await assertConnecting(page);
});

/**
 * Connected state
 */
test('App should show connected tunnel state', async () => {
  const location: ILocation = { ...mockLocation, mullvadExitIp: true };
  await mockIpcHandle<ILocation>({
    channel: 'location-get',
    response: location,
  });

  const endpoint: ITunnelEndpoint = {
    address: 'wg10:80',
    protocol: 'tcp',
    quantumResistant: false,
    tunnelType: 'wireguard',
  };
  await sendMockIpcResponse<TunnelState>({
    channel: 'tunnel-',
    response: { state: 'connected', details: { endpoint, location } },
  });

  await assertConnected(page);
});

/**
 * Disconnecting state
 */
test('App should show disconnecting tunnel state', async () => {
  await mockIpcHandle<ILocation>({
    channel: 'location-get',
    response: mockLocation,
  });
  await sendMockIpcResponse<TunnelState>({
    channel: 'tunnel-',
    response: { state: 'disconnecting', details: 'nothing' },
  });
  await assertDisconnecting(page);
});

/**
 * Error state
 */
test('App should show error tunnel state', async () => {
  await mockIpcHandle<ILocation>({
    channel: 'location-get',
    response: mockLocation,
  });
  await sendMockIpcResponse<TunnelState>({
    channel: 'tunnel-',
    response: { state: 'error', details: { cause: ErrorStateCause.isOffline } },
  });
  await assertError(page);
});
