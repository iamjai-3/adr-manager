import { db } from "./db";
import { auditLogs } from "@shared/schema";

export interface AuditLogData {
  entityType: string;
  entityId: string | number;
  action: string;
  performedBy: string;
  changes?: Record<string, { before: any; after: any }>;
  metadata?: Record<string, any>;
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
    console.error("Failed to log audit entry:", err);
  }
}
