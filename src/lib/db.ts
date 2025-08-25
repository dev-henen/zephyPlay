// src/lib/db.ts
import Dexie, { type Table } from 'dexie';

export interface SongRow {
  id?: number;
  url: string;
  title: string | null;
  platform: string | null;
  duration: number;
  addedAt: number;
  albumId?: number | null;
  thumbnail?: string | null;
  fileId?: number | null; // reference to saved file blob (if saved locally)
}

export interface AlbumRow {
  id?: number;
  name: string;
  createdAt: number;
  description?: string | null;
  thumbnail?: string | null;
}

export interface FileRow {
  id?: number;
  url: string;
  filename?: string | null;
  blob?: Blob | null;
  size?: number | null;
  createdAt: number;
}

/**
 * AppDB schema: songs, albums, files
 */
export class AppDB extends Dexie {
  songs!: Table<SongRow, number>;
  albums!: Table<AlbumRow, number>;
  files!: Table<FileRow, number>;

  constructor() {
    super('MusicAppDB');
    // bumped to version 2 for files table — if you previously used v1 you'll see Dexie upgrade message
    this.version(2).stores({
      songs: '++id, url, title, platform, duration, addedAt, albumId, fileId',
      albums: '++id, name, createdAt',
      files: '++id, url, filename, createdAt'
    });
  }
}

export const db = new AppDB();

/* --- album helpers --- */
export async function createAlbum(name: string, description?: string) {
  const createdAt = Date.now();
  const id = await db.albums.add({ name, createdAt, description: description ?? null });
  return id;
}

export async function getAlbums(): Promise<AlbumRow[]> {
  return db.albums.orderBy('createdAt').reverse().toArray();
}

export async function deleteAlbum(id: number) {
  await db.transaction('rw', db.albums, db.songs, async () => {
    await db.songs.where({ albumId: id }).modify({ albumId: null });
    await db.albums.delete(id);
  });
}

/* --- song helpers --- */
export async function addSong(song: Omit<SongRow, 'id' | 'addedAt'>) {
  const addedAt = Date.now();
  const id = await db.songs.add({ ...song, addedAt });
  return id;
}

export async function updateSong(id: number, patch: Partial<SongRow>) {
  await db.songs.update(id, patch);
}

export async function deleteSong(id: number) {
  await db.songs.delete(id);
}

export async function getRecentSongs(limit = 50): Promise<SongRow[]> {
  return db.songs.orderBy('addedAt').reverse().limit(limit).toArray();
}

export async function getSongsByAlbum(albumId: number): Promise<SongRow[]> {
  return db.songs.where({ albumId }).sortBy('addedAt').then(arr => arr.reverse());
}

/* --- file blob helpers --- */

/** Save a file blob into IndexedDB and return fileId */
export async function saveFileBlob(url: string, filename: string | null, blob: Blob) {
  const createdAt = Date.now();
  const size = blob.size ?? null;
  const id = await db.files.add({
    url,
    filename,
    blob,
    size,
    createdAt
  });
  return id;
}

/** Get a file row by fileId (contains blob) */
export async function getFileBlob(fileId: number): Promise<FileRow | undefined> {
  return db.files.get(fileId);
}

/** Delete file by id */
export async function deleteFile(fileId: number) {
  await db.files.delete(fileId);
}

/* --- search helpers (append to src/lib/db.ts) --- */

/**
 * Search songs by title OR url (case-insensitive).
 * Uses Dexie's .filter for flexible matching (fine for small-to-medium DBs).
 */
export async function searchSongs(query: string, limit = 50): Promise<SongRow[]> {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  // filter and then sort by addedAt desc, then limit
  const arr = await db.songs
    .filter((s: SongRow) => {
      const hay = ((s.title ?? s.url) ?? "").toString().toLowerCase();
      return hay.includes(q);
    })
    .toArray();
  // sort by addedAt desc and limit
  arr.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
  return arr.slice(0, limit);
}

/**
 * Search albums by name (case-insensitive).
 */
export async function searchAlbums(query: string, limit = 20): Promise<AlbumRow[]> {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const arr = await db.albums
    .filter((a: AlbumRow) => (a.name ?? "").toLowerCase().includes(q))
    .toArray();
  arr.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return arr.slice(0, limit);
}
