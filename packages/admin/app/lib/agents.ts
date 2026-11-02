import { AGENT_DEFAULT_SCOPES, AGENT_EVENT_KINDS, AGENT_SCOPE_CEILING } from '@hollware/core'
import type { AgentEventKind, Scope } from '@hollware/core'
import type { Output } from './api.ts'

export const AGENT_EVENTS: readonly AgentEventKind[] = AGENT_EVENT_KINDS
export const AGENT_SCOPES: readonly Scope[] = AGENT_SCOPE_CEILING

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const WORKER_NAME = /^[A-Z][A-Z0-9_]*$/
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

export interface AgentMember {
  readonly id: string
  readonly name: string
  readonly since: string
}

export type AgentSubscription = Output<'get_structure'>['definition']['agents'][number]
export type AgentDelivery = AgentSubscription['delivery']

export interface AgentForm {
  readonly name: string
  readonly member: string
  readonly events: readonly AgentEventKind[]
  readonly kind: 'webhook' | 'binding'
  readonly url: string
  readonly secret: string
  readonly binding: string
  readonly scopes: readonly Scope[]
  readonly required: boolean
}

export type AgentFormProblem =
  | 'name'
  | 'nameTaken'
  | 'member'
  | 'events'
  | 'url'
  | 'secret'
  | 'binding'
  | 'scopes'

export function isAgentName(name: string): boolean {
  return NAME.test(name)
}

export function isAgentUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.has(url.hostname))
}

export function emptyAgentForm(member = ''): AgentForm {
  return {
    name: '',
    member,
    events: ['review.requested'],
    kind: 'webhook',
    url: '',
    secret: '',
    binding: '',
    scopes: [...AGENT_DEFAULT_SCOPES],
    required: false,
  }
}

export function agentForm(agent: AgentSubscription): AgentForm {
  return {
    name: agent.name,
    member: agent.member,
    events: [...agent.events],
    kind: agent.delivery.kind,
    url: agent.delivery.kind === 'webhook' ? agent.delivery.url : '',
    secret: agent.delivery.kind === 'webhook' ? (agent.delivery.secret ?? '') : '',
    binding: agent.delivery.kind === 'binding' ? agent.delivery.binding : '',
    scopes: [...(agent.scopes ?? AGENT_DEFAULT_SCOPES)],
    required: agent.required,
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item))
}

export function agentOf(form: AgentForm): AgentSubscription {
  const secret = form.secret.trim()
  const delivery: AgentDelivery =
    form.kind === 'binding'
      ? { kind: 'binding', binding: form.binding.trim() }
      : { kind: 'webhook', url: form.url.trim(), ...(secret === '' ? {} : { secret }) }
  const events = AGENT_EVENTS.filter((kind) => form.events.includes(kind))
  const scopes = AGENT_SCOPES.filter((scope) => form.scopes.includes(scope))
  return {
    name: form.name.trim(),
    member: form.member,
    events,
    delivery,
    ...(sameSet(scopes, AGENT_DEFAULT_SCOPES) ? {} : { scopes }),
    required: form.required,
  }
}

export function agentFormProblems(
  form: AgentForm,
  others: readonly string[],
  members: readonly string[],
): AgentFormProblem[] {
  const name = form.name.trim()
  const problems: AgentFormProblem[] = []
  if (!isAgentName(name)) problems.push('name')
  else if (others.includes(name)) problems.push('nameTaken')
  if (!members.includes(form.member)) problems.push('member')
  if (!form.events.some((kind) => AGENT_EVENTS.includes(kind))) problems.push('events')
  if (form.kind === 'webhook') {
    if (!isAgentUrl(form.url.trim())) problems.push('url')
    const secret = form.secret.trim()
    if (secret !== '' && !WORKER_NAME.test(secret)) problems.push('secret')
  } else if (!WORKER_NAME.test(form.binding.trim())) {
    problems.push('binding')
  }
  if (!form.scopes.some((scope) => AGENT_SCOPES.includes(scope))) problems.push('scopes')
  return problems
}

export function withAgent<Agent extends { readonly name: string }>(
  agents: readonly Agent[],
  agent: Agent,
  replacing: string | null,
): Agent[] {
  const kept = agents.filter((other) => other.name !== (replacing ?? agent.name))
  const at = replacing === null ? -1 : agents.findIndex((other) => other.name === replacing)
  return at < 0 ? [...kept, agent] : [...kept.slice(0, at), agent, ...kept.slice(at)]
}

export function withoutAgent<Agent extends { readonly name: string }>(
  agents: readonly Agent[],
  name: string,
): Agent[] {
  return agents.filter((agent) => agent.name !== name)
}

export function needsSecret(agent: AgentSubscription): boolean {
  return agent.delivery.kind === 'webhook' && agent.delivery.secret === undefined
}

export type AgentStatus = 'queued' | 'commented' | 'failed'

export function agentStatusColor(status: AgentStatus): 'neutral' | 'success' | 'error' {
  switch (status) {
    case 'queued':
      return 'neutral'
    case 'commented':
      return 'success'
    case 'failed':
      return 'error'
  }
}

export interface AgentDeliveryRow {
  readonly event: string
  readonly kind: string
  readonly agent: string
  readonly attempts: number
  readonly deliveredAt: string | null
  readonly lastError: string | null
  readonly triedAt: string
  readonly abandonedAt: string | null
}

export type DeliveryState = 'delivered' | 'retrying' | 'abandoned'

export function deliveryState(delivery: AgentDeliveryRow): DeliveryState {
  if (delivery.deliveredAt !== null) return 'delivered'
  return delivery.abandonedAt === null ? 'retrying' : 'abandoned'
}

export function canSendAgain(delivery: AgentDeliveryRow): boolean {
  return delivery.deliveredAt === null
}

export const LEGACY_AGENTS_CLIENT = 'hollware-agents'
const ADMIN_CLIENT = 'hollware-admin'

export interface CommentAuthor {
  readonly authorKind?: 'person' | 'agent'
  readonly client: string | null
}

export function isAgentComment(comment: CommentAuthor): boolean {
  return comment.authorKind === 'agent' || comment.client === LEGACY_AGENTS_CLIENT
}

export function clientBadge(comment: CommentAuthor): string | null {
  return comment.client === null ||
    comment.client === ADMIN_CLIENT ||
    comment.client === LEGACY_AGENTS_CLIENT
    ? null
    : comment.client
}

export function managesSite(me: { readonly scopes: readonly string[] } | null): boolean {
  return me?.scopes.includes('schema:admin') ?? false
}
