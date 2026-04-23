import type { GameProfile } from '@announcekit/core';

const STORAGE_KEY = 'gameProfiles';

async function getAllProfiles(): Promise<Record<string, GameProfile>> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? {};
}

export async function getGameProfile(appId: string): Promise<GameProfile | null> {
  const profiles = await getAllProfiles();
  const profile = profiles[appId] ?? null;

  if (profile) {
    // Update lastUsedAt
    profile.lastUsedAt = Date.now();
    await chrome.storage.local.set({
      [STORAGE_KEY]: { ...profiles, [appId]: profile },
    });
  }

  return profile;
}

export async function saveGameProfile(profile: GameProfile): Promise<void> {
  const profiles = await getAllProfiles();
  profiles[profile.appId] = profile;
  await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
}

export async function listGameProfiles(): Promise<GameProfile[]> {
  const profiles = await getAllProfiles();
  return Object.values(profiles).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

export async function deleteGameProfile(appId: string): Promise<void> {
  const profiles = await getAllProfiles();
  delete profiles[appId];
  await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
}
