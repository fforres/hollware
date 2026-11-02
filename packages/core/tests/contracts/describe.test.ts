import { describe, expect, it } from 'vite-plus/test'
import * as z from 'zod'

import * as api from '../../src/contracts/index.ts'
import {
  BUILT_IN_CONTRACT_IDS,
  type Contract,
  contracts,
  describeBuiltInContracts,
  describeContract,
  isBuiltInContract,
  REFUSAL_CONTRACT_IDS,
  sizeLimitViolation,
} from '../../src/contracts/index.ts'
import { RAW_HTML } from '../../src/contracts/safety.ts'
import * as schemas from '../../src/operations/schemas.ts'

const BOTH = ['write', 'publish']

describe('BUILT_IN_CONTRACT_IDS', () => {
  it('lists every id Hollware reserves, the ones it runs and the ones the pipeline and the store make', () => {
    expect(BUILT_IN_CONTRACT_IDS).toStrictEqual([
      'schema',
      'components',
      'raw-html',
      'unknown-component',
      'disallowed-attribute',
      'unsafe-url',
      'translation-pair',
      'internal-links-resolve',
      'images-have-alt',
      'size-limit',
      'frontmatter-syntax',
      'comark-parse',
      'unique-slug',
      'unique-translation',
    ])
  })
})

describe('REFUSAL_CONTRACT_IDS', () => {
  it('lists the violations that make a write refused instead of saved', () => {
    expect(REFUSAL_CONTRACT_IDS).toStrictEqual([
      'size-limit',
      'frontmatter-syntax',
      'comark-parse',
      'unique-slug',
      'unique-translation',
    ])
  })

  it('are built-in ids that no verdict holds: the last ones, which the pipeline and the store make', () => {
    expect(BUILT_IN_CONTRACT_IDS.slice(-REFUSAL_CONTRACT_IDS.length)).toStrictEqual(
      REFUSAL_CONTRACT_IDS,
    )
    expect(describeBuiltInContracts().map((description) => description.id)).toStrictEqual([
      'schema',
      'components',
      'raw-html',
      'unknown-component',
      'disallowed-attribute',
      'unsafe-url',
      ...REFUSAL_CONTRACT_IDS,
    ])
  })

  it('include the contract that sizeLimitViolation makes, whatever the size it is for', () => {
    expect(REFUSAL_CONTRACT_IDS).toContain(sizeLimitViolation(2, 1).contract)
  })
})

describe('describeBuiltInContracts', () => {
  it('lists the always-on contracts, in order, as describe_site shows them', () => {
    expect(describeBuiltInContracts()).toStrictEqual([
      {
        id: 'schema',
        severity: 'error',
        phases: BOTH,
        description:
          'The frontmatter matches the schema of the collection, which describe_site shows as JSON Schema.',
      },
      {
        id: 'components',
        severity: 'error',
        phases: BOTH,
        description: 'The props of every component in the body match the schema of that component.',
      },
      {
        id: 'raw-html',
        severity: 'error',
        phases: BOTH,
        description:
          'The body holds Markdown and the components of the collection, never raw HTML.',
      },
      {
        id: 'unknown-component',
        severity: 'error',
        phases: BOTH,
        description: 'The body uses only the components that the collection declares.',
      },
      {
        id: 'disallowed-attribute',
        severity: 'error',
        phases: BOTH,
        description:
          'Links, images and code carry only the attributes Markdown produces, and a component only the props its schema declares.',
      },
      {
        id: 'unsafe-url',
        severity: 'error',
        phases: BOTH,
        description:
          'Links and images use an https: or http: URL, an asset: reference, a path of the site or an anchor; links may also use mailto:.',
      },
      {
        id: 'size-limit',
        severity: 'error',
        phases: BOTH,
        description: 'The whole Markdown file stays within the size limit of the collection.',
      },
      {
        id: 'frontmatter-syntax',
        severity: 'error',
        phases: BOTH,
        description: 'The frontmatter is valid YAML between two --- lines at the top of the file.',
      },
      {
        id: 'comark-parse',
        severity: 'error',
        phases: BOTH,
        description: 'The Markdown parses.',
      },
      {
        id: 'unique-slug',
        severity: 'error',
        phases: BOTH,
        description: 'No other entry of the collection and locale has the slug.',
      },
      {
        id: 'unique-translation',
        severity: 'error',
        phases: BOTH,
        description:
          'No other entry of the collection and locale belongs to the translation group.',
      },
    ])
  })

  it('leaves out the opt-in contracts, which a collection lists itself', () => {
    const listed = describeBuiltInContracts().map((description) => description.id)
    const optIn = BUILT_IN_CONTRACT_IDS.filter((id) => !listed.includes(id))
    expect(optIn).toStrictEqual(['translation-pair', 'internal-links-resolve', 'images-have-alt'])
  })

  it('answers with what the operation schemas call a contract description', () => {
    const descriptions = describeBuiltInContracts()
    expect(z.array(schemas.contractDescription).parse(descriptions)).toStrictEqual(descriptions)
  })

  it('answers with a new list each time', () => {
    const first = describeBuiltInContracts()
    first.pop()
    expect(describeBuiltInContracts()).toHaveLength(11)
  })
})

describe('describeContract', () => {
  it('gives a contract with no phases both of them, and keeps its words', () => {
    expect(
      describeContract({ id: 'rule', severity: 'warning', description: 'The rule.' }),
    ).toStrictEqual({ id: 'rule', severity: 'warning', phases: BOTH, description: 'The rule.' })
  })

  it('puts the phases in the order they happen, once each', () => {
    const of = (phases: readonly ('write' | 'publish')[]) =>
      describeContract({ id: 'r', severity: 'error', description: 'd', phases }).phases
    expect(of(['publish', 'write'])).toStrictEqual(BOTH)
    expect(of(['publish', 'publish'])).toStrictEqual(['publish'])
    expect(of(['write'])).toStrictEqual(['write'])
    expect(of([])).toStrictEqual([])
  })

  it('describes the opt-in contracts the way a collection lists them', () => {
    expect(describeContract(contracts.translationPair())).toStrictEqual({
      id: 'translation-pair',
      severity: 'error',
      phases: ['publish'],
      description:
        'Every locale of the site has an entry in the translation group of this entry. Checked when publishing.',
    })
    expect(describeContract(contracts.internalLinksResolve({ severity: 'warning' }))).toStrictEqual(
      {
        id: 'internal-links-resolve',
        severity: 'warning',
        phases: ['publish'],
        description:
          'Every link to another entry of the site points at a published entry. Checked when publishing.',
      },
    )
    expect(describeContract(contracts.imagesHaveAlt())).toStrictEqual({
      id: 'images-have-alt',
      severity: 'error',
      phases: BOTH,
      description: 'Every image has alt text that describes it.',
    })
  })
})

describe('isBuiltInContract', () => {
  it('knows the contracts that Hollware makes', () => {
    expect(isBuiltInContract(contracts.translationPair())).toBe(true)
    expect(isBuiltInContract(contracts.internalLinksResolve())).toBe(true)
    expect(isBuiltInContract(contracts.imagesHaveAlt())).toBe(true)
    expect(isBuiltInContract(RAW_HTML)).toBe(true)
  })

  it('does not take a contract of a site for one of them, whatever its id', () => {
    const own: Contract<unknown> = {
      id: 'translation-pair',
      severity: 'error',
      description: 'My own.',
      check: () => [],
    }
    expect(isBuiltInContract(own)).toBe(false)
    expect(isBuiltInContract({ ...contracts.translationPair() })).toBe(false)
    expect(
      isBuiltInContract(
        contracts.custom({
          id: 'x',
          severity: 'error',
          description: 'd',
          check: () => true,
          message: 'm',
          fix: 'f',
        }),
      ),
    ).toBe(false)
  })
})

describe('sizeLimitViolation', () => {
  it('says the same for every size, with how much to cut', () => {
    expect(sizeLimitViolation(600_000, 524_288)).toStrictEqual({
      contract: 'size-limit',
      severity: 'error',
      path: '',
      message: 'The entry takes 600000 bytes and the limit is 524288 bytes.',
      fix: 'Cut at least 75712 bytes: shorten the text, drop what is not essential or split it into several entries.',
      code: 'size-limit.row',
      params: { bytes: 600000, limit: 524288 },
    })
    expect(sizeLimitViolation(2_000_000, 1_900_000)).toStrictEqual({
      contract: 'size-limit',
      severity: 'error',
      path: '',
      message: 'The entry takes 2000000 bytes and the limit is 1900000 bytes.',
      fix: 'Cut at least 100000 bytes: shorten the text, drop what is not essential or split it into several entries.',
      code: 'size-limit.row',
      params: { bytes: 2000000, limit: 1900000 },
    })
  })
})

describe('the module', () => {
  it('exports what the package entry wires up', () => {
    expect(Object.keys(api).toSorted()).toStrictEqual([
      'BUILT_IN_CONTRACT_IDS',
      'CATALOG',
      'REFUSAL_CONTRACT_IDS',
      'canonicalJson',
      'catalogRule',
      'contracts',
      'describeBuiltInContracts',
      'describeCatalog',
      'describeContract',
      'isBuiltInContract',
      'referencedSlugs',
      'runContracts',
      'sizeLimitViolation',
      'uniqueSlugViolation',
      'uniqueTranslationViolation',
    ])
  })
})
