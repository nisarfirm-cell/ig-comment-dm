# Meta documentation used

Read on 14–15 Nov 2026. All under `https://developers.facebook.com/documentation/`. Meta changes these pages; re-check before relying on a limit.

| Page | Used for |
| --- | --- |
| `instagram-platform/private-replies` | Private reply endpoint (`recipient.comment_id`), one message per comment, 7-day window, 24h follow-up rule |
| `instagram-platform/webhooks/setup` | Verification handshake, `X-Hub-Signature-256`, retries for 36 hours, Advanced Access + Live + Business Verification for `comments`, `POST /subscribed_apps` |
| `instagram-platform/webhooks/fields` | Permission needed per webhook field |
| `instagram-platform/webhooks/examples` | Comment and `messaging_postbacks` payload shapes |
| `instagram-platform/instagram-api-with-instagram-login/messaging-api` | Send API, 24-hour window, 1000-byte text limit, automation disclosure recommendation |
| `instagram-platform/instagram-api-with-instagram-login/messaging-api/button-template` | Button template, 640 characters, 1–3 buttons, `postback` and `web_url` |
| `instagram-platform/instagram-api-with-instagram-login/messaging-api/quick-replies` | Quick reply payloads, 20-character titles |
| `instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile` | `is_user_follow_business`, user consent requirement |
| `instagram-platform/instagram-graph-api/reference/ig-comment/replies`, `instagram-platform/comment-moderation` | Public reply to a comment |
| `instagram-platform/instagram-api-with-instagram-login/get-started` | Dashboard token (60 days), `/me` fields, `/me/media` |
| `instagram-platform/reference/refresh_access_token` | Token refresh (≥24h old, not expired, valid 60 days) |
| `instagram-platform/overview` | Access levels, messaging rate limits (750 private replies/hour for posts and reels) |
| `instagram-platform/create-an-instagram-app` | App creation steps |
| `instagram-platform/app-review`, `resp-plat-initiatives/individual-processes/app-review/submission-guide` | App Review steps, "decision within a week", API call within 30 days |
| `development/graph-api/overview/access-levels`, `development/release/business-verification`, `development/build-and-test/app-roles` | Standard vs Advanced Access, verification, tester roles |

Cloudflare: `developers.cloudflare.com/workers/platform/deploy-buttons/` and `.../wrangler/configuration/` (Deploy button, automatic D1 provisioning, static assets with `run_worker_first`).

## Known disagreements / unverified points

- The webhook setup page says `comments` notifications need Advanced Access. The App Review page says an app used only for your own business needs only Standard Access. AutoDM's docs follow the stricter reading.
- Sending a button template as a **private reply** is not shown in Meta's docs (only text). AutoDM falls back to text if Instagram refuses it.
- The 20-character limit used for button labels comes from the quick-replies page; the button template page does not state one.
