import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import {
  isServiceDisabled,
  setServiceDisabled,
  recordSigningFailure,
  recordSigningSuccess,
} from '../src/killSwitch.js';

describe('isServiceDisabled', () => {
  it('defaults to not-disabled when the flag has never been set', async () => {
    await env.WATCH_TOGETHER_KV.delete('killswitch:disabled');
    expect(await isServiceDisabled(env.WATCH_TOGETHER_KV)).toBe(false);
  });

  it('reflects an explicit "true" flag', async () => {
    await setServiceDisabled(env.WATCH_TOGETHER_KV, true);
    expect(await isServiceDisabled(env.WATCH_TOGETHER_KV)).toBe(true);
  });

  it('reflects an explicit "false" flag', async () => {
    await setServiceDisabled(env.WATCH_TOGETHER_KV, false);
    expect(await isServiceDisabled(env.WATCH_TOGETHER_KV)).toBe(false);
  });

  it('fails SAFE (treats as disabled) when the KV read throws', async () => {
    const brokenKv = {
      get: async () => {
        throw new Error('KV unavailable');
      },
    };
    expect(await isServiceDisabled(brokenKv)).toBe(true);
  });
});

describe('signing failure breaker', () => {
  beforeEach(async () => {
    await env.WATCH_TOGETHER_KV.delete('killswitch:signing_failures');
    await setServiceDisabled(env.WATCH_TOGETHER_KV, false);
  });

  it('does not trip the kill-switch on 1 or 2 failures', async () => {
    await recordSigningFailure(env.WATCH_TOGETHER_KV);
    await recordSigningFailure(env.WATCH_TOGETHER_KV);
    expect(await isServiceDisabled(env.WATCH_TOGETHER_KV)).toBe(false);
  });

  it('trips the kill-switch automatically on the 3rd consecutive failure', async () => {
    await recordSigningFailure(env.WATCH_TOGETHER_KV);
    await recordSigningFailure(env.WATCH_TOGETHER_KV);
    await recordSigningFailure(env.WATCH_TOGETHER_KV);
    expect(await isServiceDisabled(env.WATCH_TOGETHER_KV)).toBe(true);
  });

  it('resets the counter on a success, so a later failure does not immediately trip it', async () => {
    await recordSigningFailure(env.WATCH_TOGETHER_KV);
    await recordSigningFailure(env.WATCH_TOGETHER_KV);
    await recordSigningSuccess(env.WATCH_TOGETHER_KV);
    await recordSigningFailure(env.WATCH_TOGETHER_KV);
    expect(await isServiceDisabled(env.WATCH_TOGETHER_KV)).toBe(false);
  });
});
