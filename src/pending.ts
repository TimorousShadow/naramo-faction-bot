// TimorousShadow
import { randomUUID } from "node:crypto";

interface Entry<T> {
  userId: string;
  value: T;
  expiresAt: number;
}

export type Taken<T> = { status: "ok"; value: T } | { status: "expired" } | { status: "other-user"; userId: string };

export class PendingStore<T> {
  private readonly entries = new Map<string, Entry<T>>();

  public constructor(private readonly ttlMs: number) {}

  public create(userId: string, value: T): { token: string; expiresAt: number } {
    const token = randomUUID();
    const expiresAt = Date.now() + this.ttlMs;
    this.entries.set(token, { userId, value, expiresAt });
    setTimeout(() => this.entries.delete(token), this.ttlMs).unref();
    return { token, expiresAt };
  }

  public take(token: string | undefined, userId: string): Taken<T> {
    const entry = token ? this.entries.get(token) : undefined;
    if (!entry || entry.expiresAt < Date.now()) return { status: "expired" };
    if (entry.userId !== userId) return { status: "other-user", userId: entry.userId };
    this.entries.delete(token!);
    return { status: "ok", value: entry.value };
  }
}
