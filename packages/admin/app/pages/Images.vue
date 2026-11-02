<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables'
import { useInfiniteQuery } from '@pinia/colada'
import { useClipboard } from '@vueuse/core'
import { computed, ref, useTemplateRef } from 'vue'
import Page from '../components/Page.vue'
import { formatDate, useMessages } from '../i18n/index.ts'
import { ApiError, type Output } from '../lib/api.ts'
import { ACCEPTED_FILES, kindOf, markdownOf, sizeOf } from '../lib/images.ts'
import { api } from '../lib/session.ts'

type Asset = NonNullable<Output<'get_asset'>['asset']>

const m = useMessages()
const toast = useToast()
const file = ref<File | null>(null)
const alt = ref('')
const busy = ref(false)
const input = useTemplateRef('input')
const clipboard = useClipboard({ legacy: true })
const editing = ref<Asset | null>(null)
const editedAlt = ref('')

function describe(error: unknown): string {
  return error instanceof ApiError ? `${error.message} ${error.fix}` : String(error)
}

const assetsQuery = useInfiniteQuery({
  key: ['pages', 'list_assets', { limit: 24 }],
  query: ({ pageParam }) =>
    api.call('list_assets', { limit: 24, ...(pageParam === null ? {} : { cursor: pageParam }) }),
  initialPageParam: null as string | null,
  getNextPageParam: (last) => last.nextCursor,
})
const { hasNextPage, loadNextPage } = assetsQuery
const assets = computed<Asset[]>(
  () => assetsQuery.data.value?.pages.flatMap((page) => page.assets) ?? [],
)
const failure = computed(() =>
  assetsQuery.error.value === null ? null : describe(assetsQuery.error.value),
)

function choose(event: Event) {
  const target = event.target
  file.value = target instanceof HTMLInputElement ? (target.files?.[0] ?? null) : null
}

async function upload() {
  if (file.value === null || alt.value.trim() === '') return
  busy.value = true
  try {
    const answer = await api.upload(file.value, {
      filename: file.value.name,
      alt: alt.value.trim(),
    })
    if (answer.asset === undefined) {
      toast.add({
        title: m.value.images.refused,
        description: `${answer.problem?.message ?? ''} ${answer.problem?.fix ?? ''}`.trim(),
        color: 'error',
      })
      return
    }
    toast.add({
      title: answer.outcome === 'exists' ? m.value.images.exists : m.value.images.uploaded,
      color: 'success',
    })
    file.value = null
    alt.value = ''
    if (input.value !== null) input.value.value = ''
  } catch (error) {
    toast.add({ title: m.value.images.refused, description: describe(error), color: 'error' })
  } finally {
    busy.value = false
  }
}

async function copy(asset: Asset) {
  await clipboard.copy(markdownOf(asset))
  toast.add({ title: m.value.images.copied, color: 'success' })
}

function edit(asset: Asset) {
  editing.value = asset
  editedAlt.value = asset.alt
}

async function saveAlt() {
  const asset = editing.value
  if (asset === null || editedAlt.value.trim() === '') return
  busy.value = true
  try {
    await api.call('update_asset', { id: asset.id, alt: editedAlt.value.trim() })
    toast.add({ title: m.value.images.altSaved, color: 'success' })
    editing.value = null
  } catch (error) {
    toast.add({ title: m.value.images.altNotSaved, description: describe(error), color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Page :title="m.images.title">
    <p class="text-muted text-sm">{{ m.images.intro }}</p>

    <form class="flex flex-wrap items-end gap-3" @submit.prevent="upload">
      <UFormField :label="m.images.file" required>
        <input
          ref="input"
          type="file"
          :aria-label="m.images.file"
          :accept="ACCEPTED_FILES"
          class="text-sm"
          @change="choose"
        />
      </UFormField>
      <UFormField :label="m.images.alt" :help="m.images.altHelp" required class="min-w-72 flex-1">
        <UInput v-model="alt" class="w-full" />
      </UFormField>
      <UButton type="submit" :loading="busy" :disabled="file === null || alt.trim() === ''">
        {{ m.images.upload }}
      </UButton>
    </form>

    <UAlert v-if="failure" color="error" :title="failure" />

    <p v-else-if="assets.length === 0" class="text-muted text-sm">{{ m.images.none }}</p>

    <ul v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <li
        v-for="asset in assets"
        :key="asset.id"
        class="border-default flex flex-col gap-2 rounded-md border p-2"
      >
        <video
          v-if="kindOf(asset.format) === 'video'"
          :src="asset.url"
          :aria-label="asset.alt"
          controls
          preload="metadata"
          class="bg-elevated aspect-video w-full rounded object-contain"
        />
        <a
          v-else-if="kindOf(asset.format) === 'pdf'"
          :href="asset.url"
          target="_blank"
          rel="noopener"
          class="bg-elevated text-muted flex aspect-video w-full flex-col items-center justify-center gap-1 rounded text-sm"
        >
          <UIcon name="i-lucide-file-text" class="size-8" />
          {{ m.images.openPdf }}
        </a>
        <img
          v-else
          :src="asset.url"
          :srcset="asset.srcset ?? undefined"
          sizes="320px"
          :alt="asset.alt"
          loading="lazy"
          class="bg-elevated aspect-video w-full rounded object-contain"
        />
        <p class="truncate text-sm font-medium" :title="asset.alt">{{ asset.alt }}</p>
        <p class="text-muted text-xs">
          {{ asset.filename }} · {{ sizeOf(asset.bytes) }}
          <template v-if="asset.width !== null"> · {{ asset.width }}×{{ asset.height }}</template>
          <template v-if="(asset.widths ?? []).length > 0">
            · {{ m.images.copies((asset.widths ?? []).join(', ')) }}</template
          >
          · {{ formatDate(asset.createdAt) }}
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton size="xs" variant="soft" icon="i-lucide-copy" @click="copy(asset)">
            {{ m.images.copy }}
          </UButton>
          <UButton
            size="xs"
            variant="ghost"
            icon="i-lucide-pencil"
            :aria-label="m.images.editAltOf(asset.filename)"
            @click="edit(asset)"
          >
            {{ m.images.editAlt }}
          </UButton>
        </div>
      </li>
    </ul>

    <UButton v-if="hasNextPage" variant="ghost" @click="loadNextPage()">{{
      m.images.more
    }}</UButton>
    <UModal
      :open="editing !== null"
      :title="m.images.editAlt"
      @update:open="(open) => (open ? null : (editing = null))"
    >
      <template #body>
        <form id="edit-alt" @submit.prevent="saveAlt">
          <UFormField :label="m.images.alt" :help="m.images.altHelp" required>
            <UInput v-model="editedAlt" class="w-full" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton :label="m.common.cancel" variant="ghost" @click="editing = null" />
        <UButton
          type="submit"
          form="edit-alt"
          :label="m.common.save"
          :loading="busy"
          :disabled="editedAlt.trim() === ''"
        />
      </template>
    </UModal>
  </Page>
</template>
