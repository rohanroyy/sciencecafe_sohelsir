/**
 * Returns a deterministic dummy profile picture URL based on gender and a seed (e.g. user ID).
 * Falls back to null if a real photo_url is provided.
 *
 * Male images: /dummydp/Male1.png ... Male4.png
 * Female images: /dummydp/female1.png ... female4.png
 */

const MALE_AVATARS = [
  '/dummydp/Male1.png',
  '/dummydp/Male2.png',
  '/dummydp/Male3.png',
  '/dummydp/Male4.png',
];

const FEMALE_AVATARS = [
  '/dummydp/female1.png',
  '/dummydp/female2.png',
  '/dummydp/female3.png',
  '/dummydp/female4.png',
];

/**
 * Returns either the real photo_url (if set) or a deterministic dummy avatar based on gender and id.
 * @param {string|null|undefined} photo_url - The user's uploaded photo URL
 * @param {'Male'|'Female'|string} gender - The user's gender
 * @param {string} id - Any unique identifier to seed the random selection
 * @returns {string} - A URL to display as the avatar
 */
export function getAvatarUrl(photo_url, gender, id = '') {
  if (photo_url) return photo_url;

  const isFemale = (gender || '').toLowerCase() === 'female';
  const pool = isFemale ? FEMALE_AVATARS : MALE_AVATARS;

  // Deterministic index from id string
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
  }
  const idx = Math.abs(hash) % pool.length;
  return pool[idx];
}
