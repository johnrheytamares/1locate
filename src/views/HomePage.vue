<template>
  <ion-page>
    <ion-content class="home-content">
      <main class="welcome">
        <img class="welcome-logo" src="/images/1locate-logo.png" alt="1Locate logo" />
        <span class="eyebrow">CAMPUS NAVIGATION</span>
        <h1>Find your way<br />around campus.</h1>
        <p>Choose a destination to view its details and start your route.</p>
        <ion-button expand="block" router-link="/destinations">Choose Destination<ion-icon slot="end" :icon="arrowForwardOutline" /></ion-button>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonIcon, IonPage } from '@ionic/vue';
import { arrowForwardOutline } from 'ionicons/icons';
</script>

<style scoped>
.home-content { --background: linear-gradient(180deg, rgba(7, 28, 48, .54), rgba(7, 28, 48, .82)), url('/images/campus-background.jpg') center center / cover no-repeat #183b52; --color: #fff; }
.home-content::part(scroll) { display: flex; flex-direction: column; }
.welcome { width: min(100%, 440px); margin: auto; padding: 32px 24px; box-sizing: border-box; text-align: center; }
.welcome-logo { display: block; width: clamp(100px, 30vw, 150px); height: 160px; object-fit: contain; margin: 0 auto 22px; }
.eyebrow { color: #d0e2ed; font-size: 10px; font-weight: 750; letter-spacing: .14em; }
h1 { color: #fff; text-shadow: 0 2px 12px #061b3150; font-size: clamp(26px, 7vw, 34px); line-height: 1.2; font-weight: 800; letter-spacing: -.8px; margin: 12px 0; }
p { font-size: 14px; line-height: 1.7; color: #e1ebf3; margin: 0 0 28px; }
ion-button { --background: #1d4ed8; --color: #fff; --border-radius: 12px; --box-shadow: none; min-height: 48px; margin: 0; font-size: 14px; font-weight: 650; text-transform: none; letter-spacing: 0; }
</style>
