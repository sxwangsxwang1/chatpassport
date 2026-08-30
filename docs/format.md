# ChatPassport conversation format 1.0

A ChatPassport file is UTF-8 JSON with a `.chatpassport.json` suffix. Version
1.0 intentionally models a small, portable subset of an AI conversation.

## Example

```json
{
  "format": "chatpassport",
  "version": "1.0",
  "id": "d56b565e-0789-4353-9d64-01f04335b0ce",
  "title": "Launch plan",
  "source": {
    "provider": "chatgpt",
    "url": "https://chatgpt.com/c/example",
    "exportedAt": "2026-08-31T10:00:00.000Z"
  },
  "messages": [
    {
      "id": "chatgpt-1",
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Help me plan a product launch."
        }
      ]
    }
  ]
}
```

## Required fields

- `format`: always `chatpassport`.
- `version`: currently `1.0`.
- `id`: a non-empty identifier for the exported conversation.
- `title`: a non-empty display title.
- `source.provider`: `chatgpt`, `claude`, `gemini`, or `deepseek`.
- `source.url`: the source conversation URL.
- `source.exportedAt`: an ISO 8601 timestamp.
- `messages`: at least one ordered message.
- `messages[].role`: `user`, `assistant`, or `system`.
- `messages[].content`: at least one text content part.

Unknown versions must be rejected instead of silently reinterpreted. Future
format releases will provide explicit migrations.

## Security

Imported JSON is treated as untrusted input and validated before use. Message
content is inserted as text, not rendered as HTML. A file does not grant access
to its source URL, platform account, cookies, or attachments.
