# Chrome Web Store 0.1.9 update checklist

## Prepared files

- Package `release/chatpassport-0.1.9-chrome.zip`
- Three screenshots in [store-assets/screenshots](screenshots)
- [Listing and permission explanations](STORE_LISTING.md)
- [Release notes and reviewer message](../release/UPDATE-0.1.9.zh-CN.md)

## Update the existing item

1. Open existing item `anmmhpfpbaafkgdhalbllhmaejeappmb`; do not create a new item.
2. Upload the ZIP and verify the dashboard reads version 0.1.9.
3. Update the description from [STORE_LISTING.md](STORE_LISTING.md) so the instructions match the side-panel workflow.
4. Preview all three PNG files before uploading. They must show ChatPassport with demonstration data, never Google/GitHub sign-in pages. The second and third files must be different.
5. Verify all permission explanations, including alarms, are saved. This update adds no permissions.
6. Save draft, click Submit for review, then confirm. Use Why can't I submit? to inspect blockers.
7. Choose automatic or manual publication. After publication, verify the store shows version 0.1.9 and the new description.

## Verify before submission

- Load the exact unpacked release package in Chrome.
- Check quick and history capture on all four supported sites with signed-in accounts.
- Check that a history capture that reaches its limits preserves the latest complete messages that fit.
- Check destination insertion, omission approval/cancellation and failed-write recovery.
- After a draft is inserted, clear the editor and use **Copy prepared draft** to recover the original draft.
- Confirm sending remains manual; inspect code formatting and capture coverage.
- Check export/import, including older JSON and new loaded captures.
- Public privacy URL: https://sxwangsxwang1.github.io/chatpassport/privacy.html

Build and automated tests are not a substitute for signed-in live-site checks.
