<template>
  <section class="section" data-test="photo-manager">
    <h3>{{ kind === 'building' ? 'Building Photos' : 'Photos' }}</h3>
    <p class="muted" style="font-size: 13px">
      JPEG, PNG, or WebP (Max 5 MB each). Photos show in the app only while this {{ kind }} is published.
    </p>

    <p v-if="error" class="notice error" role="alert" data-test="photo-error">{{ error }}</p>
    <p v-if="warning" class="notice warn" data-test="photo-warning">{{ warning }}</p>
    <p v-if="notice" class="notice ok">{{ notice }}</p>

    <form class="upload" @submit.prevent="onUpload">
      <div class="field file-field">
        <p class="drop-copy">Add a photo</p>
        <label class="choose" :for="`photo-file-${parentId}`">Choose Files</label>
        <input
          :id="`photo-file-${parentId}`"
          ref="fileInput"
          class="file-input"
          type="file"
          :accept="ACCEPTED_IMAGE_TYPES"
          data-test="photo-file"
          @change="onFileChange"
        />
        <span v-if="fileError" class="field-error" data-test="photo-file-error">{{ fileError }}</span>
      </div>
      <img v-if="previewUrl" :src="previewUrl" alt="Selected photo preview" class="preview" />
      <div class="field">
        <label :for="`photo-caption-${parentId}`">Caption (optional)</label>
        <input :id="`photo-caption-${parentId}`" v-model="caption" maxlength="200" data-test="photo-caption" />
      </div>
      <button type="submit" :disabled="!selectedFile || uploading" data-test="photo-upload">
        {{ uploading ? 'Uploading...' : 'Upload photo' }}
      </button>
    </form>

    <p v-if="loading" class="muted">Loading photos...</p>
    <p v-else-if="photos.length === 0" class="empty" data-test="photo-empty">No photos yet.</p>
    <div v-else-if="current" class="viewer" data-test="photo-item">
      <div class="pager">
        <button class="ghost small icon-nav" type="button" aria-label="Previous photo" :disabled="photoIndex === 0" @click="step(-1)">&lt;</button>
        <span>{{ photoIndex + 1 }} / {{ photos.length }}</span>
        <button class="ghost small icon-nav" type="button" aria-label="Next photo" :disabled="photoIndex >= photos.length - 1" @click="step(1)">&gt;</button>
      </div>
      <img
        v-if="cache.url(current.storagePath)"
        :src="cache.url(current.storagePath)!"
        :alt="current.caption ?? 'Photo'"
        @error="onImageError(current.storagePath)"
      />
      <div v-else class="thumb-placeholder">Preview unavailable</div>
      <input v-model="captions[current.id]" maxlength="200" :aria-label="`Caption for photo ${photoIndex + 1}`" />
      <div class="row-actions">
        <button class="ghost small" type="button" :disabled="busyId !== null || photoIndex === 0" aria-label="Move up" @click="onMove(photoIndex, photoIndex - 1)">↑</button>
        <button class="ghost small" type="button" :disabled="busyId !== null || photoIndex >= photos.length - 1" aria-label="Move down" @click="onMove(photoIndex, photoIndex + 1)">↓</button>
        <button class="secondary small" type="button" :disabled="busyId !== null || (captions[current.id] ?? '') === (current.caption ?? '')" @click="onSaveCaption(current)">
          Save caption
        </button>
        <button class="danger small" type="button" :disabled="busyId !== null" data-test="photo-delete" @click="pendingDelete = current">Delete</button>
      </div>
    </div>

    <ConfirmDialog
      v-if="pendingDelete"
      title="Delete photo?"
      confirm-label="Delete photo"
      danger
      :busy="busyId === pendingDelete.id"
      @cancel="pendingDelete = null"
      @confirm="onDelete(pendingDelete)"
    >
      <p>This removes the photo from the app and deletes the file. This cannot be undone.</p>
    </ConfirmDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { createSignedUrlCache } from '@/composables/useSignedUrls';
import { describeError } from '@/lib/errors';
import { ACCEPTED_IMAGE_TYPES, validateImageFile } from '@/lib/images';
import {
  deletePhoto,
  listPhotos,
  nextSortOrder,
  reorderPhotos,
  signPhotoUrls,
  updatePhoto,
  uploadPhoto,
} from '@/services/photos';
import { useSession } from '@/stores/session';
import type { Photo, PhotoKind } from '@/types';

const props = defineProps<{ kind: PhotoKind; parentId: string }>();

const RENEW_CHECK_MS = 60 * 1000;

const photos = ref<Photo[]>([]);
const captions = reactive<Record<string, string>>({});
const loading = ref(false);
const uploading = ref(false);
const busyId = ref<string | null>(null);
const error = ref('');
const warning = ref('');
const notice = ref('');
const fileError = ref('');
const caption = ref('');
const selectedFile = ref<File | null>(null);
const previewUrl = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const pendingDelete = ref<Photo | null>(null);
const photoIndex = ref(0);
const current = computed(() => photos.value[photoIndex.value] ?? null);

function step(delta: number) {
  const next = photoIndex.value + delta;
  if (next >= 0 && next < photos.value.length) photoIndex.value = next;
}

const cache = createSignedUrlCache((paths) => signPhotoUrls(props.kind, paths));
let renewTimer: ReturnType<typeof setInterval> | null = null;
const stopClearListener = useSession().onCleared(resetAll);

function resetMessages() {
  error.value = '';
  warning.value = '';
  notice.value = '';
}

function setPhotos(list: Photo[]) {
  photos.value = list;
  for (const photo of list) captions[photo.id] = photo.caption ?? '';
  if (photoIndex.value > list.length - 1) photoIndex.value = Math.max(0, list.length - 1);
}

async function refreshUrls() {
  try {
    await cache.ensure(photos.value.map((photo) => photo.storagePath));
  } catch (err) {
    warning.value = `Previews could not be loaded: ${describeError(err)}`;
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    setPhotos(await listPhotos(props.kind, props.parentId));
    await refreshUrls();
  } catch (err) {
    error.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

function clearSelection() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = null;
  selectedFile.value = null;
  caption.value = '';
  if (fileInput.value) fileInput.value.value = '';
}

async function onFileChange(event: Event) {
  fileError.value = '';
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = null;
  selectedFile.value = null;
  if (!file) return;
  const check = await validateImageFile(file);
  if (!check.ok) {
    fileError.value = check.error;
    return;
  }
  selectedFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
}

async function onUpload() {
  if (!selectedFile.value) return;
  resetMessages();
  uploading.value = true;
  try {
    const photo = await uploadPhoto(props.kind, props.parentId, selectedFile.value, caption.value, nextSortOrder(photos.value));
    setPhotos([...photos.value, photo]);
    photoIndex.value = photos.value.length - 1;
    clearSelection();
    notice.value = 'Photo uploaded.';
    await refreshUrls();
  } catch (err) {
    error.value = describeError(err);
  } finally {
    uploading.value = false;
  }
}

async function onDelete(photo: Photo) {
  resetMessages();
  busyId.value = photo.id;
  try {
    const result = await deletePhoto(props.kind, photo);
    setPhotos(photos.value.filter((item) => item.id !== photo.id));
    cache.forget(photo.storagePath);
    if (result.warning) warning.value = result.warning;
    else notice.value = 'Photo deleted.';
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busyId.value = null;
    pendingDelete.value = null;
  }
}

async function onSaveCaption(photo: Photo) {
  resetMessages();
  busyId.value = photo.id;
  try {
    const updated = await updatePhoto(props.kind, photo.id, { caption: captions[photo.id] ?? '' });
    setPhotos(photos.value.map((item) => (item.id === updated.id ? updated : item)));
    notice.value = 'Caption saved.';
  } catch (err) {
    error.value = describeError(err);
  } finally {
    busyId.value = null;
  }
}

async function onMove(from: number, to: number) {
  resetMessages();
  const changes = reorderPhotos(photos.value, from, to);
  if (changes.length === 0) return;
  busyId.value = photos.value[from].id;
  try {
    for (const change of changes) {
      await updatePhoto(props.kind, change.id, { sort_order: change.sortOrder });
    }
    notice.value = 'Order saved.';
  } catch (err) {
    error.value = `The new order was only partly saved. ${describeError(err)}`;
  } finally {
    busyId.value = null;
    await load();
  }
}

async function onImageError(path: string) {
  try {
    await cache.renewAfterError(path);
  } catch {
    // The placeholder stays visible.
  }
}

function resetAll() {
  photos.value = [];
  cache.clear();
  clearSelection();
}

watch(() => props.parentId, () => {
  cache.clear();
  void load();
});

onMounted(() => {
  void load();
  renewTimer = setInterval(() => { void refreshUrls(); }, RENEW_CHECK_MS);
});

onBeforeUnmount(() => {
  if (renewTimer) clearInterval(renewTimer);
  stopClearListener();
  resetAll();
});
</script>

<style scoped>
h3 { margin-bottom: 2px; font-size: 0.95rem; }
.section > .muted { margin-bottom: 6px; font-size: 12px; line-height: 1.3; }
.upload {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px dashed #93c5fd;
  border-radius: 10px;
  margin-bottom: 8px;
  background: #fff;
  text-align: center;
}
.upload button { height: 32px; padding: 4px 10px; }
.file-field { position: relative; align-items: center; }
.drop-copy { margin: 0; color: var(--muted); font-size: 13px; }
.choose {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--navy);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.preview {
  max-width: 220px;
  max-height: 160px;
  border-radius: 8px;
  object-fit: cover;
}

.viewer {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
}
.icon-nav { width: 32px; height: 32px; padding: 0; }
.viewer img,
.thumb-placeholder {
  width: 100%;
  height: 140px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--blue-soft);
}

.thumb-placeholder {
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 13px;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
