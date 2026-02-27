import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

// ─── Platform project ADRs ────────────────────────────────────────────────────

const platformAdrs = [
  {
    title: "Use PostgreSQL as Primary Data Store",
    status: "accepted",
    context: "Our application requires a reliable, ACID-compliant relational database to handle complex queries, transactions, and data integrity. We evaluated several options including MySQL, MongoDB, and CockroachDB.",
    decision: "We will use PostgreSQL 16 as our primary data store for all transactional data. We will leverage PostgreSQL-specific features such as JSONB columns for semi-structured data and full-text search capabilities.",
    consequences: "PostgreSQL provides excellent reliability and feature set. The trade-off is vendor lock-in to a relational model. Connection pooling adds operational complexity.",
    alternatives: "MongoDB was considered for its flexible schema, but our data is highly relational. CockroachDB was evaluated for horizontal scaling but added unnecessary complexity.",
    tags: ["database", "infrastructure", "backend"],
    team: "Platform",
    author: "Jayaprakash",
  },
  {
    title: "Adopt Event-Driven Architecture for Service Communication",
    status: "accepted",
    context: "As our system grows, synchronous HTTP-based communication between services creates tight coupling and cascading failures. The Payments team experienced a 2-hour outage when the Notification service was down.",
    decision: "We will adopt an event-driven architecture using Apache Kafka as our message broker for inter-service communication. Each service will publish domain events to dedicated topics.",
    consequences: "Event-driven communication provides better resilience and loose coupling. However, it introduces eventual consistency. The team needs to learn Kafka operations.",
    alternatives: "RabbitMQ was considered but lacks Kafka's durability and replay capabilities. AWS SQS was evaluated but we prefer flexibility.",
    tags: ["messaging", "infrastructure", "microservices"],
    team: "Platform",
    author: "Arun",
  },
  {
    title: "Adopt Redis for Session and Cache Management",
    status: "accepted",
    context: "Application response times are increasing as database load grows. Frequently accessed data is being fetched from PostgreSQL on every request.",
    decision: "We will deploy Redis 7 as our caching layer and session store. User sessions will be stored in Redis with TTL-based expiration.",
    consequences: "Redis dramatically improves read performance and reduces database load. The operational complexity increases with another data store to manage.",
    alternatives: "Memcached was considered but lacks Redis's data structure versatility. Application-level caching was rejected because it doesn't work across multiple instances.",
    tags: ["caching", "performance", "infrastructure"],
    team: "Backend",
    author: "Jayaprakash",
  },
];

// ─── Frontend project ADRs ────────────────────────────────────────────────────

const frontendAdrs = [
  {
    title: "Implement OAuth 2.0 with PKCE for Frontend Authentication",
    status: "in_review",
    context: "Our current authentication uses session-based cookies, which doesn't scale well for our planned mobile app and third-party integrations. Security audit also flagged the need for proper token rotation.",
    decision: "We will implement OAuth 2.0 Authorization Code flow with PKCE for all frontend applications. Access tokens will be short-lived (15 minutes) and refresh tokens will be rotated on each use.",
    consequences: "OAuth 2.0 with PKCE provides industry-standard security. The complexity of token management increases on the frontend. The authorization server becomes a critical piece of infrastructure.",
    alternatives: "Auth0 was considered as a managed solution but rejected due to cost. Firebase Auth was evaluated but doesn't support fine-grained scopes.",
    tags: ["auth", "security", "api"],
    team: "Auth",
    author: "Priya",
  },
  {
    title: "Migrate Frontend to React Server Components",
    status: "proposed",
    context: "Our current React SPA sends large JavaScript bundles to the client, resulting in slow initial page loads (4.2s on 3G). Search engine indexing is poor because content is rendered client-side.",
    decision: "We will migrate our frontend to Next.js 15 with React Server Components (RSC). Page-level data fetching will happen on the server, reducing client-side JavaScript.",
    consequences: "RSC reduces client-side bundle size and improves Time to First Byte. The mental model shift requires team training. Some existing libraries may not be compatible.",
    alternatives: "Astro was considered for its island architecture but ecosystem maturity was a concern. Remix was evaluated but RSC's model aligns better with our React expertise.",
    tags: ["frontend", "performance"],
    team: "Frontend",
    author: "Ravi",
  },
  {
    title: "Deprecate REST API v1 in Favor of GraphQL Gateway",
    status: "deprecated",
    context: "Our REST API v1 has grown to 87 endpoints, many of which return over-fetched data. Mobile clients make 6-12 sequential API calls to render a single screen.",
    decision: "We decided to deprecate REST API v1 and introduce a GraphQL gateway as the primary API for frontend consumers. The gateway will federate across our microservices using Apollo Federation.",
    consequences: "GraphQL reduces over-fetching and allows clients to request exactly the data they need. The N+1 query problem requires careful resolver design. Caching is more complex than REST.",
    alternatives: "REST API v3 with field selection was considered but doesn't solve the multiple-endpoint problem. tRPC was evaluated but doesn't provide a standard query language for external consumers.",
    tags: ["api", "frontend", "backend"],
    team: "Platform",
    author: "Arun",
  },
];

// ─── Seed function ────────────────────────────────────────────────────────────

export async function seedDatabase() {
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    return;
  }

  console.log("Seeding database with demo data...");

  // Create admin user
  const adminPassword = await hashPassword("admin123");
  const admin = await storage.createUser({
    username: "admin",
    password: adminPassword,
    displayName: "Admin User",
    role: "admin",
  });

  // Create an editor user – will be in Platform project only
  const alicePassword = await hashPassword("alice123");
  const alice = await storage.createUser({
    username: "alice",
    password: alicePassword,
    displayName: "Alice Editor",
    role: "editor",
  });

  // Create a viewer user – will be in Platform project only
  const viewerPassword = await hashPassword("viewer123");
  const viewer = await storage.createUser({
    username: "viewer",
    password: viewerPassword,
    displayName: "Demo Viewer",
    role: "viewer",
  });

  // Create two more users that are not yet in any project (available to be added)
  const bobPassword = await hashPassword("bob123");
  const bob = await storage.createUser({
    username: "bob",
    password: bobPassword,
    displayName: "Bob Dev",
    role: "editor",
  });

  const carolPassword = await hashPassword("carol123");
  const carol = await storage.createUser({
    username: "carol",
    password: carolPassword,
    displayName: "Carol Viewer",
    role: "viewer",
  });

  // Create Platform project  – admin + alice + viewer are members; bob & carol are not
  const platformProject = await storage.createProject({
    name: "Platform Engineering",
    description: "Architecture decisions for the core platform infrastructure",
    key: "PLAT",
    createdBy: admin.id,
  });
  await storage.addProjectMember(platformProject.id, admin.id, "admin");
  await storage.addProjectMember(platformProject.id, alice.id, "editor");
  await storage.addProjectMember(platformProject.id, viewer.id, "viewer");

  // Seed platform ADRs
  for (const data of platformAdrs) {
    const adr = await storage.createAdr({
      projectId: platformProject.id,
      title: data.title,
      status: data.status,
      context: data.context,
      decision: data.decision,
      consequences: data.consequences,
      alternatives: data.alternatives,
      tags: data.tags,
      team: data.team,
      author: data.author,
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
      changedBy: adr.author,
    });
  }

  // Create Frontend project – admin + bob are members; alice, viewer & carol are not
  const frontendProject = await storage.createProject({
    name: "Frontend Team",
    description: "Architecture decisions for the frontend and API layer",
    key: "FE",
    createdBy: admin.id,
  });
  await storage.addProjectMember(frontendProject.id, admin.id, "admin");
  await storage.addProjectMember(frontendProject.id, bob.id, "editor");

  // Seed frontend ADRs
  for (const data of frontendAdrs) {
    const adr = await storage.createAdr({
      projectId: frontendProject.id,
      title: data.title,
      status: data.status,
      context: data.context,
      decision: data.decision,
      consequences: data.consequences,
      alternatives: data.alternatives,
      tags: data.tags,
      team: data.team,
      author: data.author,
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
      changedBy: adr.author,
    });
  }

  console.log(`✓ Seeded 2 projects, ${platformAdrs.length + frontendAdrs.length} ADRs, and 5 users`);
  console.log("Demo credentials:");
  console.log("  admin/admin123   (global admin, admin in both projects)");
  console.log("  alice/alice123   (editor, member of Platform only)");
  console.log("  viewer/viewer123 (viewer, member of Platform only)");
  console.log("  bob/bob123       (editor, member of Frontend only)");
  console.log("  carol/carol123   (viewer, not in any project)");
}

// Run the seed function only if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      console.log("✓ Database seeding completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("✗ Database seeding failed:", error);
      process.exit(1);
    });
}
