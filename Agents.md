# AGENTS.md

## Important Coding Style

Before doing coding work, read `../codestyle.md`. Its guidance on naming,
small changes, error handling, TypeScript, UI style, and cross-repo product
contracts is part of this repo's working rules.

# Deploy Commit Push and Pull

Use GITHUB_PERSONAL_ACCESS_TOKEN in .env
use NPM_TOKEN_EXPOFACTO in .env

## Deployment Rule

Every completed job with a deployable effect must end with publication or live
deployment work. Local checks are not done. A pushed commit is not done. Done
means the package, service, docs, and dashboard agree in the live places users
touch.

For CLI/package changes:

1. Run `npm run typecheck`.
2. Run `npm test`.
3. Run `npm run build`.
4. Commit and push to `main`.
5. Confirm the GitHub Actions `Publish npm package` workflow has run.
6. Verify the new package is visible on npm with `npm view @expofacto/cli version`.

For changes that affect the hosted API, dashboard text, setup output, docs, or
runner lifecycle, also deploy `facto-infrastructure` and verify
`https://expofacto.dev/api/health` returns `{"ok":true}`.

If a task only changes non-deployable agent instructions, say that there is no
production artifact to deploy. Otherwise, keep going until the live publication
or deployment is verified. If deployment cannot finish, say exactly what
external access, token, workflow result, or secret is missing.

# Personal response style

- Answer directly.
- Do not use filler phrases such as: "Got it", "I hear you"

## Working rules

- Answer the current request only.
- Be direct and concise.
- Prefer the smallest correct change.
- Do not do extra refactors, rewrites, migrations, or cleanup.
- If intent is ambiguous, ask one short clarifying question.
- Make code easy to hand off, including to junior engineers.
- Concise and readable beats clever or highly optimized.
- Less code usually means fewer bugs, but do not hide logic in unreadable one-liners.
- Use popular npm libraries when they clearly help.
- Name things after the real behavior they provide. Avoid vague or abstract names.

## Code style

- Prefer `const name = () => {}` and put `export default name` at the bottom of the file.
- Prefer functional code when it improves readability. Do not use dense one-liners.
- Use good variable names as self-documenting code.
- Don't use abstract naming
- Code duplication is ok if only used twice or three times
- Check `lib` for existing helpers before creating new ones.
- Put reusable helper functions in `lib`.
- Use Ramda, lodash/fp, or existing helpers for data transformations when they make the code clearer.
- Libraries should export concrete behaviors, not vague abstractions.
- Keep the happy path easy to read.
- Keep error handling close to the failing operation.
- Simple duplicated error checks are better than clever shared error machinery.
- Avoid environment fallbacks such as `env.X || env.Y`. Use one clear environment variable and fix callers.
- Do not add backward compatibility layers during refactors. Roll forward and fix the usage.
- Refactoring should remove technical debt, not add more.
- Follow YAGNI.
- Files should rarely if ever have more than 200 lines in them
- don't spread styles around the app, leave them close to where they are used, always

## Cross-repo contract changes

- Treat the npm package, CLI commands, hosted API, dashboard copy, generated setup scripts, and docs as one product contract.
- If a CLI command, npm package name, bin name, API route, auth token name, request shape, response shape, or runner lifecycle behavior changes, do a full walkthrough of `facto-cli` and `facto-infrastructure`.
- Update every affected surface in the same change: dashboard onboarding text, README examples, use-case docs, generated scripts, tests, API handlers, and package metadata.
- Verify copy-paste commands from a clean shell shape, not only from local source.
- Do not finish or describe the work as published/deployed until npm registry state, dashboard text, and docs agree.

## Components and styling

- Reuse flexible components instead of creating many narrowly named variants.
- Prefer `<ActionButton style={{ color: "red" }} />` over separate components like `<ActionButton />` and `<RedActionButton />`.
- Use limited CSS unless it applies across a whole app or large feature area.
- Prefer inline styles or shared style helpers such as `lib/radium.ts`.
- If a color, font, or constant is likely to be reused, add it to the shared colours, fonts, or constants file.

## Design

- Design quality matters a lot. Treat design tasks carefully and keep the result simple enough for humans to edit.
- Prefer a small number of strong reusable components over a large UI library.
- Prefer headless libraries that separate behavior from presentation. For example, TanStack Table is preferred over MUI tables.
- Do not use styled-components or wrapper components that only move CSS naming problems into JavaScript.
- Avoid decorative complexity unless the task explicitly asks for it.
