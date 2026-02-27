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
import { getAIProvider, isAIConfigured, parseAIJson } from "./ai/index";
import rateLimit from "express-rate-limit";

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      if (err instanceof Error && err.message?.includes("unique")) {
        return res.status(409).json({ message: "Project key already in use" });
      }
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  app.get("/api/projects/:projectId", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const project = await storage.getProject(parseInt(req.params.projectId));
      if (!project) return res.status(404).json({ message: "Project not found" });
      res.json(project);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  // ── Project Members ─────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/members", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const members = await storage.getProjectMembers(parseInt(req.params.projectId));
      res.json(members);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  // ── Project ADRs ────────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/adrs", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const projectAdrs = await storage.getAdrs(parseInt(req.params.projectId));
      res.json(projectAdrs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  app.get("/api/projects/:projectId/adrs/:id", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const adr = await storage.getAdr(parseInt(req.params.id), parseInt(req.params.projectId));
      if (!adr) return res.status(404).json({ message: "ADR not found" });
      res.json(adr);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  app.get("/api/projects/:projectId/adrs/:id/versions", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const versions = await storage.getVersions(parseInt(req.params.id));
      res.json(versions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  app.get("/api/projects/:projectId/adrs/:id/comments", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const comments = await storage.getComments(parseInt(req.params.id));
      res.json(comments);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  app.get("/api/projects/:projectId/adrs/:id/relations", requireAuth, requireProjectAccess(), async (req, res) => {
    try {
      const relations = await storage.getRelations(parseInt(req.params.id));
      res.json(relations);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  // ── Project Requirements (FR/NFR) ───────────────────────────────────────────

  app.get("/api/projects/:projectId/requirements", requireAuth, requireProjectAccess("viewer"), async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const requirements = await storage.getProjectRequirements(projectId);
      res.json(requirements);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  app.delete("/api/projects/:projectId/adrs/:adrId/requirements/:reqId", requireAuth, requireProjectAccess("editor"), async (req, res) => {
    try {
      const adrId = parseInt(req.params.adrId);
      const reqId = parseInt(req.params.reqId);
      const deleted = await storage.unlinkAdrFromRequirement(adrId, reqId);
      if (!deleted) return res.status(404).json({ message: "Link not found" });
      res.json({ message: "Requirement unlinked" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  app.get("/api/projects/:projectId/adrs/:adrId/requirements", requireAuth, requireProjectAccess("viewer"), async (req, res) => {
    try {
      const adrId = parseInt(req.params.adrId);
      const requirements = await storage.getAdrRequirements(adrId);
      res.json(requirements);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  // ── Notifications ────────────────────────────────────────────────────────────

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const { notifications } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const rawLimit = Math.min(Math.max(parseInt(String(req.query.limit || "50")), 1), 200);
      const rawOffset = Math.max(parseInt(String(req.query.offset || "0")), 0);

      const userNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.user!.id))
        .orderBy(desc(notifications.createdAt))
        .limit(isNaN(rawLimit) ? 50 : rawLimit)
        .offset(isNaN(rawOffset) ? 0 : rawOffset);
      
      res.json(userNotifications);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
      } = req.query;

      const SORT_ALLOWLIST = ["newest", "oldest", "title"] as const;
      const rawSort = String(req.query.sort || "newest");
      const sort = SORT_ALLOWLIST.includes(rawSort as (typeof SORT_ALLOWLIST)[number])
        ? rawSort
        : "newest";
      const limit = Math.min(Math.max(parseInt(String(req.query.limit || "20")), 1), 100);
      const offset = Math.max(parseInt(String(req.query.offset || "0")), 0);

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

      const results = await query
        .limit(isNaN(limit) ? 20 : limit)
        .offset(isNaN(offset) ? 0 : offset);

      res.json(results);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  // ── Architecture Diagrams (per ADR) ─────────────────────────────────────────

  app.get("/api/projects/:projectId/adrs/:adrId/diagrams", requireAuth, requireProjectAccess("viewer"), async (req, res) => {
    try {
      const adrId = parseInt(req.params.adrId);
      const diagrams = await storage.getAdrDiagrams(adrId);
      res.json(diagrams);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  // ── Audit Logs ──────────────────────────────────────────────────────────────

  app.get("/api/audit-logs", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { entityType, action, performedBy, from, to } = req.query;
      const auditLimit = Math.min(Math.max(parseInt(String(req.query.limit || "50")), 1), 200);
      const auditOffset = Math.max(parseInt(String(req.query.offset || "0")), 0);
      
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
        .limit(isNaN(auditLimit) ? 50 : auditLimit)
        .offset(isNaN(auditOffset) ? 0 : auditOffset);
      
      res.json(logs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  // ── Users ────────────────────────────────────────────────────────────────────

  app.get("/api/users", requireAuth, requireRole("admin"), async (_req, res) => {
    try {
      const allUsers = await storage.getUsers();
      res.json(allUsers.map(({ password, ...u }) => u));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal server error"; res.status(500).json({ message: msg });
    }
  });

  // ── AI Routes ─────────────────────────────────────────────────────────────

  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many AI requests, please wait a minute." },
  });

  // GET /api/ai/status — let the frontend know if AI is available
  app.get("/api/ai/status", requireAuth, (_req, res) => {
    const configured = isAIConfigured();
    const provider = process.env.AI_PROVIDER || "openai";
    res.json({ enabled: configured, provider });
  });

  // POST /api/ai/generate-draft — generate a full ADR draft from a title + description
  app.post("/api/ai/generate-draft", requireAuth, aiLimiter, async (req, res) => {
    if (!isAIConfigured()) {
      return res.status(503).json({ message: "AI provider is not configured" });
    }
    const { projectId, title, description } = req.body as {
      projectId: number;
      title: string;
      description: string;
    };
    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ message: "title and description are required" });
    }

    try {
      const { adrs, projectRequirements: reqTable } = await import("@shared/schema");
      const { eq, desc, and } = await import("drizzle-orm");

      // Fetch up to 3 recent accepted ADRs for style context
      const exampleAdrs = await db
        .select({ title: adrs.title, context: adrs.context, decision: adrs.decision, consequences: adrs.consequences, alternatives: adrs.alternatives })
        .from(adrs)
        .where(and(eq(adrs.projectId, projectId), eq(adrs.status, "accepted")))
        .orderBy(desc(adrs.createdAt))
        .limit(3);

      // Fetch project requirements for additional context
      const reqs = await db
        .select()
        .from(reqTable)
        .where(eq(reqTable.projectId, projectId));

      const reqLines = reqs.map((r) => `- [${r.type}-${r.code}] ${r.title}: ${r.description ?? ""}`).join("\n");
      const reqContext = reqs.length > 0 ? `\nProject Requirements:\n${reqLines}` : "";

      const examplesContext =
        exampleAdrs.length > 0
          ? `\nExisting accepted ADRs (follow their tone and style):\n${exampleAdrs
              .map(
                (a, i) =>
                  `ADR ${i + 1}: "${a.title}"\nContext: ${a.context?.substring(0, 200) ?? ""}...\nDecision: ${a.decision?.substring(0, 200) ?? ""}...`
              )
              .join("\n\n")}`
          : "";

      const systemPrompt = `You are an expert software architect specializing in Architecture Decision Records (ADRs).
Your task is to generate a complete, well-structured ADR draft based on the given title and description.
Return ONLY valid JSON with exactly these four keys: "context", "decision", "consequences", "alternatives".
Each value should be rich HTML (using <p>, <ul>, <li>, <strong>, <em> tags only — no headings).
Be specific, actionable, and professional. Think like a senior architect.${examplesContext}${reqContext}`;

      const userPrompt = `Generate a complete ADR draft for:
Title: "${title}"
Description: "${description}"

Return JSON with keys: context, decision, consequences, alternatives.`;

      const ai = getAIProvider();
      const raw = await ai.chat(systemPrompt, userPrompt);
      const draft = parseAIJson<{
        context: string;
        decision: string;
        consequences: string;
        alternatives: string;
      }>(raw);

      res.json(draft);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI generation failed";
      res.status(500).json({ message: msg });
    }
  });

  // POST /api/ai/review-adr — analyze an existing ADR and return structured review
  app.post("/api/ai/review-adr", requireAuth, aiLimiter, async (req, res) => {
    if (!isAIConfigured()) {
      return res.status(503).json({ message: "AI provider is not configured" });
    }
    const { adrId, projectId } = req.body as { adrId: number; projectId: number };
    if (!adrId || !projectId) {
      return res.status(400).json({ message: "adrId and projectId are required" });
    }

    try {
      const adr = await storage.getAdr(adrId);
      if (!adr) return res.status(404).json({ message: "ADR not found" });

      // Fetch related ADRs and requirements for richer context
      const { adrRelations, adrs, projectRequirements, adrRequirementLinks } = await import("@shared/schema");
      const { eq, or } = await import("drizzle-orm");

      const relations = await db
        .select()
        .from(adrRelations)
        .where(or(eq(adrRelations.sourceAdrId, adrId), eq(adrRelations.targetAdrId, adrId)));

      const relatedAdrIds = relations.flatMap((r) => [r.sourceAdrId, r.targetAdrId]).filter((id) => id !== adrId);

      const relatedAdrTitles =
        relatedAdrIds.length > 0
          ? await db.select({ title: adrs.title, status: adrs.status }).from(adrs).where(eq(adrs.id, relatedAdrIds[0]))
          : [];

      const linkedReqs = await db
        .select({ title: projectRequirements.title, type: projectRequirements.type, code: projectRequirements.code })
        .from(adrRequirementLinks)
        .innerJoin(projectRequirements, eq(adrRequirementLinks.requirementId, projectRequirements.id))
        .where(eq(adrRequirementLinks.adrId, adrId));

      const systemPrompt = `You are a senior software architect performing a thorough review of an Architecture Decision Record (ADR).
Evaluate the ADR on completeness, clarity, risk awareness, and architectural soundness.
Return ONLY valid JSON with this exact structure:
{
  "overallScore": <1-10>,
  "completeness": { "score": <1-10>, "feedback": "<string>" },
  "clarity": { "score": <1-10>, "feedback": "<string>" },
  "risks": ["<risk1>", "<risk2>"],
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>"],
  "missingConsiderations": ["<missing item 1>", "<missing item 2>"]
}
Be specific and constructive. Reference the ADR content directly in your feedback.`;

      const relatedParts = relatedAdrTitles.map((a) => `"${a.title}" (${a.status})`).join(", ");
      const relatedContext = relatedAdrTitles.length > 0 ? `\nRelated ADRs: ${relatedParts}` : "";
      const reqParts = linkedReqs.map((r) => `[${r.type}-${r.code}] ${r.title}`).join(", ");
      const reqContext = linkedReqs.length > 0 ? `\nLinked Requirements: ${reqParts}` : "";

      const userPrompt = `Review this ADR:

Title: ${adr.title}
Status: ${adr.status}
Context: ${adr.context ?? "Not provided"}
Decision: ${adr.decision ?? "Not provided"}
Consequences: ${adr.consequences ?? "Not provided"}
Alternatives: ${adr.alternatives ?? "Not provided"}${relatedContext}${reqContext}`;

      const ai = getAIProvider();
      const raw = await ai.chat(systemPrompt, userPrompt);
      const review = parseAIJson<{
        overallScore: number;
        completeness: { score: number; feedback: string };
        clarity: { score: number; feedback: string };
        risks: string[];
        suggestions: string[];
        missingConsiderations: string[];
      }>(raw);

      res.json(review);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI review failed";
      res.status(500).json({ message: msg });
    }
  });

  // POST /api/ai/suggest-adrs — suggest new ADRs based on project requirements
  app.post("/api/ai/suggest-adrs", requireAuth, aiLimiter, async (req, res) => {
    if (!isAIConfigured()) {
      return res.status(503).json({ message: "AI provider is not configured" });
    }
    const { projectId } = req.body as { projectId: number };
    if (!projectId) {
      return res.status(400).json({ message: "projectId is required" });
    }

    try {
      const { projectRequirements, adrs } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const reqs = await db.select().from(projectRequirements).where(eq(projectRequirements.projectId, projectId));
      const existingAdrs = await db
        .select({ title: adrs.title, status: adrs.status, context: adrs.context })
        .from(adrs)
        .where(eq(adrs.projectId, projectId));

      if (reqs.length === 0) {
        return res.json({ suggestions: [] });
      }

      const systemPrompt = `You are a senior software architect. Given a list of project requirements (FR/NFR) and existing ADRs, identify architectural decisions that are missing and should be documented.
Return ONLY valid JSON:
{
  "suggestions": [
    {
      "title": "<concise ADR title>",
      "description": "<1-2 sentences describing the decision needed>",
      "addressesRequirements": ["<req code 1>", "<req code 2>"],
      "priority": "high|medium|low",
      "rationale": "<why this ADR is needed>"
    }
  ]
}
Focus on gaps — don't suggest ADRs that are clearly already covered by existing ones. Return 3-7 suggestions maximum.`;

      const userPrompt = `Project Requirements:
${reqs.map((r) => `[${r.type}-${r.code}] (${r.priority}) ${r.title}: ${r.description ?? ""}`).join("\n")}

Existing ADRs:
${existingAdrs.length > 0 ? existingAdrs.map((a) => `- "${a.title}" (${a.status})`).join("\n") : "None yet"}

Suggest missing architectural decisions.`;

      const ai = getAIProvider();
      const raw = await ai.chat(systemPrompt, userPrompt);
      const result = parseAIJson<{
        suggestions: {
          title: string;
          description: string;
          addressesRequirements: string[];
          priority: string;
          rationale: string;
        }[];
      }>(raw);

      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI suggestion failed";
      res.status(500).json({ message: msg });
    }
  });

  // POST /api/ai/search — semantic natural-language search over ADRs
  app.post("/api/ai/search", requireAuth, aiLimiter, async (req, res) => {
    if (!isAIConfigured()) {
      return res.status(503).json({ message: "AI provider is not configured" });
    }
    const { query, projectId } = req.body as { query: string; projectId?: number };
    if (!query?.trim()) {
      return res.status(400).json({ message: "query is required" });
    }

    try {
      const { adrs, projects, projectMembers } = await import("@shared/schema");
      const { eq, inArray, and } = await import("drizzle-orm");

      // Determine which projects the user can access
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
        return res.json({ results: [] });
      }

      const conditions = [inArray(adrs.projectId, accessibleProjectIds)];
      if (projectId) conditions.push(eq(adrs.projectId, projectId));

      const allAdrs = await db
        .select({
          id: adrs.id,
          adrNumber: adrs.adrNumber,
          title: adrs.title,
          status: adrs.status,
          context: adrs.context,
          decision: adrs.decision,
          projectId: adrs.projectId,
          projectKey: projects.key,
          projectName: projects.name,
        })
        .from(adrs)
        .innerJoin(projects, eq(adrs.projectId, projects.id))
        .where(and(...conditions));

      if (allAdrs.length === 0) {
        return res.json({ results: [] });
      }

      // Strip HTML tags for cleaner context
      const stripHtml = (html: string | null): string => {
        const noTags = (html ?? "").replaceAll(/<[^>]*>/g, " ");
        return noTags.replaceAll(/\s+/g, " ").trim().substring(0, 300);
      };

      const adrList = allAdrs
        .map((a) => `ID:${a.id} [${a.projectKey}-${a.adrNumber}] "${a.title}" (${a.status}) — ${stripHtml(a.context)}`)
        .join("\n");

      const systemPrompt = `You are a semantic search engine for Architecture Decision Records (ADRs).
Given a natural language query and a list of ADRs, rank the most relevant ones.
Return ONLY valid JSON:
{
  "results": [
    { "adrId": <number>, "score": <0.0-1.0>, "explanation": "<1 sentence why this matches>" }
  ]
}
Return at most 10 results, only those with score >= 0.3, sorted by score descending.`;

      const userPrompt = `Query: "${query}"

ADRs:
${adrList}`;

      const ai = getAIProvider();
      const raw = await ai.chat(systemPrompt, userPrompt);
      const aiResult = parseAIJson<{ results: { adrId: number; score: number; explanation: string }[] }>(raw);

      // Merge AI scores with full ADR metadata
      const adrMap = new Map(allAdrs.map((a) => [a.id, a]));
      const enriched = aiResult.results
        .filter((r) => adrMap.has(r.adrId))
        .map((r) => ({ ...r, ...adrMap.get(r.adrId)! }));

      res.json({ results: enriched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI search failed";
      res.status(500).json({ message: msg });
    }
  });

  return httpServer;
}
