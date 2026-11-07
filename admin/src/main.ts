import { createApp } from 'vue';
import App from '@/App.vue';
import { router } from '@/router';
import '@/styles.css';

createApp(App).use(router).mount('#app');

// OAuth runs in the system browser. Only accept the app's exact callback address.
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { isNativeAuthCallback } from '@/services/account-auth';
if (Capacitor.isNativePlatform()) {
  const opened = new Set<string>();
  const handle = async (url: string) => {
    if (!isNativeAuthCallback(url) || opened.has(url)) return;
    opened.add(url);
    const params = new URL(url).searchParams;
    await Browser.close().catch(() => {});
    await router.replace({ path: '/auth/callback', query: params.has('error') ? { error: 'oauth_failed' } : { code: params.get('code') ?? '' } });
  };
  void NativeApp.addListener('appUrlOpen', ({ url }) => { void handle(url); });
  void NativeApp.getLaunchUrl().then(result => { if (result?.url) void handle(result.url); });
}
