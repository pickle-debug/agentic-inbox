import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { contactInputSchema } from "../../shared/contacts";
import type { AuthContext } from "../auth";
import type { Env } from "../types";

const store = (env: Env) => env.CONTACTS.get(env.CONTACTS.idFromName("contacts"));
function malformedJson(error: unknown) {
	// Preserve body-limit stream errors so Hono can return 413 instead of 400.
	if (error instanceof SyntaxError) return null;
	throw error;
}
const positiveInteger = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().positive().safe());
const querySchema = z.object({
	q: z.string().max(200).default("").transform(value => value.trim()),
	page: positiveInteger.default("1"),
	limit: positiveInteger.default("50").refine(value => value <= 100),
}).refine(value => Number.isSafeInteger((value.page - 1) * value.limit));

export const contactRoutes = new Hono<AuthContext>();
contactRoutes.use("*", async (c, next) => {
	c.header("Cache-Control", "no-store");
	if (!c.var.identity) return c.json({ error: "请先登录。" }, 401);
	// Directory metadata is private to the admin role, including search and HEAD requests.
	if (c.var.identity.role !== "admin") return c.json({ error: "仅管理员可以访问系统联系人。" }, 403);
	return next();
});
// Allows maximum-length Chinese text while bounding JSON parsing and storage work.
contactRoutes.use("*", bodyLimit({ maxSize: 64 * 1024, onError: c => c.json({ error: "联系人内容过大。" }, 413) }));

contactRoutes.get("/", async (c) => {
	const query = querySchema.safeParse(c.req.query());
	if (!query.success) return c.json({ error: "搜索最多 200 个字符，页码必须为正整数，每页数量为 1–100。" }, 400);
	const { q, page, limit } = query.data;
	return c.json(await store(c.env).list(q, page, limit));
});

contactRoutes.post("/", async (c) => {
	const input = contactInputSchema.safeParse(await c.req.json().catch(malformedJson));
	if (!input.success) return c.json({ error: input.error.issues[0].message }, 400);
	const contact = await store(c.env).create(input.data);
	if (!contact) return c.json({ error: "该邮箱已存在于系统联系人中。" }, 409);
	return c.json(contact, 201);
});

contactRoutes.put("/:id", async (c) => {
	const input = contactInputSchema.safeParse(await c.req.json().catch(malformedJson));
	if (!input.success) return c.json({ error: input.error.issues[0].message }, 400);
	const result = await store(c.env).update(c.req.param("id"), input.data);
	if ("error" in result) return c.json({ error: result.error === "missing" ? "联系人不存在。" : "该邮箱已存在于系统联系人中。" }, result.error === "missing" ? 404 : 409);
	return c.json(result.contact);
});

contactRoutes.delete("/:id", async (c) => {
	if (!await store(c.env).remove(c.req.param("id"))) return c.json({ error: "联系人不存在。" }, 404);
	return c.body(null, 204);
});
