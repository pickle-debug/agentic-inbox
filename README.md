<div align="center">
  <h1>Agentic Inbox</h1>
  <p><em>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers</em></p>
</div>

Agentic Inbox lets you send, receive, and manage emails through a modern web interface -- all powered by your own Cloudflare account. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored in [R2](https://developers.cloudflare.com/r2/).

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies -- built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [Workers AI](https://developers.cloudflare.com/workers-ai/).

![Agentic Inbox screenshot](./demo_app.png)


Read the blog post to learn more about Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

## How to setup

**Important**: Clicking the 'Deploy to Cloudflare' button is only one part of the setup. You must follow the **After deploying** steps as well. For a full step-by-step guide with screenshots, refer to this comment: 
https://github.com/cloudflare/agentic-inbox/issues/4#issuecomment-4269118513

### To set up

1. Deploy to Cloudflare. The deploy flow will automatically provision R2, Durable Objects, and Workers AI. You'll be prompted for **DOMAINS**, which is the domain (yourdomain.com) you want to receive emails for (email@yourdomain.com).

     [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agentic-inbox)

2. **Configure Cloudflare Access** -- Enable [one-click Cloudflare Access](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/) on your Worker under Settings > Domains & Routes. The modal will show your `POLICY_AUD` and `TEAM_DOMAIN` values. `TEAM_DOMAIN` can be either your Access team URL or the full `.../cdn-cgi/access/certs` URL. **You must set these as secrets for your Worker.**
3. **Set up Email Routing** -- In the Cloudflare dashboard, go to your domain > Email Routing and create a catch-all rule that forwards to this Worker
4. **Enable Email Service** -- The worker needs the `send_email` binding to send outbound emails. See [Email Service docs](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
5. **Create a mailbox** -- Visit your deployed app and create a mailbox for any address on your domain (e.g. `hello@example.com`)

### Troubleshooting Access

1. If you see `Invalid or expired Access token`, that usually means `POLICY_AUD` or `TEAM_DOMAIN` secrets are incorrect.
   * Resolution: [turn Access off and back on for the Worker to get the Access modal again](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then reset your Worker secrets to the latest `POLICY_AUD` and `TEAM_DOMAIN` values shown there.
2. If you see `Cloudflare Access must be configured in production`, this application is intentionally enforcing Cloudflare Access so your inbox is not exposed to anyone on the internet.
   * Resolution: enable Access using [one-click Cloudflare Access for Workers](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then set the `POLICY_AUD` and `TEAM_DOMAIN` Worker secrets from the modal values.

## Features

- **Configurable private email reader** — Enable per mailbox for specified sender domains to extract text and HTTP(S) links without rendering the email or loading its images. Other senders retain normal HTML reading.
- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Built-in AI agent** — Side panel with 9 email tools for reading, searching, drafting, and sending
- **Auto-draft on new email** — Agent automatically reads inbound emails and generates draft replies, always requiring explicit confirmation before sending
- **Per-mailbox automatic replies** — Configure fixed acknowledgements independently for each mailbox
- **System AI settings** — Administrators control automatic reply drafts and the AI prompt for all mailboxes; chat history remains per mailbox
- **Automatic forwarding** — Each mailbox can forward new incoming mail to a verified destination while keeping its Inbox copy and attachments
- **Domain groups and automatic mailboxes** — Configure receiving domains inside the app or accept all domains routed to the Worker. Create mailboxes automatically on their first incoming message.
- **Scoped sharing** — Expiring, revocable domain or mailbox keys with read-only, read/write or message-management permissions.

### Receiving domains and automatic mailbox creation

Open **System settings > Receiving domains** as an administrator. Choose **Only listed domains** or **All domains routed to this Worker**, enter domain names (one per line), enable **Create a mailbox automatically when its first email arrives**, and save. The app stores this policy at `settings/reception.json` in the existing R2 bucket. Before the first save, the default remains the `DOMAINS` environment list with automatic creation disabled. After saving, `DOMAINS` is only a fallback; no Worker variable change or redeployment is needed to add another receiving domain in the app. Listed domains are exact matches; add subdomains separately. Removing a domain from the list stops new incoming delivery for that domain, including existing mailboxes, but keeps stored mail readable.

Cloudflare must still enable Email Routing/MX for each domain and route its catch-all to this Worker. Application settings cannot create those external DNS/routing rules. With `zaku.net` routed and accepted, the first delivery to `hr@zaku.net` creates the mailbox with automatic replies, forwarding and AI actions off unless explicitly configured elsewhere. The envelope recipient chooses the mailbox, including BCC; From/To headers cannot provision a different mailbox. Concurrent first deliveries use conditional creation, preserving saved settings. `EMAIL_ADDRESSES` remains an optional address-level allowlist; leave it `[]` to receive arbitrary addresses on accepted domains. Automatic creation consumes storage and Worker quota for previously unknown addresses; it is disabled by default.

The home page lists domains on the left and mailboxes on the right (stacked on mobile). Select a domain, then select a mailbox to read mail. Groups are derived from configured domains and stored mailboxes, so unknown domains in all-domains mode appear after their first delivery. Refresh immediately or wait for the 15-second picker refresh. In all-domains mode, adding a domain to the saved list also creates an empty group for preconfigured sharing. Administratively deleted mailboxes have an R2 tombstone and will not be automatically recreated; explicit manual creation clears the tombstone. As before, mailbox removal hides its retained underlying message data rather than purging the Durable Object. Recreating the same address can reveal its old stored messages to its new authorized viewers; mailbox-scoped sharing keys are revoked on deletion and are never restored by recreation.

### Share a domain or mailbox

Administrators can choose **Share domain** on a domain group or the share icon beside an individual mailbox. Enter a label, choose permissions and a 1–365 day lifetime, then generate and copy the link. Each scope supports multiple independently revocable credentials. Domain sharing includes existing and future mailboxes of that exact domain, excluding subdomains and lookalike domains. Mailbox sharing includes one address only.

| Permission | Allowed actions |
| --- | --- |
| Read only | View messages, threads, folders, source and attachments; search and download. Reading does not change read/unread state. |
| Read/write | Read, send/reply/forward, create or replace drafts, mark read/starred, create or rename folders, and organize mail outside Trash. |
| Manage | Read/write, plus delete messages/folders, move mail to Trash, and edit mailbox settings. |

Creating/deleting mailboxes, changing passwords, issuing/revoking sharing credentials, contacts and system settings remain administrator-only. Password users retain their existing mailbox behavior. AI agent/WebSocket and MCP access are blocked for shared visitors, preventing these alternate interfaces from bypassing scope or permission checks. Read/write visitors retain original drafts after sending because their key cannot delete them; the UI explicitly confirms that retention.

Domain links use `https://your-inbox.example/?domain=zaku.net&token=SECRET`; mailbox links use `?mailbox=hr%40zaku.net&token=SECRET`. Opening the link exchanges the key for an HttpOnly, Secure (HTTPS), SameSite=Strict session and redirects to a clean URL before any app HTML loads. The session lasts at most eight hours and never outlives its key; revisiting an unexpired link starts another session. This switches the visitor's current app identity, including an existing administrator session. The app stores only SHA-256 digests of cryptographically random 256-bit keys and session secrets. Raw keys are shown only in the creation response; the credential list cannot retrieve them again. Revocation/expiry is checked on every request, including already-exchanged sessions. Keys may also be used as `Authorization: Bearer SECRET` for scoped API requests. Browser writes require the same Origin; non-browser Bearer API calls may omit Origin.

The URL itself is a bearer credential. The application sends `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, and clears the secret in its redirect; the initial URL can still be recorded by your proxy or Cloudflare request logging. Do not publish links or record query strings containing tokens. **If Cloudflare Access protects the whole hostname, visitors will still encounter that outer Access gate.** Use the existing [dual-login setup](docs/dual-login.md) so only `/auth/admin/session` requires Access, while the Worker authenticates normal app paths itself. This change does not modify your Cloudflare Access policies or publish routes.

The auth Durable Object adds `share_keys` and `share_sessions` SQLite tables automatically, without a new binding. Existing password/admin sessions continue to work. Run `npm run test:domains` for local Worker coverage of reception, concurrent provisioning, scope, permission denial, expiry and revocation. Run `npm run test:domains-ui` after a production build for Chromium UI coverage; it uses the same `PRIVACY_TEST_BROWSER` executable override as the privacy tests and mocks all APIs.

### Interface language

Choose **简体中文** or **English** using the language selector at the top right. Changes apply immediately and are remembered in this browser for one year. The first visit follows the browser's preferred supported language, falling back to English. Dates and interface messages follow the selected language; email content, contact details, and custom folder names stay unchanged. No mailbox settings are changed. Run `npm run test:i18n` for preference, translation, and date-format checks.

### Email reading privacy

In **Mailbox settings > Email privacy**, enable **Use private reading for specified sender domains** and enter one domain per line (commas also work). Rules apply only to the current mailbox and match the email's From address, including subdomains: `example.com` matches `sender@example.com` and `sender@mail.example.com`, but not `sender@fakeexample.com` or `sender@example.com.other.test`. Up to 100 domains are accepted; case, duplicate entries and trailing dots are normalized. Enter domain names without URLs, `@` or wildcards. The switch defaults to off for new and existing mailboxes, requires at least one domain when enabled, and retains the list when disabled. Save changes to apply to both existing and new messages. No database migration is required: the policy lives in the mailbox's existing R2 settings JSON as `privacy: { enabled, domains }`.

Only matching messages use private reading, with no proxy or IP pool required. Original HTML is parsed only inside a detached, inert `<template>`; its nodes are never attached to the page. Only escaped text and read-only URL fields are displayed. Remote images, CSS, fonts, media, embedded pages, scripts, forms, redirects, and link previews are not loaded from these messages. Other senders (or disabling the switch) use sanitized HTML in a sandboxed iframe, which permits HTTPS images. Both single-message and thread views choose the policy independently per sender; while settings are loading or unavailable, the reader stays private to prevent a flash of remote content. Attachments remain available for explicit download or preview.

The reader lists HTTP(S) links, including magic/sign-in links, without opening, checking, prefetching, unwrapping redirects, or consuming them. It decodes HTML entities in attributes but preserves URL tokens, query order, and fragments. Relative links, executable schemes, and URLs containing credentials are excluded. Link extraction does not certify a link's authenticity. Opening a copied link in another browser still contacts that site and can reveal the link identifier and network address. Read/open tracking protection does not change optional forwarding, automatic replies, or AI processing settings; leave those features disabled if not needed. No QQ mailbox is required.

After `npm ci` and `npx playwright install chromium`, run `npm run test:privacy` for local Worker/API policy validation, persistence and permissions, plus real Chromium checks of zero external requests for protected messages, normal HTML for other senders, settings save/reload, copying and source display in both mail views. Alternatively set `PRIVACY_TEST_BROWSER` to an installed Chromium/Chrome executable. No production mail or live magic link is used.

### Mailbox and system settings

**Mailbox settings** is pinned to the bottom of the mailbox sidebar. It manages the current mailbox's display name, fixed automatic reply, forwarding and password within the same mailbox layout. Administrators can set, reset or disable its password login. Mailbox users can change their own password after verifying the current password; this ends their existing sessions and requires signing in again.

The top-right **System settings** button is administrator-only. It controls automatic AI reply drafts and the shared AI prompt across all mailboxes. Mailbox users cannot see Contacts or System settings, and their API requests to these resources are denied. Language remains a browser preference available to both roles.

### Automatically acknowledge new mail

Open the receiving mailbox (for example, `support@yourdomain.com`), then **Mailbox settings > Automatic Replies** at the bottom of the sidebar. Enable **Send a fixed automatic reply**, enter a message such as “你好，我们已经收到你的邮件，请不要重复发送”, and click **Save Changes**. An optional subject overrides the default `Re: original subject`. Templates are plain text, up to 10,000 characters, and stay saved when disabled.

Fixed replies and **Create an AI reply draft when new mail arrives** have independent switches and can run together. The fixed message sends automatically using the mailbox address; AI replies remain drafts for review and manual sending. Administrators configure the AI switch and prompt in **System settings**, applying to all mailboxes. Both features default to off and apply to new incoming mail only.

Fixed replies go only to the SMTP envelope sender, never to CC/BCC or an arbitrary Reply-To. Automatic, bulk/list, forwarded, bounce, and self-sent messages are skipped. A sender receives at most one acknowledgement per mailbox in 24 hours; duplicate Message-IDs (or raw message hashes when missing) are remembered across restarts. Replies share the mailbox limits of 20 sends per hour and 100 per day. Pending or failed automatic attempts reserve quota and are not retried because a delivery timeout may already have sent the message. Successful submissions appear in Sent in the original thread. Failures preserve the Inbox copy and do not block AI drafting; inspect Worker logs for errors.

Mailbox settings retain `autoReply`. Global AI configuration is stored in R2 at `settings/system.json`; no new binding or database migration is required. Existing per-mailbox `autoDraftRepliesEnabled` and `agentSystemPrompt` values are retained in storage for rollback, but are no longer returned, editable or used by this version. Administrators must explicitly enable the new global draft setting; old per-mailbox choices are not automatically expanded to every mailbox. On rollback, older code will use those retained per-mailbox values again.

The additive SQLite migration `9_add_automatic_reply_attempts` runs locally in each mailbox on initialization. Older code can ignore the extra table on rollback; keep it to preserve deduplication if upgrading again. Run `npm run test:automatic-replies` and `npm run test:system-settings` for local configuration, permission, delivery, duplicate/cooldown, rate-limit, global AI scope and failure-isolation checks without sending real email.

### Automatically forward new mail

1. Add and verify the destination mailbox in Cloudflare **Email Routing > Destination addresses**.
2. Open the mailbox in Agentic Inbox, go to **Mailbox settings > Automatic Forwarding**, enable the checkbox, enter the destination address, and click **Save Changes**.

Forwarding is off by default, including for existing mailboxes. It applies to new incoming mail only; disabling it keeps the destination saved for later. Original messages and attachments are forwarded using Cloudflare's native email forwarding. The Inbox copy remains available even if forwarding fails; check Worker logs for the delivery error. Failed forwarding is not automatically retried. Forwarding to the same mailbox is rejected, and messages already marked as forwarded by Agentic Inbox are stored without forwarding again to prevent loops.

### Administrator contacts

Administrators can open **联系人 / Contacts** from the mailbox sidebar to create, edit, and delete contacts. Each contact has a name, a unique email address, optional notes, and an introduction. The directory is visible only to administrators, who can use it while operating any mailbox. Mailbox password users cannot view, search, or manage contacts; the API rejects their requests as well.

When signed in as an administrator, type a name, email, note, or introduction keyword in **To / CC / BCC** in either compose view, then click a suggestion or use the arrow keys and Enter. The selected email replaces the address currently being edited, preserving other recipients. Mailbox password users keep plain comma-separated email fields without contact suggestions. The sender remains the current mailbox for both roles.

Deploy the `CONTACTS` Durable Object binding and `v5` migration together with the Worker. Contacts are stored in a separate SQLite-backed `ContactsStore`; existing mailboxes, messages, and authentication data are unchanged. Rolling back the UI does not require deleting contact storage. Run `npm run test:contacts` for local API/permission/search and recipient-selection checks; no email is sent by these tests.

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, Workers AI (`@cf/moonshotai/kimi-k2.5`), `react-markdown` + `remark-gfm`
- **Auth:** Cloudflare Access for administrators; scoped password sessions for mailbox users

## Getting Started

```bash
npm install
npm run dev
```

Local development is signed out by default. To work as an administrator locally, set `DEV_ADMIN_EMAIL=admin@example.test` in `.dev.vars`; this setting is ignored by production builds.

### Configuration

1. Set your domain in `wrangler.jsonc`
2. Create an R2 bucket named `agentic-inbox`: `wrangler r2 bucket create agentic-inbox`

### Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled (for the agent)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) configured for deployed/shared environments (required in production)

A single website can offer both login methods: protect `/auth/admin/session` with Access and let the Worker authenticate the rest of the application using its own sessions. Users admitted by the administrator Cloudflare Access application are administrators and can manage every mailbox. Internal mailbox users sign in with the password configured by an administrator and can access only that mailbox. MCP remains administrator-only. See [dual-login setup](docs/dual-login.md) before exposing the password-login hostname.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  9 email tools  │
                     │                  │────>│  Workers AI     │
                     └──────────────────┘     └─────────────────┘
```

## License

Apache 2.0 -- see [LICENSE](LICENSE).
