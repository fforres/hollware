import type { DropdownMenuItem } from '@nuxt/ui'
import { computed, ref } from 'vue'
import { useMessages } from '../i18n/index.ts'
import { auth } from './session.ts'

export interface Me {
  readonly user: { readonly id: string; readonly name: string | null } | undefined
  readonly site: string
  readonly scopes: readonly string[]
  readonly sites: readonly { readonly site: string; readonly role: string }[]
}

export const me = ref<Me | null>(null)

export function can(person: Pick<Me, 'scopes'> | null, scope: string): boolean {
  return person?.scopes.includes(scope) ?? false
}

export function useSiteMenu() {
  const m = useMessages()
  return computed<DropdownMenuItem[][]>(() => [
    (me.value?.sites ?? []).map((membership) => ({
      label: membership.site,
      description: m.value.roles[membership.role] ?? membership.role,
      icon: 'i-lucide-globe',
      checked: membership.site === me.value?.site,
      type: 'checkbox' as const,
      onSelect: () => {
        if (membership.site !== me.value?.site) void auth.switchSite(membership.site, '/admin/')
      },
    })),
    [{ label: m.value.nav.newSite, icon: 'i-lucide-plus', to: '/settings/site#sites' }],
  ])
}
