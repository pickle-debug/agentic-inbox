export type Locale = "en" | "zh";

export const LANGUAGE_COOKIE = "inbox-language";

export function isLocale(value: unknown): value is Locale {
	return value === "en" || value === "zh";
}

export function getRequestLocale(headers: Headers): Locale {
	const saved = headers.get("Cookie")?.split(";").map((part) => part.trim())
		.find((part) => part.startsWith(`${LANGUAGE_COOKIE}=`))?.slice(LANGUAGE_COOKIE.length + 1);
	if (isLocale(saved)) return saved;

	const languages = (headers.get("Accept-Language") || "").split(",")
		.map((part) => {
			const [tag, ...parameters] = part.trim().toLowerCase().split(";");
			const quality = parameters.find((parameter) => parameter.trim().startsWith("q="));
			return { tag, quality: quality ? Number(quality.trim().slice(2)) : 1 };
		})
		.filter(({ quality }) => quality > 0 && quality <= 1)
		.sort((a, b) => b.quality - a.quality);
	for (const { tag } of languages) {
		if (tag === "zh" || tag.startsWith("zh-")) return "zh";
		if (tag === "en" || tag.startsWith("en-")) return "en";
	}
	return "en";
}

export function languageCookie(locale: Locale, secure: boolean): string {
	return `${LANGUAGE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

// Translate known API/validation messages at the display boundary; keep unknown diagnostics intact.
const messages = [
	["Attachments can be up to 25 MB in total.", "附件总大小不得超过 25 MB。"],
	["No mailbox selected.", "尚未选择邮箱。"],
	["Add at least one recipient.", "请至少添加一位收件人。"],
	["Failed to save draft.", "草稿保存失败。"],
	["Failed to read attachments.", "附件读取失败。"],
	["Failed to send email.", "邮件发送失败。"],
	["Failed to read attachment.", "附件读取失败。"],
	["Failed to encode attachment.", "附件编码失败。"],
	["Login failed. Check your email and password.", "登录失败，请检查邮箱和密码。"],
	["Please fill in all fields", "请填写所有必填项"],
	["Failed to create mailbox", "创建邮箱失败"],
	["Failed to save settings", "保存设置失败"],
	["Failed to save. Please try again.", "保存失败，请重试。"],
	["Failed to delete. Please try again.", "删除失败，请重试。"],
	["Failed to set password. Please try again.", "设置密码失败，请重试。"],
	["Failed to disable password login. Please try again.", "停用密码登录失败，请重试。"],
	["Please sign in first.", "请先登录。"],
	["Enter a valid email and password.", "请输入有效的邮箱和密码。"],
	["Incorrect email or password.", "邮箱或密码不正确。"],
	["Current password is incorrect.", "当前密码不正确。"],
	["You can only change your own mailbox password.", "只能修改自己邮箱的密码。"],
	["Enter your current password. The new password must be 12–128 characters.", "请输入当前密码，新密码长度必须为 12–128 个字符。"],
	["Too many attempts. Try again in 15 minutes.", "尝试次数过多，请 15 分钟后重试。"],
	["Request origin does not match.", "请求来源不匹配。"],
	["You do not have access to this mailbox.", "无权访问该邮箱。"],
	["Only administrators can use MCP.", "仅管理员可以使用 MCP。"],
	["Only administrators can access system contacts.", "仅管理员可以访问系统联系人。"],
	["The administrator entry point has not passed Cloudflare Access verification. Check its Access configuration.", "管理员入口未通过 Cloudflare Access 验证，请检查该路径的 Access 配置。"],
	["Password must be 12–128 characters.", "密码长度必须为 12–128 个字符。"],
	["Password must be 12 to 128 characters.", "密码长度必须在 12 到 128 个字符之间。"],
	["Passwords do not match.", "两次输入的密码不一致。"],
	["Enter a contact name.", "请填写联系人姓名。"],
	["Name must be at most 120 characters.", "姓名最多 120 个字符。"],
	["Enter a valid email address.", "请输入有效的邮箱地址。"],
	["Notes must be at most 1,000 characters.", "备注最多 1000 个字符。"],
	["Introduction must be at most 4,000 characters.", "介绍最多 4000 个字符。"],
	["Contact content is too large.", "联系人内容过大。"],
	["Search must be at most 200 characters, page must be a positive integer, and page size must be 1–100.", "搜索最多 200 个字符，页码必须为正整数，每页数量为 1–100。"],
	["This email already exists in system contacts.", "该邮箱已存在于系统联系人中。"],
	["Contact not found.", "联系人不存在。"],
	["Enter a valid forwarding email address.", "请输入有效的转发邮箱地址。"],
	["Enter a message before enabling automatic replies.", "启用自动回复前，请填写回复内容。"],
	["The reply subject must be a single line.", "回复主题必须为单行文本。"],
	["String must contain at most 200 character(s)", "最多允许 200 个字符。"],
	["String must contain at most 254 character(s)", "最多允许 254 个字符。"],
	["String must contain at most 10000 character(s)", "最多允许 10,000 个字符。"],
	["Only administrators can perform this action.", "仅管理员可执行此操作。"],
	["Only administrators can manage passwords.", "仅管理员可管理密码。"],
	["Only administrators can create mailboxes.", "仅管理员可以创建邮箱。"],
	["Only administrators can delete mailboxes.", "仅管理员可以删除邮箱。"],
	["The mailbox must belong to a configured domain.", "邮箱必须属于已配置的域名。"],
	["Mailbox already exists", "邮箱已存在。"],
	["Mailbox creation is restricted to configured EMAIL_ADDRESSES", "只能创建 EMAIL_ADDRESSES 中配置的邮箱。"],
	["Folder name must contain alphanumeric characters", "文件夹名称必须包含英文字母或数字。"],
	["Folder with this name already exists", "同名文件夹已存在。"],
	["Folder not found or cannot be deleted", "文件夹不存在或无法删除。"],
	["Attachment not found", "未找到附件。"],
	["Attachment file not found", "未找到附件文件。"],
	["Forwarding to the same mailbox is not allowed.", "不能转发到当前邮箱。"],
	["Invalid or expired Access token", "Access 验证已失效，请重新登录。"],
	["Invalid mailbox", "邮箱无效。"],
	["Not found", "未找到相关内容。"],
	["Mailbox not found", "未找到邮箱。"],
	["Email not found", "未找到邮件。"],
	["Original email not found", "未找到原始邮件。"],
	["Folder not found", "未找到文件夹。"],
	["Internal Server Error", "服务器内部错误。"],
	["Failed to fetch", "网络连接失败，请重试。"],
	["NetworkError when attempting to fetch resource.", "网络连接失败，请重试。"],
] as const;

export function translateMessage(value: string, locale: Locale): string {
	const pair = messages.find(([english, chinese]) => value === english || value === chinese);
	return pair ? pair[locale === "zh" ? 1 : 0] : value;
}
