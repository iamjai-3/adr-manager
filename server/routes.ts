import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import {
  statusTransitionMap,
  adrStatusEnum,
  userRoleEnum,
  projectMemberRoleEnum,
} from "@shared/schema";
import { z } from "zod";
import { requireAuth, requireRole, hashPassword } from "./auth";
import { logAudit } from "./audit";
import { createNotification, notifyProjectMembers } from "./notifications";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { fileStorage } from "./file-storage";

// ─── Project-level access middleware ─────────────────────────────────────────

const roleHierarchy: Record<string, number> = { admin: 3, editor: 2, viewer: 1 };

function requireProjectAccess(minRole?: "admin" | "editor" | "viewer") {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ message: "Invalid project ID" });
    }
    const user = req.user!;
    // Global admins bypass project-level membership checks
    if (user.role === "admin") return next();

    const memberRole = await storage.getProjectMemberRole(projectId, user.id);
    if (!memberRole) {
      return res.status(403).json({ message: "You don't have access to this project" });
    }
    if (minRole && (roleHierarchy[memberRole] || 0) < (roleHierarchy[minRole] || 0)) {
      return res.status(403).json({ message: "Insufficient project permissions" });
    }
    next();
  };
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const createProjectBody = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().optional(),
  key: z
    .string()
    .min(1, "Key is required")
    .max(10)
    .regex(/^[A-Z0-9]+$/, "Key must be uppercase letters and numbers only"),
});

const updateProjectBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
});

const addMemberBody = z.object({
  userId: z.string().min(1, "User ID is required"),
  role: z.enum(projectMemberRoleEnum),
});

const updateMemberRoleBody = z.object({
  role: z.enum(projectMemberRoleEnum),
});

const createAdrBody = z.object({
  title: z.string().min(1, "Title is required").max(200),
  context: z.string().min(1, "Context is required"),
  decision: z.string().min(1, "Decision is required"),
  consequences: z.string().min(1, "Consequences are required"),
  alternatives: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  team: z.string().nullable().optional(),
  status: z.string().optional(),
});

const updateAdrBody = z.object({
  title: z.string().min(1).max(200).optional(),
  context: z.string().min(1).optional(),
  decision: z.string().min(1).optional(),
  consequences: z.string().min(1).optional(),
  alternatives: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  team: z.string().nullable().optional(),
  changeReason: z.string().optional(),
});

const statusChangeBody = z.object({
  status: z.enum(adrStatusEnum),
  reason: z.string().min(1, "Reason is required"),
});

const archiveBody = z.object({
  reason: z.string().min(1, "Reason is required"),
});

const commentBody = z.object({
  content: z.string().min(1, "Content is required"),
  section: z.string().nullable().optional(),
  parentId: z.number().nullable().optional(),
});

const relationBody = z.object({
  targetAdrId: z.number(),
  relationType: z.string().min(1),
});

// ─── Route registration ───────────────────────────────────────────────────────

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ── Projects ────────────────────────────────────────────────────────────────

  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const list = await storage.getProjects(user.id, user.role === "admin");
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const parsed = createProjectBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const project = await storage.createProject({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        key: parsed.data.key,
        createdBy: req.user!.id,
      });
      // Auto-add creator as project admin
      await storage.addProjectMember(project.id, req.user!.id, "admin");
      await logAudit({
        entityType: "project",
        entityId: project.id,
        action: "created",
        performedBy: req.user!.displayName,
        metadata: { name: project.name, key: project.key },
      });
      res.status(201).json(project);
    } catch (err: any) {
      if (err.message?.includes("unique")) {
        return res.status(409).json({ message: "Project key already in use" });
      }
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:projectId", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const project = await storage.getProject(parseInt(req.params.projectId));
      if (!project) return res.status(404).json({ message: "Project not found" });
      res.json(project);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/projects/:projectId", requireAuth, requireProjectAccess("admin"), async (req, res) => {
    try {
      const parsed = updateProjectBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const project = await storage.updateProject(parseInt(req.params.projectId), parsed.data);
      if (!project) return res.status(404).json({ message: "Project not found" });
      await logAudit({
        entityType: "project",
        entityId: project.id,
        action: "updated",
        performedBy: req.user!.displayName,
        changes: parsed.data,
      });
      res.json(project);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/projects/:projectId", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const deleted = await storage.deleteProject(projectId);
      if (!deleted) return res.status(404).json({ message: "Project not found" });
      await logAudit({
        entityType: "project",
        entityId: projectId,
        action: "deleted",
        performedBy: req.user!.displayName,
      });
      res.json({ message: "Project deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Project Members ─────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/members", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const members = await storage.getProjectMembers(parseInt(req.params.projectId));
      res.json(members);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:projectId/members", requireAuth, requireProjectAccess("admin"), async (req, res) => {
    try {
      const parsed = addMemberBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const { userId, role } = parsed.data;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const existing = await storage.getProjectMemberRole(parseInt(req.params.projectId), userId);
      if (existing) return res.status(409).json({ message: "User is already a member of this project" });

      const member = await storage.addProjectMember(parseInt(req.params.projectId), userId, role);
      await logAudit({
        entityType: "project_member",
        entityId: member.id,
        action: "added",
        performedBy: req.user!.displayName,
        metadata: { projectId: member.projectId, userId, role },
      });

      await createNotification({
        userId,
        type: "member_added",
        title: "Added to project",
        body: `You have been added to the project as ${role}`,
        href: `/projects/${member.projectId}`,
      });

      res.status(201).json(member);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/projects/:projectId/members/:userId", requireAuth, requireProjectAccess("admin"), async (req, res) => {
    try {
      const parsed = updateMemberRoleBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const projectId = parseInt(req.params.projectId);
      const member = await storage.updateProjectMemberRole(
        projectId,
        req.params.userId,
        parsed.data.role
      );
      if (!member) return res.status(404).json({ message: "Member not found" });
      await logAudit({
        entityType: "project_member",
        entityId: member.id,
        action: "role_updated",
        performedBy: req.user!.displayName,
        changes: { role: { after: parsed.data.role } },
      });
      res.json(member);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/projects/:projectId/members/:userId", requireAuth, requireProjectAccess("admin"), async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = req.params.userId;
      const deleted = await storage.removeProjectMember(projectId, userId);
      if (!deleted) return res.status(404).json({ message: "Member not found" });
      await logAudit({
        entityType: "project_member",
        entityId: `${projectId}-${userId}`,
        action: "removed",
        performedBy: req.user!.displayName,
        metadata: { projectId, userId },
      });
      res.json({ message: "Member removed" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Returns all users who are NOT yet members of the project (for Add Member dialog)
  app.get("/api/projects/:projectId/members/candidates", requireAuth, requireProjectAccess("admin"), async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const members = await storage.getProjectMembers(projectId);
      const memberUserIds = new Set(members.map((m) => m.userId));
      const allUsers = await storage.getUsers();
      const candidates = allUsers
        .filter((u) => !memberUserIds.has(u.id))
        .map(({ password: _pw, ...u }) => u);
      res.json(candidates);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Project ADRs ────────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/adrs", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const projectAdrs = await storage.getAdrs(parseInt(req.params.projectId));
      res.json(projectAdrs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:projectId/adrs/:id", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const adr = await storage.getAdr(parseInt(req.params.id), parseInt(req.params.projectId));
      if (!adr) return res.status(404).json({ message: "ADR not found" });
      res.json(adr);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:projectId/adrs", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const parsed = createAdrBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const { title, context, decision, consequences, alternatives, tags, team, status } = parsed.data;
      const author = req.user!.displayName;
      const projectId = parseInt(req.params.projectId);

      const adr = await storage.createAdr({
        projectId,
        title,
        status: status || "draft",
        context,
        decision,
        consequences,
        alternatives: alternatives ?? null,
        tags: tags || [],
        team: team ?? null,
        author,
        version: "1.0",
        archived: false,
        archiveReason: null,
      });

      await storage.createVersion({
        adrId: adr.id,
        version: "1.0",
        title: adr.title,
        status: adr.status,
        context: adr.context,
        decision: adr.decision,
        consequences: adr.consequences,
        alternatives: adr.alternatives,
        tags: adr.tags,
        team: adr.team,
        author: adr.author,
        changeReason: "Initial creation",
        changedBy: author,
      });

      await logAudit({
        entityType: "adr",
        entityId: adr.id,
        action: "created",
        performedBy: author,
        metadata: { projectId, title: adr.title, adrNumber: adr.adrNumber },
      });

      res.status(201).json(adr);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/projects/:projectId/adrs/:id", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const id = parseInt(req.params.id);
      const existing = await storage.getAdr(id, projectId);
      if (!existing) return res.status(404).json({ message: "ADR not found" });

      const parsed = updateAdrBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const { title, context, decision, consequences, alternatives, tags, team, changeReason } = parsed.data;
      const changedBy = req.user!.displayName;

      const currentParts = existing.version.split(".");
      const newMinor = parseInt(currentParts[1] || "0") + 1;
      const newVersion = `${currentParts[0]}.${newMinor}`;

      const updated = await storage.updateAdr(id, {
        title: title ?? existing.title,
        context: context ?? existing.context,
        decision: decision ?? existing.decision,
        consequences: consequences ?? existing.consequences,
        alternatives: alternatives !== undefined ? alternatives : existing.alternatives,
        tags: tags ?? existing.tags,
        team: team !== undefined ? team : existing.team,
        version: newVersion,
      });

      if (updated) {
        await storage.createVersion({
          adrId: id,
          version: newVersion,
          title: updated.title,
          status: updated.status,
          context: updated.context,
          decision: updated.decision,
          consequences: updated.consequences,
          alternatives: updated.alternatives,
          tags: updated.tags,
          team: updated.team,
          author: updated.author,
          changeReason: changeReason || "Content update",
          changedBy,
        });
      }

      await logAudit({
        entityType: "adr",
        entityId: id,
        action: "updated",
        performedBy: changedBy,
        changes: parsed.data,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/projects/:projectId/adrs/:id/status", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const id = parseInt(req.params.id);
      const existing = await storage.getAdr(id, projectId);
      if (!existing) return res.status(404).json({ message: "ADR not found" });

      const parsed = statusChangeBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const { status, reason } = parsed.data;
      const changedBy = req.user!.displayName;

      const allowed = statusTransitionMap[existing.status] || [];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: `Cannot transition from ${existing.status} to ${status}` });
      }

      const currentMajor = parseInt(existing.version.split(".")[0] || "1");
      const newVersion = `${currentMajor + 1}.0`;

      const updated = await storage.updateAdr(id, { status, version: newVersion });
      if (updated) {
        await storage.createVersion({
          adrId: id,
          version: newVersion,
          title: updated.title,
          status: updated.status,
          context: updated.context,
          decision: updated.decision,
          consequences: updated.consequences,
          alternatives: updated.alternatives,
          tags: updated.tags,
          team: updated.team,
          author: updated.author,
          changeReason: `Status changed to ${status}: ${reason}`,
          changedBy,
        });
      }

      await logAudit({
        entityType: "adr",
        entityId: id,
        action: "status_changed",
        performedBy: changedBy,
        changes: { status: { before: existing.status, after: status } },
        metadata: { reason },
      });

      await notifyProjectMembers(
        projectId,
        req.user!.id,
        "status_changed",
        `ADR ${existing.adrNumber} status changed`,
        `${changedBy} changed status from ${existing.status} to ${status}`,
        `/projects/${projectId}/adrs/${id}`
      );

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/projects/:projectId/adrs/:id/archive", requireAuth, requireProjectAccess("admin"), async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const id = parseInt(req.params.id);
      const existing = await storage.getAdr(id, projectId);
      if (!existing) return res.status(404).json({ message: "ADR not found" });

      const parsed = archiveBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const adr = await storage.archiveAdr(id, parsed.data.reason);
      if (!adr) return res.status(404).json({ message: "ADR not found" });
      await logAudit({
        entityType: "adr",
        entityId: id,
        action: "archived",
        performedBy: req.user!.displayName,
        metadata: { reason: parsed.data.reason },
      });
      res.json(adr);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:projectId/adrs/:id/versions", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const versions = await storage.getVersions(parseInt(req.params.id));
      res.json(versions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:projectId/adrs/:id/versions/:versionId", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const { adrVersions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const versionId = parseInt(req.params.versionId);
      const [version] = await db.select().from(adrVersions).where(eq(adrVersions.id, versionId));
      if (!version) return res.status(404).json({ message: "Version not found" });
      res.json(version);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:projectId/adrs/:id/comments", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const comments = await storage.getComments(parseInt(req.params.id));
      res.json(comments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:projectId/adrs/:id/comments", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const parsed = commentBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const { content, section, parentId } = parsed.data;
      const comment = await storage.createComment({
        adrId: parseInt(req.params.id),
        content,
        author: req.user!.displayName,
        section: section || null,
        parentId: parentId || null,
      });
      res.status(201).json(comment);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:projectId/adrs/:id/relations", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const relations = await storage.getRelations(parseInt(req.params.id));
      res.json(relations);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:projectId/adrs/:id/relations", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const parsed = relationBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const relation = await storage.createRelation({
        sourceAdrId: parseInt(req.params.id),
        targetAdrId: parsed.data.targetAdrId,
        relationType: parsed.data.relationType,
      });
      res.status(201).json(relation);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Attachments ─────────────────────────────────────────────────────────────

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowedTypes = ["image/png", "image/jpeg", "image/svg+xml", "image/gif", "application/pdf"];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only PNG, JPEG, SVG, GIF, and PDF files are allowed"));
      }
    },
  });

  app.post("/api/projects/:projectId/attachments",
    requireAuth,
    requireProjectAccess("editor"),
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }
        const projectId = parseInt(req.params.projectId);
        const { adrId } = req.body;
        const ext = req.file.originalname.split(".").pop() || "bin";
        const objectName = `projects/${projectId}/${uuidv4()}.${ext}`;
        
        await fileStorage.upload(objectName, req.file.buffer, req.file.mimetype, req.file.size);
        
        const attachment = await storage.createAttachment({
          projectId,
          adrId: adrId ? parseInt(adrId) : null,
          name: req.file.originalname,
          objectName,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          uploadedBy: req.user!.displayName,
        });

        await logAudit({
          entityType: "attachment",
          entityId: attachment.id,
          action: "uploaded",
          performedBy: req.user!.displayName,
          metadata: { projectId, adrId: adrId || null, name: attachment.name },
        });

        res.status(201).json(attachment);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.get("/api/projects/:projectId/attachments", requireAuth, requireProjectAccess("viewer"), async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const attachments = await storage.getProjectAttachments(projectId);
      const withUrls = await Promise.all(
        attachments.map(async (att) => ({
          ...att,
          url: await fileStorage.getSignedUrl(att.objectName),
        }))
      );
      res.json(withUrls);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:projectId/adrs/:adrId/attachments", requireAuth, requireProjectAccess("viewer"), async (req, res) => {
    try {
      const adrId = parseInt(req.params.adrId);
      const attachments = await storage.getAdrAttachments(adrId);
      const withUrls = await Promise.all(
        attachments.map(async (att) => ({
          ...att,
          url: await fileStorage.getSignedUrl(att.objectName),
        }))
      );
      res.json(withUrls);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/projects/:projectId/attachments/:id", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const attachment = await storage.getAttachment(id);
      if (!attachment) return res.status(404).json({ message: "Attachment not found" });
      
      await fileStorage.delete(attachment.objectName);
      await storage.deleteAttachment(id);
      
      await logAudit({
        entityType: "attachment",
        entityId: id,
        action: "deleted",
        performedBy: req.user!.displayName,
        metadata: { name: attachment.name },
      });

      res.json({ message: "Attachment deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Project Requirements (FR/NFR) ───────────────────────────────────────────

  app.get("/api/projects/:projectId/requirements", requireAuth, requireProjectAccess("viewer"), async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const requirements = await storage.getProjectRequirements(projectId);
      res.json(requirements);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:projectId/requirements", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const schema = z.object({
        type: z.enum(["FR", "NFR"]),
        code: z.string().min(1).max(20),
        title: z.string().min(1).max(200),
        description: z.string().optional(),
        priority: z.enum(["must", "should", "could", "wont"]).default("should"),
        status: z.enum(["draft", "approved", "deprecated"]).default("draft"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error });
      }
      const requirement = await storage.createProjectRequirement({
        ...parsed.data,
        projectId,
        createdBy: req.user!.displayName,
      });
      await logAudit({
        entityType: "requirement",
        entityId: requirement.id,
        action: "created",
        performedBy: req.user!.displayName,
        metadata: { projectId, code: requirement.code, type: requirement.type },
      });
      res.status(201).json(requirement);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/projects/:projectId/requirements/:id", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const schema = z.object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        priority: z.enum(["must", "should", "could", "wont"]).optional(),
        status: z.enum(["draft", "approved", "deprecated"]).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error });
      }
      const requirement = await storage.updateProjectRequirement(id, parsed.data);
      if (!requirement) return res.status(404).json({ message: "Requirement not found" });
      await logAudit({
        entityType: "requirement",
        entityId: id,
        action: "updated",
        performedBy: req.user!.displayName,
        changes: parsed.data,
      });
      res.json(requirement);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/projects/:projectId/requirements/:id", requireAuth, requireProjectAccess("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteProjectRequirement(id);
      if (!deleted) return res.status(404).json({ message: "Requirement not found" });
      await logAudit({
        entityType: "requirement",
        entityId: id,
        action: "deleted",
        performedBy: req.user!.displayName,
      });
      res.json({ message: "Requirement deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:projectId/adrs/:adrId/requirements", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const adrId = parseInt(req.params.adrId);
      const schema = z.object({
        requirementId: z.number(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error });
      }
      const link = await storage.linkAdrToRequirement(adrId, parsed.data.requirementId);
      res.status(201).json(link);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/projects/:projectId/adrs/:adrId/requirements/:reqId", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const adrId = parseInt(req.params.adrId);
      const reqId = parseInt(req.params.reqId);
      const deleted = await storage.unlinkAdrFromRequirement(adrId, reqId);
      if (!deleted) return res.status(404).json({ message: "Link not found" });
      res.json({ message: "Requirement unlinked" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/projects/:projectId/adrs/:adrId/requirements", requireAuth, requireProjectAccess("viewer"), async (req, res) => {
    try {
      const adrId = parseInt(req.params.adrId);
      const requirements = await storage.getAdrRequirements(adrId);
      res.json(requirements);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Notifications ────────────────────────────────────────────────────────────

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const { notifications } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const { limit = "50", offset = "0" } = req.query;
      
      const userNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.user!.id))
        .orderBy(desc(notifications.createdAt))
        .limit(parseInt(String(limit)))
        .offset(parseInt(String(offset)));
      
      res.json(userNotifications);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const { notifications } = await import("@shared/schema");
      const { eq, and, count } = await import("drizzle-orm");
      
      const [result] = await db
        .select({ count: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, req.user!.id), eq(notifications.isRead, false)));
      
      res.json({ count: result?.count || 0 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const { notifications } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const id = parseInt(req.params.id);
      
      const [notification] = await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, id), eq(notifications.userId, req.user!.id)))
        .returning();
      
      if (!notification) return res.status(404).json({ message: "Notification not found" });
      res.json(notification);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const { notifications } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.userId, req.user!.id), eq(notifications.isRead, false)));
      
      res.json({ message: "All notifications marked as read" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Search ───────────────────────────────────────────────────────────────────

  app.get("/api/search", requireAuth, async (req, res) => {
    try {
      const {
        q,
        status,
        team,
        tag,
        author,
        projectId,
        from,
        to,
        sort = "newest",
        limit = "20",
        offset = "0",
      } = req.query;

      const { adrs, projects, projectMembers } = await import("@shared/schema");
      const { eq, and, or, ilike, gte, lte, desc, asc, inArray } = await import("drizzle-orm");

      // First get projects user has access to
      let accessibleProjectIds: number[];
      if (req.user!.role === "admin") {
        const allProjects = await db.select({ id: projects.id }).from(projects);
        accessibleProjectIds = allProjects.map((p) => p.id);
      } else {
        const memberships = await db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(eq(projectMembers.userId, req.user!.id));
        accessibleProjectIds = memberships.map((m) => m.projectId);
      }

      if (accessibleProjectIds.length === 0) {
        return res.json([]);
      }

      let query = db
        .select({
          id: adrs.id,
          adrNumber: adrs.adrNumber,
          title: adrs.title,
          status: adrs.status,
          context: adrs.context,
          decision: adrs.decision,
          consequences: adrs.consequences,
          team: adrs.team,
          tags: adrs.tags,
          author: adrs.author,
          createdAt: adrs.createdAt,
          updatedAt: adrs.updatedAt,
          projectId: adrs.projectId,
          projectKey: projects.key,
          projectName: projects.name,
        })
        .from(adrs)
        .innerJoin(projects, eq(adrs.projectId, projects.id))
        .$dynamic();

      const conditions = [inArray(adrs.projectId, accessibleProjectIds)];

      if (projectId) {
        conditions.push(eq(adrs.projectId, parseInt(String(projectId))));
      }
      if (status) {
        conditions.push(eq(adrs.status, String(status)));
      }
      if (team) {
        conditions.push(eq(adrs.team, String(team)));
      }
      if (author) {
        conditions.push(eq(adrs.author, String(author)));
      }
      if (from) {
        conditions.push(gte(adrs.createdAt, new Date(String(from))));
      }
      if (to) {
        conditions.push(lte(adrs.createdAt, new Date(String(to))));
      }
      if (tag) {
        conditions.push(ilike(adrs.tags, `%${String(tag)}%`));
      }
      if (q) {
        const searchTerm = String(q);
        conditions.push(
          or(
            ilike(adrs.title, `%${searchTerm}%`),
            ilike(adrs.context, `%${searchTerm}%`),
            ilike(adrs.decision, `%${searchTerm}%`),
            ilike(adrs.consequences, `%${searchTerm}%`)
          )!
        );
      }

      query = query.where(and(...conditions));

      if (sort === "newest") {
        query = query.orderBy(desc(adrs.createdAt));
      } else if (sort === "oldest") {
        query = query.orderBy(asc(adrs.createdAt));
      } else if (sort === "title") {
        query = query.orderBy(asc(adrs.title));
      } else {
        query = query.orderBy(desc(adrs.updatedAt));
      }

      const results = await query.limit(parseInt(String(limit))).offset(parseInt(String(offset)));

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Architecture Diagrams (per ADR) ─────────────────────────────────────────

  app.get("/api/projects/:projectId/adrs/:adrId/diagrams", requireAuth, requireProjectAccess("viewer"), async (req, res) => {
    try {
      const adrId = parseInt(req.params.adrId);
      const diagrams = await storage.getAdrDiagrams(adrId);
      res.json(diagrams);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/projects/:projectId/adrs/:adrId/diagrams", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const adrId = parseInt(req.params.adrId);
      const schema = z.object({
        name: z.string().min(1).max(255),
        diagramData: z.string(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error });
      }
      const diagram = await storage.createDiagram({
        adrId,
        name: parsed.data.name,
        diagramData: parsed.data.diagramData,
        createdBy: req.user!.displayName,
      });
      await logAudit({
        entityType: "diagram",
        entityId: diagram.id,
        action: "created",
        performedBy: req.user!.displayName,
        metadata: { adrId, name: diagram.name },
      });
      res.status(201).json(diagram);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/projects/:projectId/adrs/:adrId/diagrams/:id", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const schema = z.object({
        name: z.string().min(1).max(255).optional(),
        diagramData: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error });
      }
      const diagram = await storage.updateDiagram(id, parsed.data);
      if (!diagram) return res.status(404).json({ message: "Diagram not found" });
      await logAudit({
        entityType: "diagram",
        entityId: id,
        action: "updated",
        performedBy: req.user!.displayName,
      });
      res.json(diagram);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/projects/:projectId/adrs/:adrId/diagrams/:id", requireAuth, requireProjectAccess("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteDiagram(id);
      if (!deleted) return res.status(404).json({ message: "Diagram not found" });
      await logAudit({
        entityType: "diagram",
        entityId: id,
        action: "deleted",
        performedBy: req.user!.displayName,
      });
      res.json({ message: "Diagram deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Audit Logs ──────────────────────────────────────────────────────────────

  app.get("/api/audit-logs", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { entityType, action, performedBy, from, to, limit = "50", offset = "0" } = req.query;
      
      const { auditLogs } = await import("@shared/schema");
      const { eq, and, gte, lte, desc } = await import("drizzle-orm");
      
      let query = db.select().from(auditLogs).$dynamic();
      
      const conditions = [];
      if (entityType) conditions.push(eq(auditLogs.entityType, String(entityType)));
      if (action) conditions.push(eq(auditLogs.action, String(action)));
      if (performedBy) conditions.push(eq(auditLogs.performedBy, String(performedBy)));
      if (from) conditions.push(gte(auditLogs.performedAt, new Date(String(from))));
      if (to) conditions.push(lte(auditLogs.performedAt, new Date(String(to))));
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      
      const logs = await query
        .orderBy(desc(auditLogs.performedAt))
        .limit(parseInt(String(limit)))
        .offset(parseInt(String(offset)));
      
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── Users ────────────────────────────────────────────────────────────────────

  app.get("/api/users", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
      const allUsers = await storage.getUsers();
      res.json(allUsers.map(({ password, ...u }) => u));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/users", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { username, password, displayName, role } = req.body;
      if (!username || !password || !displayName || !role) {
        return res.status(400).json({ message: "All fields are required" });
      }
      if (username.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      if (!userRoleEnum.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) return res.status(409).json({ message: "Username already taken" });

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({ username, password: hashedPassword, displayName, role });
      await logAudit({
        entityType: "user",
        entityId: user.id,
        action: "created",
        performedBy: req.user!.displayName,
        metadata: { username, role },
      });
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/users/:id/role", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { role } = req.body;
      if (!role || !userRoleEnum.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      if (req.params.id === req.user!.id) {
        return res.status(400).json({ message: "Cannot change your own role" });
      }
      const user = await storage.updateUserRole(req.params.id, role);
      if (!user) return res.status(404).json({ message: "User not found" });
      await logAudit({
        entityType: "user",
        entityId: user.id,
        action: "role_updated",
        performedBy: req.user!.displayName,
        changes: { role: { after: role } },
      });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      if (req.params.id === req.user!.id) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      const userId = req.params.id;
      const deleted = await storage.deleteUser(userId);
      if (!deleted) return res.status(404).json({ message: "User not found" });
      await logAudit({
        entityType: "user",
        entityId: userId,
        action: "deleted",
        performedBy: req.user!.displayName,
      });
      res.json({ message: "User deleted" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
