import { Injectable } from "@nestjs/common";

export type ReadinessProbe = () => Promise<void>;

const defaultReadinessTimeoutMs = 2_000;

@Injectable()
export class HealthService {
  constructor(
    private readonly probes: readonly ReadinessProbe[],
    private readonly timeoutMs = defaultReadinessTimeoutMs,
  ) {}

  async isReady(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("readiness probe timed out")), this.timeoutMs);
      });
      await Promise.race([Promise.all(this.probes.map(async (probe) => probe())), timeout]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}
