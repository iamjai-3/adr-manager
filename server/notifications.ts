import { db } from "./db";
import { notifications } from "@shared/schema";
import { logger } from "./logger";

export interface NotificationData {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string;
}

export async function createNotification(data: NotificationData): Promise<void> {
  try {
    await db.insert(notifications).values(data);
  } catch (err) {
    logger.error("Failed to create notification", {
      message: err instanceof Error ? err.message : String(err),
      userId: data.userId,
    });
  }
}

export async function notifyProjectMembers(
  projectId: number,
  excludeUserId: string | null,
  type: string,
  title: string,
  body: string,
  href?: string,
): Promise<void> {
  try {
    const { projectMembers, users } = await import("@shared/schema");
    const { eq, and, ne } = await import("drizzle-orm");

    let query = db
      .select({ userId: users.id })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId));

    if (excludeUserId) {
      query = query.where(and(eq(projectMembers.projectId, projectId), ne(users.id, excludeUserId)));
    }

    const members = await query;

    for (const member of members) {
      await createNotification({ userId: member.userId, type, title, body, href });
    }
  } catch (err) {
    logger.error("Failed to notify project members", {
      message: err instanceof Error ? err.message : String(err),
      projectId,
    });
  }
}
