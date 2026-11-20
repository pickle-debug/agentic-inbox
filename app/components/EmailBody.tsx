import { shouldUsePrivateReading, type EmailPrivacySettings } from "../../shared/email-privacy";
import EmailContent from "~/components/EmailContent";
import EmailIframe from "~/components/EmailIframe";
import { rewriteInlineImages } from "~/lib/utils";
import type { Email } from "~/types";

export interface EmailReadingPolicyProps {
	privacySettings?: EmailPrivacySettings;
	settingsLoaded?: boolean;
}

export default function EmailBody({ email, mailboxId, privacySettings, settingsLoaded = false, autoSize }: EmailReadingPolicyProps & {
	email: Email; mailboxId?: string; autoSize?: boolean;
}) {
	// Until the mailbox policy arrives, never mount a network-capable renderer.
	if (!settingsLoaded || shouldUsePrivateReading(email.sender, privacySettings)) {
		return <EmailContent body={email.body || ""} />;
	}
	return <EmailIframe key={email.id} body={rewriteInlineImages(email.body || "", mailboxId || "", email.id, email.attachments)} autoSize={autoSize} />;
}
