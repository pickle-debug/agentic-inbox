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

- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Built-in AI agent** — Side panel with 9 email tools for reading, searching, drafting, and sending
- **Auto-draft on new email** — Agent automatically reads inbound emails and generates draft replies, always requiring explicit confirmation before sending
- **Per-mailbox automatic replies** — Configure fixed acknowledgements independently for each mailbox
- **System AI settings** — Administrators control automatic reply drafts and the AI prompt for all mailboxes; chat history remains per mailbox
- **Automatic forwarding** — Each mailbox can forward new incoming mail to a verified destination while keeping its Inbox copy and attachments

### Interface language

Choose **简体中文** or **English** using the language selector at the top right. Changes apply immediately and are remembered in this browser for one year. The first visit follows the browser's preferred supported language, falling back to English. Dates and interface messages follow the selected language; email content, contact details, and custom folder names stay unchanged. No mailbox settings are changed. Run `npm run test:i18n` for preference, translation, and date-format checks.

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
