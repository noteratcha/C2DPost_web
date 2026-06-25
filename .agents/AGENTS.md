# Agent Rules

## Skill Learning and Updates
- **Always Remember and Learn:** Every time there is a code improvement, modification, or new workflow established, automatically evaluate if it should be distilled into a reusable agent skill (using `workflow-skill-creator` or updating existing skills) so the behavior is remembered and applied to future tasks.

## Code Modification Rules
- **Version Updating:** Every time you modify the codebase, you MUST restart the Node server (`node server.js`) if it is running, because the app version is generated from the server startup time. This ensures the version number updates immediately to reflect your changes.
