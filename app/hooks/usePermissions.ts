import { useQuery } from "@tanstack/react-query";
import { canWrite, canDelete } from "../../shared/access";
import api from "~/services/api";

// 仅控制界面可用操作；真正的范围与权限检查始终由 Worker 执行。
// 身份尚未加载时默认禁用写入，避免只读访客打开邮件时自动标记已读。
export function usePermissions() {
	const { data: identity } = useQuery({ queryKey: ["session"], queryFn: api.getSession });
	return {
		identity,
		writable: canWrite(identity),
		deletable: canDelete(identity),
		shared: identity?.role === "share",
		admin: identity?.role === "admin",
	};
}
