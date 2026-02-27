import { db } from "./db";
import { auditLogs } from "@shared/schema";
import { logger } from "./logger";

export interface AuditLogData {
  entityType: string;
  entityId: string | number;
  action: string;
  performedBy: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  metadata?: Record<string, unknown>;
}

export async function logAudit(data: AuditLogData): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      entityType: data.entityType,
      entityId: String(data.entityId),
      action: data.action,
      performedBy: data.performedBy,
      changes: data.changes ? JSON.stringify(data.changes) : null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
    });
  } catch (err) {
    logger.error("Failed to log audit entry", {
      message: err instanceof Error ? err.message : String(err),
      entityType: data.entityType,
      entityId: data.entityId,
    });
  }
}
