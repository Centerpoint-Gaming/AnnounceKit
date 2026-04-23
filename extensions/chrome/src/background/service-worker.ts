import { fetchStoreMetadata } from '@announcekit/core';
import { extractPalette } from './palette.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_GAME_DETAILS') {
    handleFetchGameDetails(message.appId).then(sendResponse);
    return true;
  }

  if (message.type === 'EXTRACT_PALETTE') {
    extractPalette(message.imageUrl).then(sendResponse);
    return true;
  }

  if (message.type === 'PAGE_CONTEXT_READY') {
    // Update badge when content script detects a Steam page
    const ctx = message.context;
    const tabId = sender.tab?.id;
    if (tabId) {
      if (ctx?.isAnnouncementEditor) {
        chrome.action.setBadgeText({ text: 'Edit', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#3b82f6', tabId });
      } else if (ctx?.appId) {
        chrome.action.setBadgeText({ text: 'OK', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
      }
    }
    return false;
  }
});

async function handleFetchGameDetails(appId: string) {
  const result = await fetchStoreMetadata(appId);

  if (!result.ok) {
    return { error: result.error.message, reason: result.error.reason };
  }

  // Return in the shape the popup currently expects, plus the full metadata
  const m = result.data;
  return {
    ...m,
    // Legacy fields for backwards compat with existing popup code
    headerImage: m.assets.header,
    background: m.assets.background,
    capsuleImage: m.assets.capsule,
    screenshots: m.assets.screenshots.map((url) => ({ pathFull: url })),
  };
}
