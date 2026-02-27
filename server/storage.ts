import {
  type Adr, type InsertAdr,
  type AdrVersion, type InsertAdrVersion,
  type AdrComment, type InsertAdrComment,
  type AdrRelation, type InsertAdrRelation,
  type User, type InsertUser,
  type Project, type InsertProject,
  type ProjectMember,
  type ProjectRequirement, type InsertProjectRequirement,
  type AdrRequirementLink,
  type Attachment, type InsertAttachment,
  type Diagram, type InsertDiagram,
  adrs, adrVersions, adrComments, adrRelations, users, projects, projectMembers,
  projectRequirements, adrRequirementLinks, attachments, diagrams,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql, or, and } from "drizzle-orm";

// ─── Project Member with User info ───────────────────────────────────────────

export type ProjectMemberWithUser = ProjectMember & {
  user: Pick<User, "id" | "username" | "displayName" | "role">;
};

// ─── Storage Interface ───────────────────────────────────────────────────────

export interface IStorage {
  // Projects
  getProjects(userId: string, isGlobalAdmin: boolean): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(data: InsertProject): Promise<Project>;
  updateProject(id: number, data: Partial<Pick<Project, "name" | "description">>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<boolean>;

  // Project Members
  getProjectMembers(projectId: number): Promise<ProjectMemberWithUser[]>;
  getProjectMemberRole(projectId: number, userId: string): Promise<string | null>;
  addProjectMember(projectId: number, userId: string, role: string): Promise<ProjectMember>;
  updateProjectMemberRole(projectId: number, userId: string, role: string): Promise<ProjectMember | undefined>;
  removeProjectMember(projectId: number, userId: string): Promise<boolean>;

  // ADRs
  getAdrs(projectId: number): Promise<Adr[]>;
  getAdr(id: number, projectId: number): Promise<Adr | undefined>;
  createAdr(adr: InsertAdr): Promise<Adr>;
  updateAdr(id: number, data: Partial<InsertAdr>): Promise<Adr | undefined>;
  archiveAdr(id: number, reason: string): Promise<Adr | undefined>;
  getNextAdrNumber(projectId: number): Promise<number>;

  // Versions
  createVersion(version: InsertAdrVersion): Promise<AdrVersion>;
  getVersions(adrId: number): Promise<AdrVersion[]>;

  // Comments
  getComments(adrId: number): Promise<AdrComment[]>;
  createComment(comment: InsertAdrComment): Promise<AdrComment>;

  // Relations
  getRelations(adrId: number): Promise<AdrRelation[]>;
  createRelation(relation: InsertAdrRelation): Promise<AdrRelation>;

  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // Project Requirements
  getProjectRequirements(projectId: number): Promise<ProjectRequirement[]>;
  getProjectRequirement(id: number): Promise<ProjectRequirement | undefined>;
  createProjectRequirement(data: InsertProjectRequirement): Promise<ProjectRequirement>;
  updateProjectRequirement(id: number, data: Partial<InsertProjectRequirement>): Promise<ProjectRequirement | undefined>;
  deleteProjectRequirement(id: number): Promise<boolean>;
  linkAdrToRequirement(adrId: number, requirementId: number): Promise<AdrRequirementLink>;
  unlinkAdrFromRequirement(adrId: number, requirementId: number): Promise<boolean>;
  getAdrRequirements(adrId: number): Promise<ProjectRequirement[]>;

  // Attachments
  createAttachment(data: InsertAttachment): Promise<Attachment>;
  getProjectAttachments(projectId: number): Promise<Attachment[]>;
  getAdrAttachments(adrId: number): Promise<Attachment[]>;
  getAttachment(id: number): Promise<Attachment | undefined>;
  deleteAttachment(id: number): Promise<boolean>;

  // Diagrams
  createDiagram(data: InsertDiagram): Promise<Diagram>;
  getAdrDiagrams(adrId: number): Promise<Diagram[]>;
  getDiagram(id: number): Promise<Diagram | undefined>;
  updateDiagram(id: number, data: Partial<InsertDiagram>): Promise<Diagram | undefined>;
  deleteDiagram(id: number): Promise<boolean>;
}

// ─── Database Storage Implementation ─────────────────────────────────────────

export class DatabaseStorage implements IStorage {

  // ── Projects ──────────────────────────────────────────────────────────────

  async getProjects(userId: string, isGlobalAdmin: boolean): Promise<Project[]> {
    if (isGlobalAdmin) {
      return db.select().from(projects).orderBy(desc(projects.createdAt));
    }
    // Return only projects the user is a member of
    const memberRows = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    const ids = memberRows.map((r) => r.projectId);
    if (ids.length === 0) return [];
    const result = await db
      .select()
      .from(projects)
      .where(sql`${projects.id} = ANY(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)})`)
      .orderBy(desc(projects.createdAt));
    return result;
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(data: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(data).returning();
    return project;
  }

  async updateProject(id: number, data: Partial<Pick<Project, "name" | "description">>): Promise<Project | undefined> {
    const [project] = await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project;
  }

  async deleteProject(id: number): Promise<boolean> {
    // Cascade: delete all members, ADRs (and their sub-records)
    await db.delete(projectMembers).where(eq(projectMembers.projectId, id));
    const projectAdrs = await db.select({ id: adrs.id }).from(adrs).where(eq(adrs.projectId, id));
    for (const adr of projectAdrs) {
      await db.delete(adrComments).where(eq(adrComments.adrId, adr.id));
      await db.delete(adrVersions).where(eq(adrVersions.adrId, adr.id));
      await db.delete(adrRelations).where(
        or(eq(adrRelations.sourceAdrId, adr.id), eq(adrRelations.targetAdrId, adr.id))
      );
    }
    await db.delete(adrs).where(eq(adrs.projectId, id));
    const result = await db.delete(projects).where(eq(projects.id, id)).returning();
    return result.length > 0;
  }

  // ── Project Members ───────────────────────────────────────────────────────

  async getProjectMembers(projectId: number): Promise<ProjectMemberWithUser[]> {
    const rows = await db
      .select({
        id: projectMembers.id,
        projectId: projectMembers.projectId,
        userId: projectMembers.userId,
        role: projectMembers.role,
        createdAt: projectMembers.createdAt,
        userId2: users.id,
        username: users.username,
        displayName: users.displayName,
        userRole: users.role,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(projectMembers.createdAt);

    return rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      userId: r.userId,
      role: r.role,
      createdAt: r.createdAt,
      user: {
        id: r.userId2,
        username: r.username,
        displayName: r.displayName,
        role: r.userRole,
      },
    }));
  }

  async getProjectMemberRole(projectId: number, userId: string): Promise<string | null> {
    const [row] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    return row?.role ?? null;
  }

  async addProjectMember(projectId: number, userId: string, role: string): Promise<ProjectMember> {
    const [member] = await db
      .insert(projectMembers)
      .values({ projectId, userId, role })
      .returning();
    return member;
  }

  async updateProjectMemberRole(projectId: number, userId: string, role: string): Promise<ProjectMember | undefined> {
    const [member] = await db
      .update(projectMembers)
      .set({ role })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning();
    return member;
  }

  async removeProjectMember(projectId: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning();
    return result.length > 0;
  }

  // ── ADRs ──────────────────────────────────────────────────────────────────

  async getAdrs(projectId: number): Promise<Adr[]> {
    return db
      .select()
      .from(adrs)
      .where(and(eq(adrs.projectId, projectId), eq(adrs.archived, false)))
      .orderBy(desc(adrs.createdAt));
  }

  async getAdr(id: number, projectId: number): Promise<Adr | undefined> {
    const [adr] = await db
      .select()
      .from(adrs)
      .where(and(eq(adrs.id, id), eq(adrs.projectId, projectId)));
    return adr;
  }

  async createAdr(data: InsertAdr): Promise<Adr> {
    const adrNumber = await this.getNextAdrNumber(data.projectId);
    const [adr] = await db
      .insert(adrs)
      .values({ ...data, adrNumber, version: "1.0" })
      .returning();
    return adr;
  }

  async updateAdr(id: number, data: Partial<InsertAdr>): Promise<Adr | undefined> {
    const [adr] = await db
      .update(adrs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adrs.id, id))
      .returning();
    return adr;
  }

  async archiveAdr(id: number, reason: string): Promise<Adr | undefined> {
    const [adr] = await db
      .update(adrs)
      .set({ archived: true, archiveReason: reason, updatedAt: new Date() })
      .where(eq(adrs.id, id))
      .returning();
    return adr;
  }

  async getNextAdrNumber(projectId: number): Promise<number> {
    const [result] = await db
      .select({ max: sql<number>`COALESCE(MAX(${adrs.adrNumber}), 0)` })
      .from(adrs)
      .where(eq(adrs.projectId, projectId));
    return (result?.max || 0) + 1;
  }

  // ── Versions ──────────────────────────────────────────────────────────────

  async createVersion(data: InsertAdrVersion): Promise<AdrVersion> {
    const [version] = await db.insert(adrVersions).values(data).returning();
    return version;
  }

  async getVersions(adrId: number): Promise<AdrVersion[]> {
    return db
      .select()
      .from(adrVersions)
      .where(eq(adrVersions.adrId, adrId))
      .orderBy(desc(adrVersions.createdAt));
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async getComments(adrId: number): Promise<AdrComment[]> {
    return db
      .select()
      .from(adrComments)
      .where(eq(adrComments.adrId, adrId))
      .orderBy(adrComments.createdAt);
  }

  async createComment(data: InsertAdrComment): Promise<AdrComment> {
    const [comment] = await db.insert(adrComments).values(data).returning();
    return comment;
  }

  // ── Relations ─────────────────────────────────────────────────────────────

  async getRelations(adrId: number): Promise<AdrRelation[]> {
    return db
      .select()
      .from(adrRelations)
      .where(
        or(eq(adrRelations.sourceAdrId, adrId), eq(adrRelations.targetAdrId, adrId))
      );
  }

  async createRelation(data: InsertAdrRelation): Promise<AdrRelation> {
    const [relation] = await db.insert(adrRelations).values(data).returning();
    return relation;
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserRole(id: string, role: string): Promise<User | undefined> {
    const [user] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    await db.delete(projectMembers).where(eq(projectMembers.userId, id));
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  // ── Project Requirements ──────────────────────────────────────────────────

  async getProjectRequirements(projectId: number): Promise<ProjectRequirement[]> {
    return db
      .select()
      .from(projectRequirements)
      .where(eq(projectRequirements.projectId, projectId))
      .orderBy(projectRequirements.code);
  }

  async getProjectRequirement(id: number): Promise<ProjectRequirement | undefined> {
    const [req] = await db
      .select()
      .from(projectRequirements)
      .where(eq(projectRequirements.id, id));
    return req;
  }

  async createProjectRequirement(data: InsertProjectRequirement): Promise<ProjectRequirement> {
    const [req] = await db.insert(projectRequirements).values(data).returning();
    return req;
  }

  async updateProjectRequirement(id: number, data: Partial<InsertProjectRequirement>): Promise<ProjectRequirement | undefined> {
    const [req] = await db
      .update(projectRequirements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectRequirements.id, id))
      .returning();
    return req;
  }

  async deleteProjectRequirement(id: number): Promise<boolean> {
    await db.delete(adrRequirementLinks).where(eq(adrRequirementLinks.requirementId, id));
    const result = await db
      .delete(projectRequirements)
      .where(eq(projectRequirements.id, id))
      .returning();
    return result.length > 0;
  }

  async linkAdrToRequirement(adrId: number, requirementId: number): Promise<AdrRequirementLink> {
    const [link] = await db
      .insert(adrRequirementLinks)
      .values({ adrId, requirementId })
      .returning();
    return link;
  }

  async unlinkAdrFromRequirement(adrId: number, requirementId: number): Promise<boolean> {
    const result = await db
      .delete(adrRequirementLinks)
      .where(and(eq(adrRequirementLinks.adrId, adrId), eq(adrRequirementLinks.requirementId, requirementId)))
      .returning();
    return result.length > 0;
  }

  async getAdrRequirements(adrId: number): Promise<ProjectRequirement[]> {
    const links = await db
      .select({
        id: projectRequirements.id,
        projectId: projectRequirements.projectId,
        type: projectRequirements.type,
        code: projectRequirements.code,
        title: projectRequirements.title,
        description: projectRequirements.description,
        priority: projectRequirements.priority,
        status: projectRequirements.status,
        createdBy: projectRequirements.createdBy,
        createdAt: projectRequirements.createdAt,
        updatedAt: projectRequirements.updatedAt,
      })
      .from(adrRequirementLinks)
      .innerJoin(projectRequirements, eq(adrRequirementLinks.requirementId, projectRequirements.id))
      .where(eq(adrRequirementLinks.adrId, adrId));
    return links;
  }

  // ── Attachments ───────────────────────────────────────────────────────────

  async createAttachment(data: InsertAttachment): Promise<Attachment> {
    const [attachment] = await db.insert(attachments).values(data).returning();
    return attachment;
  }

  async getProjectAttachments(projectId: number): Promise<Attachment[]> {
    return db
      .select()
      .from(attachments)
      .where(eq(attachments.projectId, projectId))
      .orderBy(desc(attachments.createdAt));
  }

  async getAdrAttachments(adrId: number): Promise<Attachment[]> {
    return db
      .select()
      .from(attachments)
      .where(eq(attachments.adrId, adrId))
      .orderBy(attachments.createdAt);
  }

  async getAttachment(id: number): Promise<Attachment | undefined> {
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id));
    return attachment;
  }

  async deleteAttachment(id: number): Promise<boolean> {
    const result = await db
      .delete(attachments)
      .where(eq(attachments.id, id))
      .returning();
    return result.length > 0;
  }

  // ── Diagrams ──────────────────────────────────────────────────────────────

  async createDiagram(data: InsertDiagram): Promise<Diagram> {
    const [diagram] = await db.insert(diagrams).values(data).returning();
    return diagram;
  }

  async getAdrDiagrams(adrId: number): Promise<Diagram[]> {
    return db
      .select()
      .from(diagrams)
      .where(eq(diagrams.adrId, adrId))
      .orderBy(desc(diagrams.updatedAt));
  }

  async getDiagram(id: number): Promise<Diagram | undefined> {
    const [diagram] = await db.select().from(diagrams).where(eq(diagrams.id, id));
    return diagram;
  }

  async updateDiagram(id: number, data: Partial<InsertDiagram>): Promise<Diagram | undefined> {
    const [diagram] = await db
      .update(diagrams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(diagrams.id, id))
      .returning();
    return diagram;
  }

  async deleteDiagram(id: number): Promise<boolean> {
    const result = await db.delete(diagrams).where(eq(diagrams.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
