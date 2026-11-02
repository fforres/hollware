<script setup lang="ts">
import Page from '../../components/Page.vue'
import { ref } from 'vue'
import StructureDialogs from '../../components/StructureDialogs.vue'
import { useMessages } from '../../i18n/index.ts'
import { MEDIA_MAX_WIDTH, MEDIA_MIN_WIDTH } from '@hollware/core'
import { megabytesOf, parseMaxMegabytes, parseWidths } from '../../lib/media.ts'
import { useSiteSettings } from '../../lib/site-settings.ts'

const m = useMessages()
const imageFormat = ref<'webp' | 'avif' | 'original'>('webp')
const imageQuality = ref<number | undefined>(85)
const imageMaxWidth = ref<number | undefined>(2400)
const imageWidths = ref('')
const keepOriginals = ref(true)
const imageWidthsError = ref<string | null>(null)
const maxMegabytes = ref<number | undefined>(100)
const maxMegabytesError = ref<string | null>(null)

const { structure, change, load, save } = useSiteSettings({
  fill: (read) => {
    imageFormat.value = read.definition.media.format
    imageQuality.value = read.definition.media.quality
    imageMaxWidth.value = read.definition.media.maxWidth
    imageWidths.value = read.definition.media.widths.join(', ')
    keepOriginals.value = read.definition.media.keepOriginals
    imageWidthsError.value = null
    maxMegabytes.value = megabytesOf(read.definition.media.maxBytes)
    maxMegabytesError.value = null
  },
  values: () => [
    imageFormat.value,
    imageQuality.value,
    imageMaxWidth.value,
    imageWidths.value,
    keepOriginals.value,
    maxMegabytes.value,
  ],
})

async function saveImages() {
  const widths = parseWidths(imageWidths.value)
  if (!widths.ok) {
    imageWidthsError.value = m.value.site.imageWidthsInvalid(widths.min, widths.max, widths.most)
    return
  }
  imageWidthsError.value = null
  const most = parseMaxMegabytes(maxMegabytes.value)
  if (!most.ok) {
    maxMegabytesError.value = m.value.site.maxMegabytesInvalid(most.most)
    return
  }
  maxMegabytesError.value = null
  await save((definition) => ({
    ...definition,
    media: {
      format: imageFormat.value,
      quality: imageQuality.value ?? definition.media.quality,
      maxWidth: imageMaxWidth.value ?? definition.media.maxWidth,
      widths: widths.widths,
      keepOriginals: keepOriginals.value,
      maxBytes: most.bytes,
    },
  }))
}
</script>

<template>
  <Page :title="m.settings.sections.images" :description="m.site.imagesNote">
    <div v-if="structure !== null" class="max-w-2xl space-y-4">
      <StructureDialogs
        :impact="change.impact.value"
        :problems="change.problems.value"
        :conflict="change.conflict.value"
        :failure="change.failure.value"
        @confirm="change.confirmPending"
        @cancel="change.cancel"
        @reload="load"
      />
      <form class="space-y-4" novalidate @submit.prevent="saveImages">
        <URadioGroup
          v-model="imageFormat"
          :legend="m.site.imageFormat"
          :description="m.site.imageFormatHelp"
          :items="[
            { label: m.site.formatWebp, value: 'webp' },
            { label: m.site.formatAvif, value: 'avif' },
            { label: m.site.formatOriginal, value: 'original' },
          ]"
        />
        <UFormField :label="m.site.imageQuality" :help="m.site.imageQualityHelp">
          <UInput v-model.number="imageQuality" type="number" :min="1" :max="100" class="w-40" />
        </UFormField>
        <UFormField :label="m.site.imageMaxWidth" :help="m.site.imageMaxWidthHelp">
          <UInput
            v-model.number="imageMaxWidth"
            type="number"
            :min="MEDIA_MIN_WIDTH"
            :max="MEDIA_MAX_WIDTH"
            class="w-40"
          />
        </UFormField>
        <UFormField
          :label="m.site.imageWidths"
          :help="m.site.imageWidthsHelp"
          :error="imageWidthsError ?? undefined"
        >
          <UInput v-model="imageWidths" class="w-60" />
        </UFormField>
        <UFormField :help="m.site.keepOriginalsHelp">
          <USwitch v-model="keepOriginals" :label="m.site.keepOriginals" />
        </UFormField>
        <UFormField
          :label="m.site.maxMegabytes"
          :help="m.site.maxMegabytesHelp"
          :error="maxMegabytesError ?? undefined"
        >
          <UInput v-model.number="maxMegabytes" type="number" :min="1" class="w-40" />
        </UFormField>
        <UButton type="submit" :label="m.site.saveImages" :loading="change.busy.value" />
      </form>
    </div>
    <p v-else class="text-muted">{{ m.common.loading }}</p>
  </Page>
</template>
