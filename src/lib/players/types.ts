// shared player types
export interface VideoInfo {
  id: string | null;
  title: string | null;
  duration: number; // seconds (0 if unknown)
  currentTime: number; // seconds
}

export interface PlayerAdapter {
  // load a resource (videoId or other id) and make player ready
  load(resourceId: string): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  seekTo(seconds: number): void;
  getInfo(): Promise<VideoInfo>;
  destroy(): void;
}
