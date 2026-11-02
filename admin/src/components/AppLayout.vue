<template>
  <div class="layout">
    <button v-if="menuOpen" class="scrim" type="button" aria-label="Close navigation" @click="menuOpen = false"></button>
    <nav class="sidebar" :class="{ open: menuOpen }" aria-label="Main">
      <div class="brand">
        <img class="admin-brand-logo" src="/images/1locate-logo.png" alt="" />
        <div>
          <strong>1Locate Admin</strong>
          <small>Campus Navigation Management</small>
        </div>
      </div>
      <section v-for="group in groups" :key="group.title" class="nav-group">
        <p class="nav-label">{{ group.title }}</p>
        <router-link
          v-for="item in group.items"
          :key="item.name"
          :to="{ name: item.name }"
          @click="menuOpen = false"
        >
          <span class="nav-icon" v-html="item.icon"></span>
          {{ item.label }}
        </router-link>
      </section>
    </nav>

    <div class="maincol">
      <header class="topbar">
        <button class="menu" type="button" aria-label="Toggle navigation" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 7h16v2H4V7zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" /></svg>
        </button>
        <form class="search" @submit.prevent="onSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 4a6 6 0 1 0 3.7 10.7l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" /></svg>
          <input v-model="query" type="search" placeholder="Search buildings, rooms, or destinations..." aria-label="Search campus records" />
          <kbd>Ctrl K</kbd>
        </form>
        <div class="user">
          <span class="avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z" /></svg>
          </span>
          <span class="email" data-test="user-email">{{ session.state.email }}</span>
          <button class="logout" type="button" data-test="logout" aria-label="Log out" :disabled="signingOut" @click="confirmOpen = true">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 4h8v2H7v12h6v2H5V4zm8.6 3.4 1.4 1.4-2.2 2.2H20v2h-7.2l2.2 2.2-1.4 1.4L8.8 12l4.8-4.6z" /></svg>
            <span class="logout-label">{{ signingOut ? '...' : 'Log out' }}</span>
          </button>
        </div>
      </header>
      <ConfirmDialog
        v-if="confirmOpen"
        title="Log out"
        confirm-label="Log out"
        :busy="signingOut"
        @cancel="confirmOpen = false"
        @confirm="onSignOut"
      >
        <p>Are you sure you want to log out?</p>
      </ConfirmDialog>
      <main class="content">
        <router-view />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { useSession } from '@/stores/session';

const session = useSession();
const router = useRouter();
const menuOpen = ref(false);
const signingOut = ref(false);
const confirmOpen = ref(false);
const query = ref('');


const icons: Record<string, string> = {
  'indoor-maps': '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5zm7 .4v11.8l4 1.3V6.7l-4-1.3z"/></svg>',
  dashboard: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h7v7H4V4zm9 0h7v4h-7V4zM4 13h7v7H4v-7zm9-3h7v10h-7V10z"/></svg>',
  buildings: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 21V5l8-2 8 2v16h-6v-5H10v5H4zm4-9h2V9H8v3zm6 0h2V9h-2v3z"/></svg>',
  floors: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 5h16v3H4V5zm0 5.5h16v3H4v-3zM4 16h16v3H4v-3z"/></svg>',
  rooms: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 11 12 4l9 7v9h-6v-6H9v6H3v-9z"/></svg>',
  destinations: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 14.5 9 2.5 2.5 0 0 1 12 11.5z"/></svg>',
  roles: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 8v-1c0-2.8 3.1-4.5 7-4.5s7 1.7 7 4.5v1H5z"/></svg>',
};

const items = computed(() => [
  { name: 'dashboard', label: 'Dashboard', group: 'Main' },
  { name: 'buildings', label: 'Buildings', group: 'Campus Management' },
  { name: 'floors', label: 'Floors', group: 'Campus Management' },
  { name: 'indoor-maps', label: 'Indoor Maps & Routes', group: 'Campus Management' },
  { name: 'rooms', label: 'Rooms', group: 'Campus Management' },
  { name: 'destinations', label: 'Destinations', group: 'Campus Management' },
  ...(session.isAdmin.value ? [{ name: 'roles', label: 'Roles', group: 'System Management' }] : []),
]);

const groups = computed(() => {
  const order = ['Main', 'Campus Management', 'System Management'];
  return order
    .map((title) => ({
      title,
      items: items.value
        .filter((item) => item.group === title)
        .map((item) => ({ ...item, icon: icons[item.name] })),
    }))
    .filter((group) => group.items.length > 0);
});

function onSearch() {
  const term = query.value.trim();
  void router.push({ name: 'buildings', query: term ? { q: term } : {} });
}

async function onSignOut() {
  signingOut.value = true;
  try {
    await session.signOut();
    confirmOpen.value = false;
    await router.replace({ name: 'login' });
  } finally {
    signingOut.value = false;
  }
}
</script>

<style scoped>
.layout {
  height: 100vh;
  overflow: hidden;
  display: grid;
  grid-template-columns: 248px 1fr;
  background: #f3f6fb;
}

.sidebar {
  height: 100vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px 14px 24px;
  background: #0d2344;
  color: #fff;
}

.brand { display: flex; gap: 10px; align-items: center; padding: 4px 8px 8px; }
.brand strong { display: block; font-size: 15px; }
.brand small { display: block; color: #c9ddf5; font-size: 11px; line-height: 1.3; }
.mark {
  width: 36px; height: 36px; border-radius: 10px; background: #1d6fbf;
  display: grid; place-items: center; flex: 0 0 auto;
}
.mark svg { width: 20px; height: 20px; }

.nav-label {
  margin: 8px 10px 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #9ec3e6;
}
.nav-group { display: flex; flex-direction: column; gap: 2px; }
.sidebar a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  color: #e8f2fb;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
}
.nav-icon { width: 18px; height: 18px; display: grid; }
.nav-icon :deep(svg) { width: 18px; height: 18px; }
.sidebar a:hover { background: rgba(255, 255, 255, 0.08); }
.sidebar a.router-link-exact-active { background: #2563eb; color: #fff; }

.maincol { min-width: 0; min-height: 0; height: 100vh; display: flex; flex-direction: column; }
.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  min-height: 72px;
  padding: 12px 24px;
  background: #0c2140;
  border-bottom: 1px solid #0a1b36;
  color: #fff;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: none;
  justify-self: stretch;
  height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #e2e8f0;
  color: #94a3b8;
  box-shadow: 0 1px 2px rgba(15, 39, 68, 0.04);
}
.search svg { width: 16px; height: 16px; flex: 0 0 auto; }
.search input {
  border: 0;
  height: 36px;
  width: 100%;
  min-width: 0;
  padding: 0;
  background: transparent;
  outline: none;
}
.search input:focus { outline: none; }
.search kbd {
  flex: 0 0 auto;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 2px 6px;
  font-family: inherit;
  font-size: 11px;
  color: #94a3b8;
  background: #f8fafc;
}
.user { display: flex; align-items: center; gap: 10px; min-width: 0; justify-self: end; }
.avatar {
  width: 36px; height: 36px; border-radius: 999px; background: #dbeafe; color: #1d4ed8;
  display: grid; place-items: center; flex: 0 0 auto;
}
.avatar svg { width: 18px; height: 18px; }
.email {
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 13px; font-weight: 600; color: #fff; line-height: 1;
}
button.logout {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 36px; min-height: 36px; padding: 0 12px; margin: 0;
  background: transparent; color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 999px; font-size: 13px; font-weight: 600; flex: 0 0 auto;
}
button.logout svg { display: block; width: 16px; height: 16px; }
button.logout:hover:not(:disabled),
button.logout:active:not(:disabled) {
  background: #fff;
  border-color: #fff;
  color: #0c2140;
}
button.menu {
  display: none; width: 40px; height: 40px; min-height: 40px; padding: 0;
  background: #fff; color: #0b4f8a; border: 1px solid #dbe3ee;
}
button.menu svg { width: 20px; height: 20px; }
button.menu:hover:not(:disabled),
button.menu:active:not(:disabled) {
  background: #0c2140;
  border-color: #0c2140;
  color: #fff;
}
.content { padding: 20px 24px 24px; min-width: 0; min-height: 0; overflow: auto; flex: 1; }
.scrim { display: none; }

@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .topbar {
    display: flex;
    flex-wrap: nowrap;
    gap: 8px;
    background: #0c2140;
    min-height: 0;
    padding: 10px 12px;
  }
  button.menu { display: inline-flex; flex: 0 0 40px; }
  .search {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    justify-self: stretch;
  }
  .user { flex: 0 0 auto; gap: 8px; }
  .email, .search kbd { display: none; }
  .search { flex: 1 1 auto; }
  .logout { width: 40px; height: 40px; padding: 0; justify-content: center; }
  .logout svg { display: block; }
  .logout-label { display: none; }
  .sidebar {
    display: none;
    position: fixed;
    inset: 0 auto 0 0;
    width: min(280px, 86vw);
    z-index: 45;
    height: 100vh;
  }
  .sidebar.open { display: flex; }
  .scrim {
    display: block; position: fixed; inset: 0; z-index: 44;
    border: 0; background: rgba(11, 37, 69, 0.45); padding: 0;
  }
  .content, .topbar { padding-left: 14px; padding-right: 14px; }
}
.admin-brand-logo { width: 36px; height: 42px; object-fit: contain; flex: 0 0 auto; }
</style>
