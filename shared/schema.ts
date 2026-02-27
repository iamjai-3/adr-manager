import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, serial, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Projects ────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  key: varchar("key", { length: 10 }).notNull().unique(),
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// ─── Project Members ─────────────────────────────────────────────────────────

export const projectMemberRoleEnum = ["admin", "editor", "viewer"] as const;
export type ProjectMemberRole = typeof projectMemberRoleEnum[number];

export const projectMembers = pgTable("project_members", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").notNull().default("viewer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ProjectMember = typeof projectMembers.$inferSelect;

// ─── ADR Status ───────────────────────────────────────────────────────────────

export const adrStatusEnum = ["draft", "proposed", "in_review", "accepted", "deprecated", "superseded"] as const;
export type AdrStatus = typeof adrStatusEnum[number];

export const adrRelationTypeEnum = ["supersedes", "superseded_by", "conflicts_with", "depends_on", "related_to"] as const;
export type AdrRelationType = typeof adrRelationTypeEnum[number];

// ─── ADRs ─────────────────────────────────────────────────────────────────────

export const adrs = pgTable("adrs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  adrNumber: integer("adr_number").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  status: text("status").notNull().default("draft"),
  context: text("context").notNull(),
  decision: text("decision").notNull(),
  consequences: text("consequences").notNull(),
  alternatives: text("alternatives"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  team: varchar("team", { length: 100 }),
  author: varchar("author", { length: 100 }).notNull(),
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
  archived: boolean("archived").notNull().default(false),
  archiveReason: text("archive_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  projectAdrNumberUnique: unique().on(table.projectId, table.adrNumber),
}));

export const insertAdrSchema = createInsertSchema(adrs).omit({
  id: true,
  adrNumber: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAdr = z.infer<typeof insertAdrSchema>;
export type Adr = typeof adrs.$inferSelect;

// ─── ADR Versions ────────────────────────────────────────────────────────────

export const adrVersions = pgTable("adr_versions", {
  id: serial("id").primaryKey(),
  adrId: integer("adr_id").notNull(),
  version: varchar("version", { length: 20 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  status: text("status").notNull(),
  context: text("context").notNull(),
  decision: text("decision").notNull(),
  consequences: text("consequences").notNull(),
  alternatives: text("alternatives"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  team: varchar("team", { length: 100 }),
  author: varchar("author", { length: 100 }).notNull(),
  changeReason: text("change_reason"),
  changedBy: varchar("changed_by", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdrVersionSchema = createInsertSchema(adrVersions).omit({
  id: true,
  createdAt: true,
});

export type InsertAdrVersion = z.infer<typeof insertAdrVersionSchema>;
export type AdrVersion = typeof adrVersions.$inferSelect;

// ─── ADR Comments ────────────────────────────────────────────────────────────

export const adrComments = pgTable("adr_comments", {
  id: serial("id").primaryKey(),
  adrId: integer("adr_id").notNull(),
  section: varchar("section", { length: 50 }),
  content: text("content").notNull(),
  author: varchar("author", { length: 100 }).notNull(),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdrCommentSchema = createInsertSchema(adrComments).omit({
  id: true,
  createdAt: true,
});

export type InsertAdrComment = z.infer<typeof insertAdrCommentSchema>;
export type AdrComment = typeof adrComments.$inferSelect;

// ─── ADR Relations ───────────────────────────────────────────────────────────

export const adrRelations = pgTable("adr_relations", {
  id: serial("id").primaryKey(),
  sourceAdrId: integer("source_adr_id").notNull(),
  targetAdrId: integer("target_adr_id").notNull(),
  relationType: text("relation_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdrRelationSchema = createInsertSchema(adrRelations).omit({
  id: true,
  createdAt: true,
});

export type InsertAdrRelation = z.infer<typeof insertAdrRelationSchema>;
export type AdrRelation = typeof adrRelations.$inferSelect;

// ─── Status Config ────────────────────────────────────────────────────────────

export const statusTransitionMap: Record<string, string[]> = {
  draft: ["proposed", "deprecated"],
  proposed: ["in_review", "deprecated"],
  in_review: ["accepted", "deprecated"],
  accepted: ["deprecated", "superseded"],
  deprecated: [],
  superseded: [],
};

export const statusLabels: Record<string, string> = {
  draft: "Draft",
  proposed: "Proposed",
  in_review: "In Review",
  accepted: "Accepted",
  deprecated: "Deprecated",
  superseded: "Superseded",
};

export const tagOptions = [
  "database", "security", "frontend", "backend", "infrastructure",
  "api", "auth", "performance", "testing", "devops",
  "monitoring", "caching", "messaging", "microservices", "monolith",
] as const;

export const teamOptions = [
  "Platform", "Payments", "Auth", "Frontend", "Backend",
  "Data", "DevOps", "Mobile", "Search", "Analytics",
] as const;

// ─── Users ────────────────────────────────────────────────────────────────────

export const userRoleEnum = ["admin", "editor", "viewer"] as const;
export type UserRole = typeof userRoleEnum[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  role: text("role").notNull().default("viewer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  role: true,
});

export const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50),
  password: z.string().min(6, "Password must be at least 6 characters"),
  displayName: z.string().min(1, "Display name is required").max(100),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const rolePermissions: Record<string, {
  canCreate: boolean;
  canEdit: boolean;
  canChangeStatus: boolean;
  canArchive: boolean;
  canComment: boolean;
  canManageUsers: boolean;
  canManageProjects: boolean;
}> = {
  admin: { canCreate: true, canEdit: true, canChangeStatus: true, canArchive: true, canComment: true, canManageUsers: true, canManageProjects: true },
  editor: { canCreate: true, canEdit: true, canChangeStatus: true, canArchive: false, canComment: true, canManageUsers: false, canManageProjects: false },
  viewer: { canCreate: false, canEdit: false, canChangeStatus: false, canArchive: false, canComment: true, canManageUsers: false, canManageProjects: false },
};

// Project-level permissions (based on membership role)
export const projectRolePermissions: Record<string, {
  canCreate: boolean;
  canEdit: boolean;
  canChangeStatus: boolean;
  canArchive: boolean;
  canComment: boolean;
  canManageMembers: boolean;
}> = {
  admin: { canCreate: true, canEdit: true, canChangeStatus: true, canArchive: true, canComment: true, canManageMembers: true },
  editor: { canCreate: true, canEdit: true, canChangeStatus: true, canArchive: false, canComment: true, canManageMembers: false },
  viewer: { canCreate: false, canEdit: false, canChangeStatus: false, canArchive: false, canComment: true, canManageMembers: false },
};

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  performedBy: varchar("performed_by", { length: 100 }).notNull(),
  changes: text("changes"),
  metadata: text("metadata"),
  performedAt: timestamp("performed_at").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Project Requirements (FR/NFR) ───────────────────────────────────────────

export const requirementTypeEnum = ["FR", "NFR"] as const;
export const requirementPriorityEnum = ["must", "should", "could", "wont"] as const;
export const requirementStatusEnum = ["draft", "approved", "deprecated"] as const;

export const projectRequirements = pgTable("project_requirements", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  type: text("type").notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("should"),
  status: text("status").notNull().default("draft"),
  createdBy: varchar("created_by", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const adrRequirementLinks = pgTable("adr_requirement_links", {
  id: serial("id").primaryKey(),
  adrId: integer("adr_id").notNull(),
  requirementId: integer("requirement_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ProjectRequirement = typeof projectRequirements.$inferSelect;
export type InsertProjectRequirement = typeof projectRequirements.$inferInsert;
export type AdrRequirementLink = typeof adrRequirementLinks.$inferSelect;

// ─── Attachments ─────────────────────────────────────────────────────────────

export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  adrId: integer("adr_id"),
  name: varchar("name", { length: 255 }).notNull(),
  objectName: text("object_name").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: varchar("uploaded_by", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

// ─── Notifications ───────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 100 }).notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  href: text("href"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Architecture Diagrams ───────────────────────────────────────────────────

export const diagrams = pgTable("diagrams", {
  id: serial("id").primaryKey(),
  adrId: integer("adr_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  diagramData: text("diagram_data").notNull(),
  createdBy: varchar("created_by", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Diagram = typeof diagrams.$inferSelect;
export type InsertDiagram = typeof diagrams.$inferInsert;
