export type EntitlementStatus = 'pending' | 'paid' | 'used' | 'expired';

export interface EntitlementRecord {
  status: EntitlementStatus;
  sessionId?: string;
  createdAt: number;
}

const HANDLE_TTL_SECONDS = 30 * 60; // 30 minutes

function entitlementKey(handle: string): string {
  return `entitlement:${handle}`;
}

export async function createPendingEntitlement(
  kv: KVNamespace,
  handle: string,
  sessionId: string,
): Promise<void> {
  const record: EntitlementRecord = {
    status: 'pending',
    sessionId,
    createdAt: Date.now(),
  };
  await kv.put(entitlementKey(handle), JSON.stringify(record), {
    expirationTtl: HANDLE_TTL_SECONDS,
  });
}

export async function getEntitlement(
  kv: KVNamespace,
  handle: string,
): Promise<EntitlementRecord | null> {
  const raw = await kv.get(entitlementKey(handle));
  if (!raw) return null;
  return JSON.parse(raw) as EntitlementRecord;
}

export async function markEntitlementPaid(kv: KVNamespace, handle: string): Promise<void> {
  const existing = await getEntitlement(kv, handle);
  const record: EntitlementRecord = {
    status: 'paid',
    sessionId: existing?.sessionId,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await kv.put(entitlementKey(handle), JSON.stringify(record), {
    expirationTtl: HANDLE_TTL_SECONDS,
  });
}

export async function consumeEntitlement(kv: KVNamespace, handle: string): Promise<boolean> {
  const record = await getEntitlement(kv, handle);
  if (!record || record.status !== 'paid') {
    return false;
  }

  const used: EntitlementRecord = { ...record, status: 'used' };
  await kv.put(entitlementKey(handle), JSON.stringify(used), {
    expirationTtl: HANDLE_TTL_SECONDS,
  });
  return true;
}

export async function markEntitlementExpired(kv: KVNamespace, handle: string): Promise<void> {
  const existing = await getEntitlement(kv, handle);
  if (!existing) return;
  const record: EntitlementRecord = { ...existing, status: 'expired' };
  await kv.put(entitlementKey(handle), JSON.stringify(record), {
    expirationTtl: HANDLE_TTL_SECONDS,
  });
}

export { HANDLE_TTL_SECONDS };
