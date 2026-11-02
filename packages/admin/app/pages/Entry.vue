<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { defineShortcuts, useToast } from '@nuxt/ui/composables'
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import EntryEditor from '../components/EntryEditor.vue'
import FrontmatterForm from '../components/FrontmatterForm.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import RevisionHistory from '../components/RevisionHistory.vue'
import SourceChanges from '../components/SourceChanges.vue'
import VerdictList from '../components/VerdictList.vue'
import { formatDateTime, useMessages } from '../i18n/index.ts'
import { ApiError, type Output } from '../lib/api.ts'
import { diagnosticsOf } from '../lib/diagnostics.ts'
import type { ComponentDefinition } from '../lib/editor/components.ts'
import { entryPath, STATUS_COLOR, titleOf } from '../lib/entries.ts'
import {
  bodyOf,
  readFrontmatter,
  referencesOf,
  setField,
  withBody,
  type Reference,
} from '../lib/frontmatter.ts'
import { openEntry } from '../lib/open-entry.ts'
import { can, me } from '../lib/me.ts'
import { holdsSave, reviewLink, type PendingReview } from '../lib/pending-review.ts'
import { operation } from '../lib/queries.ts'
import { api } from '../lib/session.ts'
import { pageUrl } from '../lib/site.ts'
import { openPreview } from '../lib/site-preview.ts'
import { useNarrow } from '../lib/narrow.ts'
import { usePageTitle } from '../lib/title.ts'
import {
  browserStorage,
  copyKeeper,
  isOlderCopy,
  readWorkingCopy,
  restoreOf,
  saveDelay,
  workingCopyKey,
  type Restore,
} from '../lib/working-copy.ts'

const props = defineProps<{ collection: string; locale: string; slug: string }>()

type Site = Output<'describe_site'>['site']
type Entry = NonNullable<Output<'get_entry'>['entry']>
type Summary = Output<'list_entries'>['entries'][number]
type Verdict = Output<'validate'>['verdict']
type Warning = Verdict['warnings'][number]
type SaveState = 'saved' | 'saving' | 'unsaved' | 'failed'

const toast = useToast()
const m = useMessages()
const route = useRoute()
const router = useRouter()
const siteQuery = useQuery(operation('describe_site', {}))
const site = computed<Site | null>(() => siteQuery.data.value?.site ?? null)
const structureQuery = useQuery(operation('get_structure', {}))
const references = computed<Record<string, Reference> | null>(() =>
  structureQuery.data.value === undefined
    ? null
    : referencesOf(
        structureQuery.data.value.definition.collections[props.collection]?.rules ?? [],
        props.locale,
      ),
)
const entry = ref<Entry | null>(null)
const related = ref<Summary[]>([])
const translationsQuery = useQuery(() => ({
  ...operation('get_translations', {
    collection: props.collection,
    translationGroup: entry.value?.translationGroup ?? '',
  }),
  enabled: (entry.value?.translationGroup ?? null) !== null,
}))
const translations = computed<Summary[]>(() =>
  entry.value?.translationGroup === null ? [] : (translationsQuery.data.value?.entries ?? []),
)
const missing = ref(false)
const text = ref('')
const saved = ref('')
const verdict = ref<Verdict | null>(null)
const busy = ref(false)
const saveState = ref<SaveState>('saved')
const lossy = ref(false)
const conflictOpen = ref(false)
const reviewQuery = useQuery(() => ({
  ...operation('list_reviews', { status: 'pending', entryId: entry.value?.id ?? '', limit: 1 }),
  enabled: entry.value !== null,
}))
const savedOver = ref<string | null>(null)
const pendingReview = computed<PendingReview | null>(() => {
  const review = reviewQuery.data.value?.reviews[0] ?? null
  return review === null || review.id === savedOver.value ? null : review
})
const overrideReview = ref(false)
const heldOpen = ref(false)
const warnings = ref<Warning[]>([])
const acknowledgeOpen = ref(false)
const unpublishOpen = ref(false)
const trashOpen = ref(false)
const scheduleOpen = ref(false)
const moveOpen = ref(false)
const newSlug = ref('')
const slugValid = computed(() => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug.value))
const scheduleMode = ref<'publish' | 'unpublish'>('publish')
const publishAt = ref('')
let pendingAt: string | undefined

const source = computed(() => lossy.value || route.query['view'] === 'markdown')
const panel = computed(() => (route.query['panel'] === 'history' ? 'history' : 'properties'))
const narrow = useNarrow()
const panelOpen = computed(() =>
  narrow.value
    ? route.query['panel'] === 'properties' || route.query['panel'] === 'history'
    : route.query['panel'] !== 'none',
)

function setQuery(key: string, value: string | null) {
  const query = { ...route.query }
  if (value === null) delete query[key]
  else query[key] = value
  void router.replace({ query })
}

const ref_ = computed(() => ({
  collection: props.collection,
  locale: props.locale,
  slug: props.slug,
}))
const definition = computed(() =>
  site.value?.collections.find((candidate) => candidate.name === props.collection),
)
const components = computed<ComponentDefinition[]>(() =>
  (definition.value?.components ?? []).map(({ name, description, example, props: schema }) => ({
    name,
    description,
    example,
    props: schema,
  })),
)
const hasTitle = computed(() => {
  const properties = definition.value?.schema['properties']
  return typeof properties === 'object' && properties !== null && 'title' in properties
})
const values = computed(() => readFrontmatter(text.value))
const title = computed({
  get: () => {
    const value = values.value?.['title']
    return typeof value === 'string' ? value : ''
  },
  set: (value: string) => {
    text.value = setField(text.value, 'title', value)
  },
})
const body = computed(() => bodyOf(text.value))
usePageTitle(() => title.value)
const dirty = computed(() => text.value !== saved.value)
const storage = browserStorage()
const copies = copyKeeper(storage)
const copyKey = computed(() =>
  entry.value === null || me.value === null ? null : workingCopyKey(me.value.site, entry.value.id),
)
const restored = ref<Restore>({ kind: 'none' })
const diagnostics = computed(() =>
  verdict.value === null ? [] : diagnosticsOf(text.value, verdict.value),
)
const liveUrl = computed(() =>
  entry.value?.status === 'published' && definition.value !== undefined
    ? pageUrl(site.value?.url ?? null, definition.value.routes, props.locale, props.slug)
    : null,
)
const canPreviewOnSite = computed(
  () =>
    definition.value !== undefined &&
    pageUrl(site.value?.url ?? null, definition.value.routes, props.locale, props.slug) !== null,
)
const untranslated = computed(() =>
  entry.value?.translationGroup === null || entry.value === null
    ? []
    : (site.value?.locales ?? []).filter(
        (locale) => !translations.value.some((other) => other.locale === locale),
      ),
)
const original = computed(() =>
  translations.value.find((other) => other.locale === site.value?.defaultLocale),
)
const writable = computed(() => me.value === null || can(me.value, 'content:write'))
const canPublish = computed(
  () =>
    entry.value !== null &&
    (dirty.value || entry.value.status !== 'published' || entry.value.hasUnpublishedChanges),
)
const checks = computed(() => ({
  errors: verdict.value?.errors.length ?? 0,
  warnings: verdict.value?.warnings.length ?? 0,
}))

const entryQuery = useQuery(() =>
  operation('get_entry', { ...ref_.value, formats: ['markdown'], related: true }),
)
let shown: string | null = null
let forcing = false

async function show(read: Output<'get_entry'>) {
  if (read.outcome === 'not_found' || read.entry === undefined) {
    missing.value = true
    return
  }
  missing.value = false
  lossy.value = false
  shown = read.entry.id
  entry.value = read.entry
  related.value = read.related ?? []
  text.value = read.entry.markdown ?? ''
  saved.value = text.value
  verdict.value = read.entry.verdict
  saveState.value = 'saved'
  overrideReview.value = false
  savedOver.value = null
  if (me.value === null) {
    await new Promise<void>((resolve) => {
      const stop = watch(me, (value) => {
        if (value === null) return
        stop()
        resolve()
      })
    })
  }
  restored.value = restoreOf(
    copyKey.value === null ? null : readWorkingCopy(storage, copyKey.value),
    { version: read.entry.version, markdown: saved.value },
  )
  if (restored.value.kind === 'same') text.value = restored.value.markdown
}

function follow(read: Output<'get_entry'> | undefined) {
  if (read === undefined || forcing) return
  const current = entry.value
  if (read.entry === undefined || current === null || shown !== read.entry.id) {
    void show(read)
    return
  }
  if (read.entry.version === current.version) {
    entry.value = { ...read.entry, markdown: current.markdown }
    related.value = read.related ?? []
    if (!dirty.value) verdict.value = read.entry.verdict
    return
  }
  if (!dirty.value && saveState.value === 'saved') void show(read)
}

watch(() => entryQuery.data.value, follow, { immediate: true, flush: 'sync' })

async function load() {
  forcing = true
  try {
    const { data } = await entryQuery.refetch()
    if (data !== undefined) await show(data)
  } finally {
    forcing = false
  }
}

function report(error: unknown, heading: string) {
  const description = error instanceof ApiError ? `${error.message} ${error.fix}` : String(error)
  toast.add({ title: heading, description, color: 'error' })
}

let saving: Promise<boolean> | null = null

async function persist(): Promise<boolean> {
  if (entry.value === null || !dirty.value || !writable.value) return true
  if (holdsSave(pendingReview.value, overrideReview.value)) {
    heldOpen.value = true
    return false
  }
  const sent = text.value
  saveState.value = 'saving'
  try {
    const answer = await api.call('update_draft', {
      id: entry.value.id,
      version: entry.value.version,
      markdown: sent,
    })
    switch (answer.outcome) {
      case 'saved':
      case 'unchanged': {
        const stored = answer.markdown ?? sent
        if (answer.entry !== undefined) entry.value = { ...entry.value, ...answer.entry }
        if (answer.verdict !== undefined) verdict.value = answer.verdict
        saved.value = stored
        if (text.value === sent) text.value = stored
        saveState.value = text.value === saved.value ? 'saved' : 'unsaved'
        if (saveState.value === 'saved') {
          firstChange = null
          restored.value = { kind: 'none' }
          if (copyKey.value !== null) copies.drop(copyKey.value)
        }
        return true
      }
      case 'conflict':
        saveState.value = 'failed'
        conflictOpen.value = true
        return false
      case 'refused':
        saveState.value = 'failed'
        verdict.value = answer.verdict ?? verdict.value
        toast.add({
          title: m.value.entry.notSaved,
          description: m.value.entry.seeContracts,
          color: 'error',
        })
        return false
      case 'not_found':
        missing.value = true
        return false
    }
  } catch (error) {
    saveState.value = 'failed'
    report(error, m.value.entry.notSaved)
    return false
  }
}

function save(): Promise<boolean> {
  saving ??= persist().finally(() => {
    saving = null
  })
  return saving
}

let autosave: ReturnType<typeof setTimeout> | undefined
let validation: ReturnType<typeof setTimeout> | undefined
let firstChange: number | null = null
watch(text, (markdown) => {
  clearTimeout(autosave)
  clearTimeout(validation)
  if (markdown === saved.value) {
    if (saveState.value === 'unsaved') saveState.value = 'saved'
    firstChange = null
    if (
      copyKey.value !== null &&
      entry.value !== null &&
      !isOlderCopy(readWorkingCopy(storage, copyKey.value), entry.value.version)
    ) {
      copies.drop(copyKey.value)
    } else {
      copies.cancel()
    }
    return
  }
  saveState.value = 'unsaved'
  const now = Date.now()
  firstChange ??= now
  autosave = setTimeout(() => void save(), saveDelay(firstChange, now))
  if (copyKey.value !== null) {
    copies.keep(copyKey.value, () =>
      entry.value === null ? null : { markdown, version: entry.value.version },
    )
  }
  validation = setTimeout(async () => {
    verdict.value = (await api.call('validate', { ...ref_.value, markdown })).verdict
  }, 600)
})

async function saveBeforeLeaving() {
  clearTimeout(autosave)
  if (dirty.value) await save()
  return true
}
onBeforeRouteLeave(saveBeforeLeaving)
onBeforeRouteUpdate((to, from) => (to.path === from.path ? true : saveBeforeLeaving()))

function discardChange() {
  clearTimeout(autosave)
  heldOpen.value = false
  text.value = saved.value
  saveState.value = 'saved'
  firstChange = null
  restored.value = { kind: 'none' }
  if (copyKey.value !== null) copies.drop(copyKey.value)
}

function restoreOlder() {
  if (restored.value.kind === 'older') text.value = restored.value.markdown
  restored.value = { kind: 'none' }
}

function saveWhenHidden() {
  if (document.visibilityState === 'hidden' && dirty.value) void save()
}
document.addEventListener('visibilitychange', saveWhenHidden)

async function saveOverReview() {
  overrideReview.value = true
  heldOpen.value = false
  const held = pendingReview.value
  if ((await save()) && held !== null) savedOver.value = held.id
}

function openReview() {
  if (pendingReview.value === null) return
  const link = reviewLink(pendingReview.value)
  discardChange()
  void router.push(link)
}

function setBody(next: string) {
  text.value = withBody(text.value, next)
}

async function previewOnSite() {
  if (entry.value === null) return
  if (dirty.value && !(await save())) return
  const tabOpenedBeforeAnyAwait = window.open('', '_blank')
  if (tabOpenedBeforeAnyAwait !== null) tabOpenedBeforeAnyAwait.opener = null
  try {
    const result = await openPreview(api, entry.value.id, (url) => {
      if (tabOpenedBeforeAnyAwait === null) window.open(url, '_blank', 'noopener')
      else tabOpenedBeforeAnyAwait.location.replace(url)
    })
    if (result !== 'opened') tabOpenedBeforeAnyAwait?.close()
    toast.add(
      result === 'opened'
        ? {
            title: m.value.entry.previewOpened,
            description: m.value.entry.previewOpenedBody,
            color: 'success',
          }
        : {
            title: m.value.entry.notPreviewed,
            description: m.value.entry.previewNoUrl,
            color: 'warning',
          },
    )
  } catch (error) {
    tabOpenedBeforeAnyAwait?.close()
    report(error, m.value.entry.notPreviewed)
  }
}

async function publish(acknowledged: readonly Warning[] = [], at?: string) {
  if (entry.value === null) return
  acknowledgeOpen.value = false
  scheduleOpen.value = false
  if (dirty.value && !(await save())) return
  busy.value = true
  try {
    const answer = await api.call('publish', {
      id: entry.value.id,
      version: entry.value.version,
      acknowledgeWarnings: acknowledged.map(({ contract, path }) => ({ contract, path })),
      ...(at === undefined ? {} : { publishAt: at }),
    })
    switch (answer.outcome) {
      case 'published':
        await load()
        toast.add({ title: m.value.entry.published, color: 'success' })
        break
      case 'scheduled':
        await load()
        toast.add({
          title: m.value.entry.scheduled,
          description: m.value.entry.publishedAt(
            formatDateTime(answer.entry?.scheduledAt ?? at ?? ''),
          ),
          color: 'info',
        })
        break
      case 'pending_review':
        toast.add({
          title: m.value.entry.sentForReview,
          description: m.value.entry.reviewNext,
          color: 'info',
        })
        break
      case 'needs_acknowledgement':
        warnings.value = answer.verdict?.warnings ?? []
        pendingAt = at
        acknowledgeOpen.value = true
        break
      case 'blocked':
        verdict.value = answer.verdict ?? verdict.value
        setQuery('panel', null)
        toast.add({
          title: m.value.entry.blocked,
          description: m.value.entry.fixErrors,
          color: 'error',
        })
        break
      case 'conflict':
        conflictOpen.value = true
        break
      case 'not_found':
        await load()
        break
    }
  } catch (error) {
    report(error, at === undefined ? m.value.entry.notPublished : m.value.entry.notScheduled)
  } finally {
    busy.value = false
  }
}

async function openSchedule(mode: 'publish' | 'unpublish' = 'publish') {
  if (mode === 'publish' && dirty.value && !(await save())) return
  scheduleMode.value = mode
  const soon = new Date(Date.now() + 3_600_000)
  soon.setSeconds(0, 0)
  publishAt.value = new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
  scheduleOpen.value = true
}

const scheduleError = computed(() => {
  const at = Date.parse(publishAt.value)
  if (Number.isNaN(at)) return m.value.entry.pickDateTime
  return at <= Date.now() ? m.value.entry.pickFuture : null
})

async function openMove() {
  if (entry.value === null) return
  if (dirty.value && !(await save())) return
  newSlug.value = entry.value.slug
  moveOpen.value = true
}

async function move() {
  if (entry.value === null) return
  busy.value = true
  try {
    const answer = await api.call('move_entry', {
      id: entry.value.id,
      version: entry.value.version,
      slug: newSlug.value,
    })
    switch (answer.outcome) {
      case 'moved':
      case 'unchanged':
        moveOpen.value = false
        toast.add({ title: m.value.entry.moved, color: 'success' })
        if (answer.entry !== undefined) await router.replace(entryPath(answer.entry))
        break
      case 'taken':
        toast.add({
          title: m.value.entry.notMoved,
          description: m.value.entry.slugTaken,
          color: 'error',
        })
        break
      case 'conflict':
        moveOpen.value = false
        conflictOpen.value = true
        break
      case 'not_found':
        missing.value = true
        break
    }
  } catch (error) {
    report(error, m.value.entry.notMoved)
  } finally {
    busy.value = false
  }
}

async function scheduleUnpublish(at: string | null) {
  if (entry.value === null) return
  busy.value = true
  scheduleOpen.value = false
  try {
    const answer = await api.call('schedule_unpublish', { id: entry.value.id, unpublishAt: at })
    await load()
    toast.add({
      title:
        answer.outcome === 'scheduled'
          ? m.value.entry.unpublishScheduled
          : answer.outcome === 'unpublished'
            ? m.value.entry.unpublished
            : m.value.entry.unpublishKept,
      color: 'success',
    })
  } catch (error) {
    report(error, m.value.entry.notScheduledUnpublish)
  } finally {
    busy.value = false
  }
}

async function unpublish() {
  if (entry.value === null) return
  const wasScheduled = entry.value.status === 'scheduled'
  busy.value = true
  unpublishOpen.value = false
  try {
    await api.call('unpublish', { id: entry.value.id })
    await load()
    toast.add({
      title: wasScheduled ? m.value.entry.scheduleCancelled : m.value.entry.unpublished,
      description: m.value.entry.draftAgain,
      color: 'success',
    })
  } catch (error) {
    report(error, wasScheduled ? m.value.entry.notCancelled : m.value.entry.notUnpublished)
  } finally {
    busy.value = false
  }
}

async function trash() {
  if (entry.value === null) return
  busy.value = true
  trashOpen.value = false
  try {
    const answer = await api.call('delete_entry', {
      id: entry.value.id,
      version: entry.value.version,
    })
    switch (answer.outcome) {
      case 'trashed':
        saved.value = text.value
        toast.add({
          title: m.value.entry.trashed,
          description: m.value.entry.trashedBody,
          color: 'success',
        })
        await router.push({ path: '/entries', query: { collection: props.collection } })
        break
      case 'conflict':
        conflictOpen.value = true
        break
      case 'published':
      case 'not_found':
        await load()
        toast.add({ title: m.value.entry.notTrashed, color: 'error' })
        break
    }
  } catch (error) {
    report(error, m.value.entry.notTrashed)
  } finally {
    busy.value = false
  }
}

async function reloadTheirs() {
  conflictOpen.value = false
  await load()
}

async function check() {
  verdict.value = (await api.call('validate', { ...ref_.value, markdown: text.value })).verdict
  setQuery('panel', null)
}

function toggleSource() {
  if (!lossy.value) setQuery('view', source.value ? null : 'markdown')
}

function openMarkdown() {
  if (!source.value) toggleSource()
}

function showPanel(next: 'properties' | 'history') {
  const closing = panelOpen.value && panel.value === next
  if (narrow.value) setQuery('panel', closing ? null : next)
  else setQuery('panel', closing ? 'none' : next === 'history' ? 'history' : null)
}

defineShortcuts({
  meta_s: { usingInput: true, handler: () => void save() },
  meta_shift_m: { usingInput: true, handler: toggleSource },
  meta_shift_i: { usingInput: true, handler: () => showPanel('properties') },
  meta_shift_h: { usingInput: true, handler: () => showPanel('history') },
})

watchEffect(() => {
  const current = entry.value
  openEntry.value =
    current === null
      ? null
      : {
          status: current.status,
          canPublish: canPublish.value,
          source: source.value,
          lossy: lossy.value,
          canPreview: canPreviewOnSite.value,
          publish: () => void publish(),
          schedule: () => void openSchedule('publish'),
          toggleSource,
          preview: () => void previewOnSite(),
        }
})
onBeforeUnmount(() => {
  openEntry.value = null
  document.removeEventListener('visibilitychange', saveWhenHidden)
})

const more = computed<DropdownMenuItem[][]>(() => {
  const current = entry.value
  if (current === null) return []
  return [
    [
      ...(current.status === 'draft'
        ? [
            {
              label: m.value.entry.schedule,
              icon: 'i-lucide-calendar-clock',
              onSelect: () => void openSchedule('publish'),
            },
          ]
        : []),
      ...(current.status === 'published' && current.unpublishAt === null
        ? [
            {
              label: m.value.entry.unpublishLater,
              icon: 'i-lucide-calendar-x',
              onSelect: () => void openSchedule('unpublish'),
            },
          ]
        : []),
      ...(current.status !== 'draft'
        ? [
            {
              label:
                current.status === 'scheduled'
                  ? m.value.entry.cancelSchedule
                  : m.value.entry.unpublish,
              icon: 'i-lucide-eye-off',
              onSelect: () => {
                unpublishOpen.value = true
              },
            },
          ]
        : []),
    ],
    [
      {
        label: m.value.entry.changeUrl,
        icon: 'i-lucide-link',
        onSelect: () => void openMove(),
      },
      {
        label: m.value.entry.previewOnSite,
        icon: 'i-lucide-eye',
        disabled: !canPreviewOnSite.value,
        onSelect: () => void previewOnSite(),
      },
      ...(liveUrl.value !== null
        ? [
            {
              label: m.value.entry.viewOnSite,
              icon: 'i-lucide-external-link',
              to: liveUrl.value,
              target: '_blank',
            },
          ]
        : []),
      {
        label: m.value.entry.validate,
        icon: 'i-lucide-list-checks',
        onSelect: () => void check(),
      },
      {
        label: source.value ? m.value.entry.editVisually : m.value.entry.viewMarkdown,
        icon: source.value ? 'i-lucide-pen-line' : 'i-lucide-code',
        kbds: ['meta', 'shift', 'm'],
        disabled: lossy.value,
        onSelect: toggleSource,
      },
    ],
    ...(current.status === 'draft'
      ? [
          [
            {
              label: m.value.entry.moveToTrash,
              icon: 'i-lucide-trash-2',
              color: 'error' as const,
              onSelect: () => {
                trashOpen.value = true
              },
            },
          ],
        ]
      : []),
  ]
})

const stateLabel = computed(
  () =>
    ({
      saved: m.value.entry.savedState,
      saving: m.value.entry.saving,
      unsaved: m.value.entry.unsavedState,
      failed: m.value.entry.notSaved,
    })[saveState.value],
)
</script>

<template>
  <UDashboardPanel
    id="main"
    role="main"
    tabindex="-1"
    class="focus:outline-none"
    :class="entry !== null && panelOpen ? 'max-sm:hidden' : undefined"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <UDashboardNavbar
        :title="entry === null ? m.entry.title : titleOf(entry)"
        :ui="{ title: 'text-sm font-medium truncate' }"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
          <nav
            :aria-label="m.nav.breadcrumb"
            class="flex min-w-0 items-center gap-1 text-sm text-muted max-sm:hidden"
          >
            <ULink to="/entries" class="hover:text-highlighted">{{ m.nav.entries }}</ULink>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-dimmed" />
            <ULink
              :to="{ path: '/entries', query: { collection } }"
              class="font-mono hover:text-highlighted"
              >{{ collection }}</ULink
            >
            <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-dimmed" />
            <span class="font-mono">{{ locale }}</span>
            <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-dimmed" />
          </nav>
        </template>
        <template v-if="entry !== null" #right>
          <span
            class="hidden items-center gap-1.5 text-xs sm:flex"
            :class="
              saveState === 'failed'
                ? 'text-error'
                : saveState === 'unsaved'
                  ? 'text-warning'
                  : 'text-muted'
            "
            role="status"
          >
            <UIcon
              :name="
                saveState === 'saving'
                  ? 'i-lucide-loader-circle'
                  : saveState === 'saved'
                    ? 'i-lucide-cloud-check'
                    : 'i-lucide-circle-dot'
              "
              :class="['size-3.5', saveState === 'saving' ? 'animate-spin' : '']"
            />
            {{ stateLabel }}
          </span>
          <UTooltip
            :text="source ? m.entry.editVisually : m.entry.viewMarkdown"
            :kbds="['meta', 'shift', 'm']"
          >
            <UButton
              :icon="source ? 'i-lucide-pen-line' : 'i-lucide-code'"
              color="neutral"
              variant="ghost"
              :aria-label="source ? m.entry.editVisually : m.entry.viewMarkdown"
              :aria-pressed="source"
              :disabled="lossy"
              @click="toggleSource"
            />
          </UTooltip>
          <UTooltip :text="m.entry.properties" :kbds="['meta', 'shift', 'i']">
            <UButton
              icon="i-lucide-panel-right"
              color="neutral"
              :variant="panelOpen && panel === 'properties' ? 'soft' : 'ghost'"
              :aria-label="m.entry.properties"
              :aria-pressed="panelOpen && panel === 'properties'"
              @click="showPanel('properties')"
            />
          </UTooltip>
          <UDropdownMenu :items="more" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              :aria-label="m.entry.more"
            />
          </UDropdownMenu>
          <UButton
            v-if="writable"
            :label="m.entry.publish"
            color="secondary"
            :loading="busy"
            :disabled="!canPublish"
            @click="publish()"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <p v-if="missing" class="p-8 text-muted">{{ m.entry.missing }}</p>
      <div v-else-if="entry !== null" class="mx-auto w-full max-w-3xl py-10 pe-6">
        <UAlert
          v-if="lossy"
          :description="m.editor.lossy"
          icon="i-lucide-file-code-2"
          color="warning"
          variant="subtle"
          class="mb-6 ms-16"
        />
        <UAlert
          v-if="restored.kind === 'same'"
          :title="m.entry.restored"
          icon="i-lucide-history"
          color="neutral"
          variant="subtle"
          class="mb-6 ms-16"
          :actions="[
            { label: m.entry.discardRestored, variant: 'outline', onClick: discardChange },
          ]"
        />
        <UAlert
          v-else-if="restored.kind === 'older'"
          :title="m.entry.olderCopy(restored.version, entry.version)"
          icon="i-lucide-history"
          color="warning"
          variant="subtle"
          class="mb-6 ms-16"
          :actions="[
            { label: m.entry.restoreOlder, variant: 'outline', onClick: restoreOlder },
            { label: m.entry.discardRestored, variant: 'ghost', onClick: discardChange },
          ]"
        />
        <UAlert
          v-if="!writable"
          :title="m.entry.readOnly"
          icon="i-lucide-eye"
          color="neutral"
          variant="subtle"
          class="mb-6 ms-16"
        />
        <UAlert
          v-if="pendingReview !== null"
          :title="
            m.entry.reviewPending(
              pendingReview.requestedByName ?? m.entry.someone,
              formatDateTime(pendingReview.requestedAt),
            )
          "
          :description="m.entry.reviewPendingNote"
          icon="i-lucide-inbox"
          color="neutral"
          variant="subtle"
          class="mb-6 ms-16"
          :actions="[{ label: m.entry.reviewIt, variant: 'outline', onClick: openReview }]"
        />
        <textarea
          v-if="hasTitle"
          v-model="title"
          rows="1"
          :readonly="!writable"
          :aria-label="m.entry.titleLabel"
          :placeholder="m.entry.untitled"
          class="field-sizing-content w-full resize-none ps-16 bg-transparent text-3xl leading-tight font-semibold text-highlighted outline-none placeholder:text-dimmed"
          @keydown.enter.prevent
        />
        <div class="mt-4">
          <MarkdownEditor
            v-if="source"
            v-model="text"
            :diagnostics="diagnostics"
            :readonly="!writable"
          />
          <EntryEditor
            v-else
            :body="body"
            :components="components"
            :readonly="!writable"
            @update:body="setBody"
            @lossy="lossy = true"
          />
        </div>
      </div>
      <p v-else class="p-8 text-muted">{{ m.common.loading }}</p>
    </template>
  </UDashboardPanel>

  <UDashboardPanel
    v-if="entry !== null && panelOpen"
    id="entry-panel"
    role="complementary"
    :aria-label="panel === 'history' ? m.entry.tabs.history : m.entry.properties"
    :default-size="26"
    :min-size="20"
    :max-size="40"
    resizable
    class="border-l border-default"
    :ui="{ body: 'gap-6' }"
  >
    <template #header>
      <UDashboardNavbar :ui="{ title: 'text-sm' }">
        <template #title>
          <UTabs
            :model-value="panel"
            :items="[
              { label: m.entry.properties, value: 'properties' },
              { label: m.entry.tabs.history, value: 'history' },
            ]"
            :content="false"
            variant="link"
            size="sm"
            @update:model-value="
              (value) =>
                setQuery('panel', value === 'history' ? 'history' : narrow ? 'properties' : null)
            "
          />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            class="sm:hidden"
            :aria-label="m.entry.closePanel"
            @click="showPanel(panel)"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <RevisionHistory
        v-if="panel === 'history'"
        :entry-id="entry.id"
        :version="entry.version"
        :latest="saved"
        :dirty="dirty"
        @restored="load"
        @conflict="conflictOpen = true"
      />
      <template v-else>
        <dl class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
          <dt class="text-muted">{{ m.entry.status }}</dt>
          <dd class="flex flex-wrap items-center gap-1.5">
            <UBadge
              :label="m.status[entry.status]"
              :color="STATUS_COLOR[entry.status]"
              variant="subtle"
            />
            <UBadge
              v-if="entry.status === 'published' && entry.hasUnpublishedChanges"
              :label="m.entry.unpublishedChanges"
              color="warning"
              variant="outline"
            />
            <span v-if="entry.scheduledAt !== null" class="text-xs text-muted">{{
              m.entry.publishes(formatDateTime(entry.scheduledAt))
            }}</span>
          </dd>
          <template v-if="entry.unpublishAt !== null">
            <dt class="text-muted">{{ m.entry.leavesLabel }}</dt>
            <dd class="flex flex-wrap items-center gap-1.5">
              <UBadge
                :label="m.entry.leaves(formatDateTime(entry.unpublishAt))"
                color="warning"
                variant="outline"
                icon="i-lucide-calendar-x"
              />
              <UButton
                :label="m.entry.keepPublished"
                size="xs"
                variant="ghost"
                :loading="busy"
                @click="scheduleUnpublish(null)"
              />
            </dd>
          </template>
          <dt class="text-muted">{{ m.entry.url }}</dt>
          <dd class="flex min-w-0 items-center gap-1">
            <span class="truncate font-mono text-xs">{{ entry.slug }}</span>
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              variant="ghost"
              color="neutral"
              :aria-label="m.entry.changeUrl"
              @click="openMove"
            />
          </dd>
          <dt class="text-muted">{{ m.entry.translations }}</dt>
          <dd>
            <nav :aria-label="m.entry.translations" class="flex flex-wrap items-center gap-1.5">
              <template v-if="entry.translationGroup !== null">
                <template v-for="other in translations" :key="other.id">
                  <span
                    v-if="other.id === entry.id"
                    aria-current="page"
                    class="rounded-md bg-elevated px-2 py-0.5 font-mono text-xs text-highlighted"
                    >{{ other.locale }}</span
                  >
                  <RouterLink
                    v-else
                    :to="entryPath(other)"
                    :aria-label="`${other.locale} · ${titleOf(other)}`"
                    class="rounded-md border border-default px-2 py-0.5 font-mono text-xs hover:bg-elevated"
                    >{{ other.locale }}</RouterLink
                  >
                </template>
                <UButton
                  v-for="other in untranslated"
                  :key="other"
                  :to="{
                    path: '/entries/new',
                    query: {
                      collection: entry.collection,
                      locale: other,
                      group: entry.translationGroup,
                    },
                  }"
                  :label="m.entry.translateTo(other)"
                  icon="i-lucide-plus"
                  size="xs"
                  variant="ghost"
                />
              </template>
              <span v-else class="font-mono text-xs">{{ entry.locale }}</span>
              <UBadge
                v-if="entry.translationOutdated === true"
                :label="m.entry.translationBehind"
                color="warning"
                variant="outline"
                icon="i-lucide-languages"
                class="max-w-full"
                :ui="{ label: 'whitespace-normal' }"
              />
              <SourceChanges
                v-if="entry.translationOutdated === true && original !== undefined"
                :source="original"
                :revision="entry.revision"
              />
            </nav>
          </dd>
          <dt class="text-muted">{{ m.entry.versionLabel }}</dt>
          <dd class="font-mono text-xs text-muted">{{ m.entry.version(entry.version) }}</dd>
        </dl>

        <section :aria-labelledby="'fields'" class="space-y-3">
          <h2 id="fields" class="text-xs font-semibold tracking-wide text-muted uppercase">
            {{ m.entry.tabs.fields }}
          </h2>
          <fieldset :disabled="!writable" class="contents">
            <FrontmatterForm
              v-model="text"
              :schema="definition?.schema ?? {}"
              :omit="hasTitle ? ['title'] : []"
              :references="references ?? {}"
              @markdown="openMarkdown"
            />
          </fieldset>
        </section>

        <section :aria-labelledby="'checks'" class="space-y-3">
          <h2
            id="checks"
            class="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase"
          >
            {{ m.entry.tabs.checks }}
            <UBadge
              v-if="checks.errors > 0"
              :label="String(checks.errors)"
              color="error"
              variant="subtle"
              size="sm"
            />
            <UBadge
              v-if="checks.warnings > 0"
              :label="String(checks.warnings)"
              color="warning"
              variant="subtle"
              size="sm"
            />
          </h2>
          <VerdictList :verdict="verdict" />
        </section>

        <section :aria-labelledby="'related'" class="space-y-2">
          <h2 id="related" class="text-xs font-semibold tracking-wide text-muted uppercase">
            {{ m.entry.tabs.related }}
          </h2>
          <p v-if="related.length === 0" class="text-sm text-muted">{{ m.entry.noRelated }}</p>
          <RouterLink
            v-for="other in related"
            :key="other.id"
            :to="entryPath(other)"
            class="block rounded-md border border-default px-3 py-2 text-sm hover:bg-elevated"
          >
            <span class="font-medium">{{ titleOf(other) }}</span>
            <span class="block font-mono text-xs text-muted">{{ other.slug }}</span>
          </RouterLink>
        </section>
      </template>
    </template>
  </UDashboardPanel>

  <template v-if="entry !== null">
    <UModal v-model:open="moveOpen" :title="m.entry.moveTitle">
      <template #body>
        <UFormField :label="m.entry.newSlug" :help="m.entry.moveHelp">
          <UInput v-model="newSlug" class="w-full font-mono" />
        </UFormField>
      </template>
      <template #footer>
        <UButton :label="m.common.cancel" variant="ghost" @click="moveOpen = false" />
        <UButton
          :label="m.entry.changeUrl"
          :loading="busy"
          :disabled="!slugValid || newSlug === entry.slug"
          @click="move"
        />
      </template>
    </UModal>

    <UModal v-model:open="heldOpen" :title="m.entry.heldTitle" :dismissible="false">
      <template #body>
        <p>{{ m.entry.heldBody(pendingReview?.requestedByName ?? m.entry.someone) }}</p>
      </template>
      <template #footer>
        <UButton :label="m.entry.discardChange" variant="ghost" @click="discardChange" />
        <UButton :label="m.entry.reviewIt" variant="outline" @click="openReview" />
        <UButton :label="m.entry.saveOverReview" color="warning" @click="saveOverReview" />
      </template>
    </UModal>

    <UModal v-model:open="conflictOpen" :title="m.entry.conflictTitle">
      <template #body>
        <p>{{ m.entry.conflictBody }}</p>
      </template>
      <template #footer>
        <UButton :label="m.entry.keepEditing" variant="ghost" @click="conflictOpen = false" />
        <UButton :label="m.entry.loadNewer" color="warning" @click="reloadTheirs" />
      </template>
    </UModal>

    <UModal v-model:open="acknowledgeOpen" :title="m.entry.acknowledgeTitle">
      <template #body>
        <ul class="space-y-2 text-sm">
          <li v-for="(warning, index) in warnings" :key="index">
            <span class="font-mono text-xs text-muted">{{ warning.contract }}</span>
            <p>{{ warning.message }}</p>
            <p class="text-muted">{{ warning.fix }}</p>
          </li>
        </ul>
      </template>
      <template #footer>
        <UButton :label="m.common.cancel" variant="ghost" @click="acknowledgeOpen = false" />
        <UButton
          :label="pendingAt === undefined ? m.entry.publishAnyway : m.entry.scheduleAnyway"
          color="warning"
          @click="publish(warnings, pendingAt)"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="unpublishOpen"
      :title="entry.status === 'scheduled' ? m.entry.cancelScheduleTitle : m.entry.unpublishTitle"
    >
      <template #body>
        <p v-if="entry.status === 'scheduled'">
          {{ m.entry.notPublishedAt(formatDateTime(entry.scheduledAt ?? '')) }}
        </p>
        <p v-else>{{ m.entry.unpublishBody }}</p>
      </template>
      <template #footer>
        <UButton :label="m.common.keepIt" variant="ghost" @click="unpublishOpen = false" />
        <UButton
          :label="entry.status === 'scheduled' ? m.entry.cancelTheSchedule : m.entry.unpublish"
          color="error"
          @click="unpublish"
        />
      </template>
    </UModal>

    <UModal v-model:open="trashOpen" :title="m.entry.trashTitle">
      <template #body>
        <p>{{ m.entry.trashBody }}</p>
      </template>
      <template #footer>
        <UButton :label="m.common.keepIt" variant="ghost" @click="trashOpen = false" />
        <UButton :label="m.entry.moveToTrash" color="error" @click="trash" />
      </template>
    </UModal>

    <UModal
      v-model:open="scheduleOpen"
      :title="scheduleMode === 'publish' ? m.entry.scheduleTitle : m.entry.unpublishAtTitle"
    >
      <template #body>
        <UFormField
          :label="scheduleMode === 'publish' ? m.entry.publishAt : m.entry.unpublishAt"
          :help="scheduleMode === 'publish' ? m.entry.publishAtHelp : m.entry.unpublishAtHelp"
          :error="scheduleError ?? undefined"
        >
          <UInput v-model="publishAt" type="datetime-local" class="w-full" />
        </UFormField>
      </template>
      <template #footer>
        <UButton :label="m.common.cancel" variant="ghost" @click="scheduleOpen = false" />
        <UButton
          :label="scheduleMode === 'publish' ? m.entry.schedule : m.entry.unpublishLater"
          :disabled="scheduleError !== null"
          @click="
            scheduleMode === 'publish'
              ? publish([], new Date(publishAt).toISOString())
              : scheduleUnpublish(new Date(publishAt).toISOString())
          "
        />
      </template>
    </UModal>
  </template>
</template>
