import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';

/**
 * Starts a continuous rear-camera preview behind the WebView.
 * The arrows drawn on top are a screen overlay. They are not locked to the floor.
 */
export async function startRearPreview(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Live camera preview runs in the Android app.');
  }

  try {
    await CameraPreview.start({
      position: 'rear',
      toBack: true,
      disableAudio: true,
    });
  } catch (error) {
    const message = readMessage(error);
    if (message.toLowerCase().includes('already started')) return;
    if (message.toLowerCase().includes('permission')) {
      throw new Error('Camera permission was denied. Allow the camera, then try again.');
    }
    if (message.toLowerCase().includes('failed to open') || message.toLowerCase().includes('no camera')) {
      throw new Error('The rear camera is unavailable on this phone.');
    }
    throw new Error(message || 'The camera could not start.');
  }
}

function readMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

export async function stopRearPreview(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await CameraPreview.stop();
  } catch {
    // The preview is already stopped when the page closes or the app resumes.
  }
}
