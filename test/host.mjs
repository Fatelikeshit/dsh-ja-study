import { apply } from '../index.js'

const routes = []
const ctx = {
  logger: { warn: (message) => console.log('warn:', message) },
  effect: (fn) => fn(),
  webServer: {
    register: (route) => {
      routes.push(route)
      return () => {}
    },
  },
}

apply(ctx, {})

const route = routes.find((item) => item.path === '/api/ja-study/state')
if (route === undefined) {
  console.error('state route was not registered')
  process.exit(1)
}

const body = await new Promise((resolve) => {
  const req = { method: 'GET', socket: { remoteAddress: '127.0.0.1' }, on: () => {} }
  const res = { writeHead: () => {}, end: (payload) => resolve(payload) }
  route.handler(req, res)
})

const data = JSON.parse(body)
console.log(`decks: ${data.decks.length}, cards: ${data.totalCards}, errors: ${data.errors.length}`)
const byLevel = data.decks.reduce((acc, deck) => {
  acc[deck.level] = (acc[deck.level] ?? 0) + deck.count
  return acc
}, {})
console.log('by level:', JSON.stringify(byLevel))

if (data.decks.length !== 20 || data.totalCards !== 427 || data.errors.length !== 0) {
  console.error('unexpected state payload')
  process.exit(1)
}
console.log('HOST OK')
