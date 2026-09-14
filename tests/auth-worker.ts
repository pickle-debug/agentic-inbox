// Local-only harness: never imported by the production Worker.
import { Hono } from "hono";
import { authentication, authRoutes, type AuthContext } from "../workers/auth";
import { handleAgentRequest } from "../workers/auth/agent-route";
import { app as api } from "../workers/index";
import { AuthStore as ProductionAuthStore } from "../workers/auth/store";
import { createHash } from "node:crypto";
export class AuthStore extends ProductionAuthStore {
	seedLegacySession(token: string) {
		this.ctx.storage.sql.exec("DROP TABLE sessions");
		this.ctx.storage.sql.exec("CREATE TABLE sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL)");
		this.ctx.storage.sql.exec("INSERT INTO sessions VALUES (?, ?, ?)", createHash("sha256").update(token).digest("hex"), "gidon@example.com", Date.now() + 60_000);
	}
}
export { MailboxDO } from "../workers/durableObject";
import { EmailAgent as ProductionAgent } from "../workers/agent";
export class EmailAgent extends ProductionAgent {
	emitTestUpdate() { this.broadcast("test-update"); }
	connectionStates() { return [...this.getConnections()].map(c => c.readyState); }
}
const app = new Hono<AuthContext>();
app.use("*", authentication(true));
app.route("/", authRoutes);
app.route("/", api);
app.all("/agents/*", handleAgentRequest);
app.all("/mcp", c => c.json({ ok: true }));
app.get("/", c => c.text("ok"));
export default app;
