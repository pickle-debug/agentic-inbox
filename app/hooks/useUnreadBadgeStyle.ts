import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "~/queries/keys";
import api from "~/services/api";
import type { UnreadBadgeStyle } from "../../shared/system-settings";

export type { UnreadBadgeStyle };

/** Administrators choose the style in System settings for every viewer; it never changes read state. */
export function useUnreadBadgeStyle(): {style: UnreadBadgeStyle} {
	const {data} = useQuery({queryKey: queryKeys.config, queryFn: api.getConfig});
	return {style: data?.unreadBadgeStyle ?? "count"};
}
