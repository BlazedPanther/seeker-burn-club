import { db } from '../db/client.js';
import { securityLogs } from '../db/schema.js';

export type SecuritySeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface SecurityLogEntry {
  eventType: string;
  walletAddress?: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  details?: Record<string, unknown>;
  severity?: SecuritySeverity;
}

/**
 * Write a security event to the security_logs table.
 * Fire-and-forget — never throws to avoid side-effects on main flow.
 */
export async function securityLog(entry: SecurityLogEntry): Promise<void> {
  try {
    await db.insert(securityLogs).values({
      eventType: entry.eventType,
      walletAddress: entry.walletAddress,
      deviceFingerprint: entry.deviceFingerprint,
      ipAddress: entry.ipAddress,
      details: entry.details ?? null,
      severity: entry.severity ?? 'INFO',
    });
  } catch (err) {
    // Best-effort — don't let security logging break the main flow
    console.error('[security-log] Failed to write:', err);
  }
}
