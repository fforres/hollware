<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { refDebounced, useDocumentVisibility, useIntervalFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { defineShortcuts } from '@nuxt/ui/composables'
import ShortcutsHelp from './components/ShortcutsHelp.vue'
import { currentLocale, LANGUAGES, setLocale, uiLocale, useMessages } from './i18n/index.ts'
import { commandGroups } from './lib/commands.ts'
import { me, useSiteMenu, type Me } from './lib/me.ts'
import { openEntry } from './lib/open-entry.ts'
import { admin, operation } from './lib/queries.ts'
import { settingsGroups } from './lib/settings.ts'
import { api, auth } from './lib/session.ts'

const route = useRoute()
const m = useMessages()
const signed = computed(() => route.matched.length > 0 && route.meta['open'] !== true)

const meQuery = useQuery({ ...admin<Me>('me'), enabled: signed })
watch(
  () => meQuery.data.value,
  (read) => {
    if (read !== undefined) me.value = read
  },
  { immediate: true },
)

const waitingQuery = useQuery({
  ...operation('list_reviews', { status: 'pending', limit: 50 }),
  enabled: signed,
})
const siteQuery = useQuery({ ...operation('describe_site', {}), enabled: signed })
const pending = computed(() => waitingQuery.data.value?.reviews.length ?? 0)
const collections = computed(
  () => siteQuery.data.value?.site.collections.map((collection) => collection.name) ?? [],
)

const visibility = useDocumentVisibility()
useIntervalFn(() => {
  if (signed.value && visibility.value === 'visible') void waitingQuery.refetch()
}, 30_000)

const roleKey = computed(
  () => me.value?.sites.find((membership) => membership.site === me.value?.site)?.role ?? '',
)
const role = computed(() => m.value.roles[roleKey.value] ?? roleKey.value)

const siteItems = useSiteMenu()

const inSettings = computed(() => route.path.startsWith('/settings'))
const settingsLinks = computed<NavigationMenuItem[][]>(() =>
  settingsGroups(me.value?.scopes ?? []).map((group) => [
    { label: m.value.settings.groups[group.key], type: 'label' },
    ...group.sections.map((section) => ({
      label: m.value.settings.sections[section.key],
      icon: section.icon,
      to: section.to,
      exact: section.exact,
    })),
  ]),
)

const links = computed<NavigationMenuItem[][]>(() => [
  [
    { label: m.value.nav.home, icon: 'i-lucide-house', to: '/', exact: true },
    {
      label: m.value.nav.reviews,
      icon: 'i-lucide-inbox',
      to: '/reviews',
      ...(pending.value > 0 ? { badge: String(pending.value) } : {}),
    },
    {
      label: m.value.nav.entries,
      icon: 'i-lucide-file-text',
      to: '/entries',
      active: route.path === '/entries' && route.query['collection'] === undefined,
    },
    { label: m.value.nav.images, icon: 'i-lucide-image', to: '/images' },
  ],
  [
    { label: m.value.nav.collections, type: 'label' },
    ...collections.value.map((name) => ({
      label: name,
      icon: 'i-lucide-layers',
      to: { path: '/entries', query: { collection: name } },
      active: route.path === '/entries' && route.query['collection'] === name,
    })),
  ],
  [
    {
      label: m.value.nav.settings,
      icon: 'i-lucide-settings',
      to: '/settings',
    },
  ],
])

const shortcutsOpen = ref(false)
const router = useRouter()
defineShortcuts({
  c: () => void router.push('/entries/new'),
  'g-h': () => void router.push('/'),
  'g-e': () => void router.push('/entries'),
  'g-r': () => void router.push('/reviews'),
  'g-i': () => void router.push('/images'),
  'g-s': () => void router.push('/settings'),
  '?': () => {
    shortcutsOpen.value = true
  },
})

const searchOpen = ref(false)
const term = ref('')
const query = refDebounced(
  computed(() => term.value.trim()),
  250,
)
const foundQuery = useQuery(() => ({
  ...operation('search', { query: query.value, limit: 8 }),
  enabled: query.value.length >= 2,
}))
const found = computed(() =>
  query.value.length >= 2 ? (foundQuery.data.value?.results ?? []) : [],
)
const searching = computed(() => foundQuery.isLoading.value)
const draftsQuery = useQuery(() => ({
  key: ['drafts', ...collections.value],
  query: async () =>
    (
      await Promise.all(
        collections.value.map((collection) =>
          api.call('list_entries', { collection, status: 'draft', limit: 100 }),
        ),
      )
    ).flatMap((list) => list.entries),
  enabled: searchOpen.value && collections.value.length > 0,
}))

const searchGroups = computed(() =>
  commandGroups(
    {
      query: term.value,
      site: me.value?.site ?? null,
      role: roleKey.value === '' ? null : roleKey.value,
      scopes: me.value?.scopes ?? [],
      sites: me.value?.sites ?? [],
      collections: collections.value,
      entry: openEntry.value,
      found: found.value,
      drafts: draftsQuery.data.value ?? [],
      waiting: waitingQuery.data.value?.reviews ?? [],
      switchSite: (site) => void auth.switchSite(site, '/admin/'),
    },
    m.value,
  ),
)

const personItems = computed<DropdownMenuItem[][]>(() => [
  [
    {
      label: me.value?.user?.name ?? m.value.person.you,
      description: m.value.person.roleOf(role.value, me.value?.site ?? ''),
      type: 'label',
    },
  ],
  [
    { label: m.value.person.account, icon: 'i-lucide-circle-user', to: '/settings/account' },
    { label: m.value.nav.settings, icon: 'i-lucide-settings', to: '/settings' },
    {
      label: m.value.shortcuts.title,
      icon: 'i-lucide-keyboard',
      kbds: ['?'],
      onSelect: () => {
        shortcutsOpen.value = true
      },
    },
    {
      label: m.value.person.language,
      icon: 'i-lucide-languages',
      children: [
        LANGUAGES.map(({ locale, name }) => ({
          label: name,
          type: 'checkbox' as const,
          checked: currentLocale.value === locale,
          onSelect: () => setLocale(locale),
        })),
      ],
    },
  ],
  [
    {
      label: m.value.person.signOut,
      icon: 'i-lucide-log-out',
      onSelect: () => void auth.signOut(),
    },
  ],
])

const initial = computed(() => (me.value?.user?.name ?? '?').trim().charAt(0).toUpperCase())
</script>

<template>
  <UApp :locale="uiLocale">
    <RouterView v-if="route.meta['open'] === true" />
    <UDashboardGroup v-else unit="rem">
      <a
        href="#dashboard-panel-main"
        class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-default focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-highlighted focus:ring-2 focus:ring-primary"
        >{{ m.nav.skip }}</a
      >
      <UDashboardSidebar
        id="admin"
        role="navigation"
        :aria-label="m.nav.admin"
        collapsible
        resizable
        :default-size="15"
        :min-size="12"
        :max-size="22"
        class="bg-elevated/25"
        :ui="{ footer: 'border-t border-default' }"
      >
        <template #header="{ collapsed }">
          <UDropdownMenu :items="siteItems" :content="{ align: 'start' }" :ui="{ content: 'w-56' }">
            <UButton
              color="neutral"
              variant="ghost"
              block
              :square="collapsed"
              :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
              class="data-[state=open]:bg-elevated"
              :ui="{ trailingIcon: 'text-dimmed ms-auto' }"
              :aria-label="`${me?.site ?? 'Hollware'} · ${m.nav.site}`"
            >
              <svg
                viewBox="0 0 204 243"
                class="h-5 w-auto shrink-0 fill-secondary"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M109.3 17.8 C101.9 25.0 98.5 35.8 100.9 44.7 C102.3 49.9 108.5 57.8 114.2 61.7 C139.7 79.0 149.8 88.1 158.8 102.0 C167.7 115.8 173.7 137.1 172.5 150.5 C170.4 172.6 163.0 189.2 148.6 203.6 C137.8 214.3 126.3 221.1 112.9 224.5 C104.2 226.8 104.0 226.4 111.5 221.4 C119.6 216.2 123.8 212.3 128.5 206.0 C133.9 198.6 136.9 189.4 132.7 192.8 C129.7 195.3 117.7 201.0 115.5 201.0 C114.2 201.0 111.7 202.5 109.7 204.5 C105.3 208.9 103.4 208.9 101.6 204.5 C101.1 203.33 100.6 202.17 100.1 201.0 C97.13 201.0 94.17 201.0 91.2 201.0 C88.27 201.0 85.33 201.0 82.4 201.0 C81.83 202.17 81.27 203.33 80.7 204.5 C79.8 206.4 78.5 208.0 77.9 208.0 C77.2 208.0 75.0 206.2 73.0 204.0 C70.9 201.7 68.4 200.0 67.1 200.0 C64.1 200.0 53.0 195.3 50.4 192.9 C47.6 190.3 46.7 190.5 47.5 193.7 C49.8 203.2 61.9 216.2 74.3 222.7 C78.8 225.0 76.1 225.5 69.3 223.5 C44.9 216.4 23.5 195.2 17.6 172.3 C15.6 164.8 15.6 151.3 17.4 144.3 C20.6 132.5 32.0 117.3 42.1 111.4 C45.1 109.7 51.3 106.1 55.9 103.4 C60.4 100.7 65.8 97.0 67.7 95.1 C68.9 93.93 70.1 92.77 71.3 91.6 C71.07 93.2 70.83 94.8 70.6 96.4 C70.2 99.0 68.7 104.1 67.4 107.8 C60.6 125.7 64.4 137.8 78.3 142.5 C82.3 143.8 83.2 143.8 86.6 142.4 C88.8 141.5 92.4 139.0 94.8 136.7 C102.1 129.6 103.7 119.4 100.0 103.5 C97.4 92.6 92.8 83.5 84.6 73.5 C76.5 63.7 74.5 58.3 75.3 49.3 C76.6 35.8 89.3 21.7 105.4 16.0 C113.0 13.3 113.7 13.6 109.3 17.8 Z M137.2 151.8 C131.3 160.9 124.4 166.8 109.2 175.9 C100.9 180.9 100.3 181.5 102.1 183.7 C106.2 188.6 121.0 191.0 129.2 188.1 C138.2 185.1 145.0 174.2 145.0 163.0 C145.0 158.1 142.6 148.5 141.1 147.5 C140.6 147.3 138.8 149.1 137.2 151.8 Z M41.2 155.2 C38.6 162.7 38.5 164.9 40.6 171.9 C43.2 180.8 51.5 188.1 60.8 189.6 C69.1 190.9 81.0 186.3 81.0 181.7 C81.0 181.0 79.3 179.6 77.3 178.6 C68.6 174.5 54.8 163.8 50.4 157.8 C48.0 154.5 46.0 151.2 46.0 150.4 C46.0 149.6 45.4 149.0 44.7 149.0 C44.0 149.0 42.4 151.8 41.2 155.2 Z"
                />
              </svg>
              <span v-if="!collapsed" class="truncate font-semibold text-highlighted">{{
                me?.site ?? 'Hollware'
              }}</span>
            </UButton>
          </UDropdownMenu>
        </template>

        <template #default="{ collapsed }">
          <template v-if="inSettings">
            <UButton
              :label="collapsed ? undefined : m.settings.back"
              :aria-label="collapsed ? m.settings.back : undefined"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              :square="collapsed"
              block
              class="justify-start"
              to="/"
            />
            <UNavigationMenu
              v-for="(group, index) in settingsLinks"
              :key="index"
              as="div"
              :collapsed="collapsed"
              :items="group"
              orientation="vertical"
              tooltip
              popover
            />
          </template>
          <template v-else>
            <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />
            <UButton
              :label="collapsed ? undefined : m.entries.newEntry"
              :aria-label="collapsed ? m.entries.newEntry : undefined"
              icon="i-lucide-square-pen"
              color="neutral"
              variant="ghost"
              :square="collapsed"
              block
              class="justify-start"
              to="/entries/new"
            >
              <template v-if="!collapsed" #trailing>
                <UKbd value="C" class="ms-auto" />
              </template>
            </UButton>
            <UNavigationMenu
              v-for="(group, index) in links"
              :key="index"
              as="div"
              :collapsed="collapsed"
              :items="group"
              orientation="vertical"
              tooltip
              popover
              :class="index === links.length - 1 ? 'mt-auto' : undefined"
            />
          </template>
        </template>

        <template #footer="{ collapsed }">
          <UDropdownMenu
            :items="personItems"
            :content="{ align: 'start', side: 'top' }"
            :ui="{ content: 'w-56' }"
          >
            <UButton
              color="neutral"
              variant="ghost"
              block
              :square="collapsed"
              class="data-[state=open]:bg-elevated"
              :aria-label="collapsed ? `${me?.user?.name ?? m.person.you} · ${role}` : undefined"
            >
              <UAvatar :text="initial" size="2xs" aria-hidden="true" />
              <span v-if="!collapsed" class="truncate">{{ me?.user?.name ?? m.person.you }}</span>
              <span v-if="!collapsed" class="ms-auto font-mono text-xs text-muted">{{ role }}</span>
            </UButton>
          </UDropdownMenu>
        </template>
      </UDashboardSidebar>

      <UDashboardSearch
        v-model:open="searchOpen"
        v-model:search-term="term"
        :groups="searchGroups"
        :loading="searching"
        :color-mode="false"
        :placeholder="m.search.placeholder"
      />

      <RouterView />
      <ShortcutsHelp v-model:open="shortcutsOpen" />
    </UDashboardGroup>
  </UApp>
</template>
