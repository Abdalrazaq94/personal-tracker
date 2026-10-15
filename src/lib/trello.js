import { T } from './i18n'
// Minimal Trello REST client (runs in the browser with the user's own key + token).
const API = 'https://api.trello.com/1'

export const authorizeUrl = (key) =>
  `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=Tracker&key=${encodeURIComponent(key)}`

async function call(path, { key, token }, { method = 'GET', params = {} } = {}) {
  const qs = new URLSearchParams({ ...params, key, token })
  const res = await fetch(`${API}${path}?${qs}`, { method })
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 401) throw new Error(T('Trello rejected the key or token. Check them and try again.'))
    throw new Error(text || T('Trello error {0}', [res.status]))
  }
  return text ? JSON.parse(text) : null
}

export const getBoards = (auth) => call('/members/me/boards', auth, { params: { filter: 'open', fields: 'name,url' } })

export const getBoard = (auth, boardId) => call(`/boards/${boardId}`, auth, { params: { fields: 'name,url' } })

export const getLists = (auth, boardId) =>
  call(`/boards/${boardId}/lists`, auth, {
    params: { filter: 'open', cards: 'open', card_fields: 'name,url,desc,due,dueComplete,labels,dateLastActivity,idList,pos' },
  })

export const addCard = (auth, idList, name, desc = '') =>
  call('/cards', auth, { method: 'POST', params: { idList, name, desc, pos: 'top' } })

export const moveCard = (auth, cardId, idList) => call(`/cards/${cardId}`, auth, { method: 'PUT', params: { idList, pos: 'top' } })
