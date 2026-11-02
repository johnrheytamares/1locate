import { describe, expect, test, vi } from 'vitest';
import { SPEECH_MESSAGES, listenForDestination, stopListening } from '@/services/speech-input.service';

type Permission = 'granted' | 'denied' | 'prompt';

function fakePlugin(options: {
  available?: boolean | Error;
  permission?: Permission;
  afterRequest?: Permission;
  matches?: string[] | Error;
} = {}) {
  return {
    available: vi.fn(async () => {
      if (options.available instanceof Error) throw options.available;
      return { available: options.available ?? true };
    }),
    checkPermissions: vi.fn(async () => ({ speechRecognition: options.permission ?? 'granted' })),
    requestPermissions: vi.fn(async () => ({ speechRecognition: options.afterRequest ?? 'denied' })),
    start: vi.fn(async () => {
      if (options.matches instanceof Error) throw options.matches;
      return { matches: options.matches ?? ['library'] };
    }),
    stop: vi.fn(async () => undefined),
  };
}

describe('listenForDestination', () => {
  test('returns the recognizer alternatives in English', async () => {
    const plugin = fakePlugin({ matches: [' the library ', 'the liberty', ''] });
    const result = await listenForDestination(plugin);
    expect(result).toEqual({ ok: true, transcripts: ['the library', 'the liberty'] });
    expect(plugin.start).toHaveBeenCalledWith(expect.objectContaining({ language: 'en-US', maxResults: 5, popup: false }));
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  test('asks for the microphone only when it is not granted yet', async () => {
    const plugin = fakePlugin({ permission: 'prompt', afterRequest: 'granted' });
    expect((await listenForDestination(plugin)).ok).toBe(true);
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
  });

  test('stops when the microphone is refused', async () => {
    const plugin = fakePlugin({ permission: 'prompt', afterRequest: 'denied' });
    expect(await listenForDestination(plugin)).toEqual({ ok: false, reason: 'denied', message: SPEECH_MESSAGES.denied });
    expect(plugin.start).not.toHaveBeenCalled();
  });

  test('reports an unavailable recognizer, including the web build', async () => {
    expect(await listenForDestination(fakePlugin({ available: false }))).toMatchObject({ ok: false, reason: 'unavailable' });
    const web = fakePlugin({ available: new Error('not implemented on web') });
    expect(await listenForDestination(web)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(web.start).not.toHaveBeenCalled();
  });

  test('treats silence as "no speech" so the user can try again', async () => {
    expect(await listenForDestination(fakePlugin({ matches: [] }))).toMatchObject({ reason: 'no-speech' });
    expect(await listenForDestination(fakePlugin({ matches: new Error('No match') }))).toMatchObject({ reason: 'no-speech' });
  });

  test('other recognizer errors are reported without throwing', async () => {
    const result = await listenForDestination(fakePlugin({ matches: new Error('Network error') }));
    expect(result).toEqual({ ok: false, reason: 'error', message: SPEECH_MESSAGES.error });
  });
});

describe('stopListening', () => {
  test('ignores errors when nothing is listening', async () => {
    await expect(stopListening({ stop: vi.fn().mockRejectedValue(new Error('not listening')) })).resolves.toBeUndefined();
  });
});
