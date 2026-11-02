<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMessages } from '../../i18n/index.ts'
import { ApiError, type Output } from '../../lib/api.ts'
import { base64OfFile, kindOf } from '../../lib/images.ts'
import { api } from '../../lib/session.ts'

type Asset = Output<'list_assets'>['assets'][number]

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ pick: [image: { src: string; alt: string; url: string }] }>()
const m = useMessages()
const assets = ref<Asset[] | null>(null)
const url = ref('')
const alt = ref('')
const tab = ref('library')
const file = ref<File | null>(null)
const fileAlt = ref('')
const uploading = ref(false)
const refused = ref<string | null>(null)

watch(open, async (isOpen) => {
  if (!isOpen) return
  url.value = ''
  alt.value = ''
  file.value = null
  fileAlt.value = ''
  refused.value = null
  if (assets.value === null) assets.value = (await api.call('list_assets', { limit: 100 })).assets
})

const images = computed(() =>
  assets.value === null ? null : assets.value.filter((one) => kindOf(one.format) === 'image'),
)

const tabs = computed(() => [
  { label: m.value.editor.image.library, value: 'library', slot: 'library' as const },
  { label: m.value.editor.image.upload, value: 'upload', slot: 'upload' as const },
  { label: m.value.editor.image.url, value: 'url', slot: 'url' as const },
])

function choose(event: Event) {
  const target = event.target
  file.value = target instanceof HTMLInputElement ? (target.files?.[0] ?? null) : null
}

async function upload() {
  const chosen = file.value
  const text = fileAlt.value.trim()
  if (chosen === null || text === '') return
  uploading.value = true
  refused.value = null
  try {
    const answer = await api.call('upload_asset', {
      filename: chosen.name,
      alt: text,
      data: await base64OfFile(chosen),
    })
    if (answer.asset === undefined) {
      refused.value = `${answer.problem?.message ?? ''} ${answer.problem?.fix ?? ''}`.trim()
      return
    }
    const asset = answer.asset
    assets.value = [asset, ...(assets.value ?? []).filter((one) => one.id !== asset.id)]
    pick(asset.reference, text, asset.url)
  } catch (error) {
    refused.value = error instanceof ApiError ? `${error.message} ${error.fix}` : String(error)
  } finally {
    uploading.value = false
  }
}

function pick(src: string, text: string, address = src) {
  emit('pick', { src, alt: text, url: address })
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="m.editor.image.title" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <UTabs v-model="tab" :items="tabs" variant="link">
        <template #library>
          <p v-if="images !== null && images.length === 0" class="pt-4 text-sm text-muted">
            {{ m.editor.image.empty }}
          </p>
          <ul v-else class="grid grid-cols-3 gap-3 pt-4">
            <li v-for="asset in images ?? []" :key="asset.id">
              <button
                type="button"
                class="block w-full overflow-hidden rounded-md border border-default text-left hover:ring-2 hover:ring-secondary/60 focus-visible:ring-2 focus-visible:ring-secondary focus-visible:outline-none"
                :aria-label="m.editor.image.insertNamed(asset.alt || asset.reference)"
                @click="pick(asset.reference, asset.alt, asset.url)"
              >
                <img :src="asset.url" :alt="asset.alt" class="aspect-video w-full object-cover" />
                <span class="block truncate px-2 py-1 text-xs text-muted">{{
                  asset.alt || asset.reference
                }}</span>
              </button>
            </li>
          </ul>
        </template>
        <template #upload>
          <form class="space-y-3 pt-4" @submit.prevent="upload">
            <UFormField :label="m.editor.image.file">
              <input
                type="file"
                :aria-label="m.editor.image.file"
                accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml"
                class="text-sm"
                @change="choose"
              />
            </UFormField>
            <UFormField :label="m.editor.image.alt">
              <UInput v-model="fileAlt" class="w-full" />
            </UFormField>
            <UAlert
              v-if="refused !== null"
              color="error"
              :title="m.images.refused"
              :description="refused"
            />
            <UButton
              type="submit"
              :label="m.editor.image.uploadInsert"
              :loading="uploading"
              :disabled="file === null || fileAlt.trim() === ''"
            />
          </form>
        </template>
        <template #url>
          <form class="space-y-3 pt-4" @submit.prevent="pick(url.trim(), alt.trim())">
            <UFormField :label="m.editor.image.address">
              <UInput
                v-model="url"
                type="url"
                class="w-full"
                :placeholder="m.editor.image.addressPlaceholder"
              />
            </UFormField>
            <UFormField :label="m.editor.image.alt">
              <UInput v-model="alt" class="w-full" />
            </UFormField>
            <UButton type="submit" :label="m.editor.image.insert" :disabled="url.trim() === ''" />
          </form>
        </template>
      </UTabs>
    </template>
  </UModal>
</template>
