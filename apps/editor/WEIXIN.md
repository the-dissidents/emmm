# Weixin drafts

The article panel uses one ConfigTable for title, author and cover. Title and author default to the existing emmm header metadata. The cover stays empty until explicitly selected through `wx-cover`; website covers and posters are not used as defaults. An override updates its own `wx-*` variable through the editor, preserving surrounding text and undo history. The cover uses the default left wide crop and right square crop; no crop settings are stored.

In automatic mode, **Render and copy** prepares clipboard HTML. **Sync draft** prepares the same content and creates or updates a linked Weixin draft. Sync includes rendering, image uploads, cover upload and validation; it refuses incomplete images or a changed document/account/render configuration.

Draft associations and image caches are scoped by AppID. Saving a previously untitled document transfers its association to its path. A remote edit or deletion is shown before an overwrite or new draft can be chosen. New-draft requests with uncertain outcomes are reconciled against recent drafts, rather than resent. A successful sync is remembered only after the response is saved locally.

AppSecret and proxy passwords are saved as plain text in the editor's local `memorized.json`, alongside other account and proxy settings. Both are displayed directly in editable text fields. The application does not use the operating system credential store. Native code acquires stable tokens; account, secret or route changes invalidate cached tokens. The direct route uses normal HTTPS and bounded request timeouts.

Validation:

```sh
pnpm --filter kfgui check
pnpm --filter kfgui test:weixin
```

The tests exercise source metadata/parser compatibility, credential boundaries, token invalidation, draft association, conflict/deletion handling, lost response recovery, source changes, image upload failures and background rendering. Live draft permissions and IP allowlists depend on the configured Weixin account.

Both direct HTTPS and standard HTTPS CONNECT proxies are supported. The native transport obtains tokens and forwards draft requests and image uploads through the selected proxy, with both TLS certificates verified. AppSecrets remain local and are sent only inside the inner Weixin TLS connection. An unavailable or unconfigured proxy never falls back to direct access. See [proxy setup](../weixin-proxy/README.md) for deployment and end-to-end verification. No SSH credentials, device pairing or custom server protocol are needed in the editor.
