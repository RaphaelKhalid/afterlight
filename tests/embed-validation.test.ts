import assert from 'node:assert/strict'
import test from 'node:test'
import { AUTOLABS_ORIGIN, buildAutolabsStudioUrl, buildDesignMessage, createEmbedBridge, buildNavigationMessage, normalizeEmbedOrigins, validateEmbedPath, validateParentNavigateEvent } from '../src/embed.ts'

test('accepts only the documented route shapes and safe identifiers', () => {
  assert.equal(validateEmbedPath('/atlas'), '/atlas')
  assert.equal(validateEmbedPath('/questions/q-implicit-influence'), '/questions/q-implicit-influence')
  assert.equal(validateEmbedPath('/lab/run_0908e274-c24e-4bf0-a3ee-a6fae10cdf37'), '/lab/run_0908e274-c24e-4bf0-a3ee-a6fae10cdf37')
  assert.equal(validateEmbedPath('/unknown/thing'), null)
  assert.equal(validateEmbedPath('/questions/../secret'), null)
  assert.equal(validateEmbedPath('/questions/a?embed=autolabs'), null)
  assert.equal(validateEmbedPath('/atlas/extra'), null)
  assert.equal(validateEmbedPath('//atlas'), null)
  assert.equal(validateEmbedPath('/questions//id'), null)
  assert.equal(validateEmbedPath('/questions/' + 'a'.repeat(129)), null)
})

test('requires exact origin and the iframe parent as message source', () => {
  const parent = {}
  const valid = { origin: AUTOLABS_ORIGIN, source: parent, data: { type: 'autolabs:navigate', version: 1, path: '/designer/q-implicit-influence' } }
  assert.deepEqual(validateParentNavigateEvent(valid, parent), valid.data)
  assert.equal(validateParentNavigateEvent({ ...valid, origin: 'https://evil-autolabs.vercel.app' }, parent), null)
  assert.equal(validateParentNavigateEvent({ ...valid, source: {} }, parent), null)
  assert.equal(validateParentNavigateEvent({ ...valid, data: { ...valid.data, path: '/designer/../../secret' } }, parent), null)
  assert.equal(validateParentNavigateEvent({ ...valid, data: { ...valid.data, version: 2 } }, parent), null)
})

test('keeps development origins explicit and validates outbound handoffs', () => {
  assert.deepEqual(normalizeEmbedOrigins(['http://localhost:3000', 'http://127.0.0.1:4173', 'https://autolabs-ebon.vercel.app.evil.test', '*']), [AUTOLABS_ORIGIN, 'http://localhost:3000', 'http://127.0.0.1:4173'])
  assert.deepEqual(buildNavigationMessage('/results/run-1'), { type: 'afterlight:navigation', version: 1, path: '/results/run-1' })
  assert.equal(buildNavigationMessage('/results/run one'), null)
  assert.deepEqual(buildDesignMessage({ id: 'q-1', title: 'A question', sourceUrl: 'https://arxiv.org/abs/2608.04735' }), { type: 'afterlight:design', version: 1, question: { id: 'q-1', title: 'A question', sourceUrl: 'https://arxiv.org/abs/2608.04735' } })
  assert.equal(buildDesignMessage({ id: 'q-1', title: 'A question', sourceUrl: 'javascript:alert(1)' }), null)
})

test('deduplicates ready and navigation while accepting parent navigation once', () => {
  const listeners = new Set<(event: unknown) => void>()
  const messages: Array<{ message: unknown; target: string }> = []
  const parent = { postMessage: (message: unknown, target: string) => messages.push({ message, target }) }
  const host = {
    parent,
    addEventListener: (_type: string, listener: (event: unknown) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: unknown) => void) => listeners.delete(listener),
  } as unknown as Window
  const bridge = createEmbedBridge(true, ['http://127.0.0.1:4173'], undefined, host)
  assert.ok(bridge)
  bridge.ready()
  bridge.ready()
  bridge.navigation('/atlas')
  bridge.navigation('/atlas')
  assert.equal(messages.length, 2)
  assert.equal(messages[0].target, 'http://127.0.0.1:4173')
  const received: string[] = []
  const stop = bridge.listen((path) => received.push(path))
  const parentEvent = { origin: 'http://127.0.0.1:4173', source: parent, data: { type: 'autolabs:navigate', version: 1, path: '/questions/q-1' } }
  listeners.forEach((listener) => listener(parentEvent))
  listeners.forEach((listener) => listener(parentEvent))
  assert.deepEqual(received, ['/questions/q-1'])
  stop()
})
test('encodes proposed question context for standalone AutoLabs handoff', () => {
  const url = buildAutolabsStudioUrl({ id: 'q-proposed', title: 'A question with & spaces', sourceUrl: 'https://arxiv.org/abs/2608.04735?v=1' })
  assert.equal(url, `${AUTOLABS_ORIGIN}/studio?question=q-proposed&title=A+question+with+%26+spaces&source=https%3A%2F%2Farxiv.org%2Fabs%2F2608.04735%3Fv%3D1`)
  assert.equal(buildAutolabsStudioUrl({ id: 'q-proposed', title: 'A question', sourceUrl: 'javascript:alert(1)' }), null)
})