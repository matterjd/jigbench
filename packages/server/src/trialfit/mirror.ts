import { createPlateProxy, type PlateProxyHandle } from '../plate/proxy.js';

export interface MirrorStatus {
  port: number;
  status: 'up' | 'down' | 'none';
}

/**
 * F11 / CHASSIS.md's trial-fit mode: the right ("after") plate is a SECOND `PlateProxyHandle`
 * (S3's own `createPlateProxy`, reused verbatim — the mirror is not a different render route,
 * just a second instance of the same one) pointed at the same target the primary plate
 * clamps, so the bench can show the app live on both sides of the scrubber at once. One
 * `TrialFitMirror` per running bench server; `POST /api/plate/mirror` owns starting it.
 */
export class TrialFitMirror {
  private handle: PlateProxyHandle | null = null;

  constructor(private readonly benchOrigin: string) {}

  isRunning(): boolean {
    return this.handle !== null;
  }

  /** Starts the mirror proxy on `port`, pointed at `target`. Idempotent — a second call
   * while already running repoints the SAME listening proxy rather than opening a new one
   * (an iframe already loaded at the mirror's port must not have its port change under it). */
  async start(target: string, port: number): Promise<PlateProxyHandle> {
    if (this.handle) {
      await this.handle.start(target);
      return this.handle;
    }
    this.handle = createPlateProxy({ target, benchOrigin: this.benchOrigin, port, host: '127.0.0.1' });
    return this.handle;
  }

  async getStatus(): Promise<MirrorStatus | null> {
    if (!this.handle) return null;
    const status = await this.handle.getStatus();
    return { port: status.port, status: status.status };
  }

  async close(): Promise<void> {
    if (this.handle) {
      await this.handle.close();
      this.handle = null;
    }
  }
}
