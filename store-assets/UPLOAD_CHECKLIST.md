# Chrome Web Store upload checklist

## Files already prepared

- Extension ZIP: `release/chatpassport-0.1.0-chrome.zip`
- Store icon: `store-assets/icon-128.png`
- Screenshots: `store-assets/screenshots/01-capture.png` through `03-review-and-send.png`
- Small promo tile: `store-assets/promo-small-440x280.png`
- Optional marquee tile: `store-assets/promo-marquee-1400x560.png`
- Listing copy and permission explanations: `store-assets/STORE_LISTING.md`
- Privacy policy source: `PRIVACY.md`
- Publishable privacy page: `docs/privacy.html`

## Manual account steps

1. Enable two-step verification on the Google account that will own the extension.
2. Register in the Chrome Web Store Developer Dashboard and pay Google's one-time registration fee.
3. Create a new item and upload `release/chatpassport-0.1.0-chrome.zip`.
4. Paste the English fields from `STORE_LISTING.md` into **Store listing**.
5. Upload the 128 px icon, three screenshots in numerical order, small promo tile, and optional marquee tile.
6. Complete **Privacy practices** using the prepared single-purpose, permission, remote-code, and data-handling answers.
7. Publish `docs/privacy.html` at a public HTTPS URL and enter that URL as the privacy policy. The repository is currently private, so a private GitHub URL will not satisfy this requirement.
8. Set distribution to **Public** unless you intentionally want an unlisted or tester-only release. Select all regions unless there is a product reason to restrict them.
9. Preview the listing, verify every image and link, then submit for review.

## Final pre-submit test

- Install the exact release ZIP by unzipping it and loading that folder through `chrome://extensions`.
- Run capture and transfer once in each supported source/destination combination that matters for launch.
- Confirm the extension never sends automatically.
- Confirm clearing a pending transfer removes the destination card after refresh.
- Confirm JSON export/import and Markdown export work.
- Confirm the published privacy URL is accessible in a signed-out/incognito browser window.
- Confirm no personal conversation data appears in screenshots, ZIP contents, or repository assets.

## Do not upload

- The repository root
- `.output/chrome-mv3` as a folder
- Source screenshots from personal conversations
- `node_modules`, `.git`, test files, or development configuration

Only upload the prepared ZIP as the extension package.
