# Credits

Work that 404less builds on or takes inspiration from, kept here for future reference.

## UI references

### "Connect an agent" dialog

`apps/web/src/client/features/keys/connect-agent-dialog.tsx`

The dialog's design (an agent picker, then numbered per-client steps with copyable
config, a one-click install button, and Prompt / MCP URL tabs) follows the MCP connect
modal in [Executor](https://executor.sh) ([source](https://github.com/UsefulSoftwareCo/executor),
MIT, © Rhys Sullivan). The modal was referenced from the live product; its code is not
in the open-source repo, so 404less's version is written from scratch on the groot UI kit.

### Motion and press feedback

Easing curves, press feedback and reduced-motion handling follow Emil Kowalski's
[design engineering skill](https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng).

## Assets

### Agent brand marks

`apps/web/src/client/features/keys/agent-icons/*.svg`, vendored unchanged from
[`@lobehub/icons-static-svg`](https://www.npmjs.com/package/@lobehub/icons-static-svg)
1.101.0 (MIT, LobeHub). The marks belong to their respective owners (Anthropic, Anysphere,
GitHub, OpenAI, OpenCode, the Model Context Protocol project) and are used only to name the
client each setup is for.
