import { Button, DropdownMenu } from "@cloudflare/kumo";
import { TranslateIcon } from "@phosphor-icons/react";
import { useI18n } from "~/hooks/useI18n";
import { isLocale } from "~/lib/i18n";

export default function LanguageSelector({ compact = false }: { compact?: boolean }) {
	const { locale, setLocale, t } = useI18n();
	return (
		<div className="inline-flex shrink-0 items-center gap-2 text-sm text-kumo-subtle">
			{!compact && <span>{t("Language", "语言")}</span>}
			<DropdownMenu>
				<DropdownMenu.Trigger>
					<Button
						variant="ghost"
						shape="circle"
						size="base"
						icon={<TranslateIcon size={22} aria-hidden="true" />}
						aria-label={t("Language", "语言")}
						title={t("Language", "语言")}
						className="data-popup-open:bg-kumo-tint"
					/>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" sideOffset={8} className="min-w-44 rounded-xl p-1.5">
					<DropdownMenu.RadioGroup value={locale} onValueChange={(value) => { if (isLocale(value)) setLocale(value); }}>
						<DropdownMenu.RadioItem value="zh" lang="zh-CN" closeOnClick className="min-h-10 gap-6 rounded-lg px-3">
							简体中文
							<DropdownMenu.RadioItemIndicator />
						</DropdownMenu.RadioItem>
						<DropdownMenu.RadioItem value="en" lang="en" closeOnClick className="min-h-10 gap-6 rounded-lg px-3">
							English
							<DropdownMenu.RadioItemIndicator />
						</DropdownMenu.RadioItem>
					</DropdownMenu.RadioGroup>
				</DropdownMenu.Content>
			</DropdownMenu>
		</div>
	);
}
