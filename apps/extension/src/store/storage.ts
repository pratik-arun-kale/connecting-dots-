import type { StateStorage } from 'zustand/middleware'

export const chromeStorage: StateStorage = {
  getItem: async (key) => {
    const result = await chrome.storage.local.get(key)
    return (result[key] as string | null) ?? null
  },
  setItem: async (key, value) => {
    await chrome.storage.local.set({ [key]: value })
  },
  removeItem: async (key) => {
    await chrome.storage.local.remove(key)
  },
}
