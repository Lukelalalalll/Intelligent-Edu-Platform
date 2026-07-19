# Frontend Commenting Guide

This guide defines the lightweight English commenting style for `frontend`.
Comments should explain intent, constraints, and non-obvious behavior. They
should not restate what TypeScript, JSX, or CSS already makes clear.

## Core rules

- Write comments in English, sentence case, and present tense.
- Prefer short TSDoc-style blocks (`/** ... */`) for exported functions, exported
  types, hooks, complex components, and module-level contracts.
- Use line comments (`// ...`) only near the code they clarify, especially for
  runtime differences, auth or routing invariants, security behavior, fallbacks,
  browser/server edge cases, and intentional workarounds.
- Avoid comments for imports, simple state setters, obvious JSX structure,
  trivial type fields, generated files, vendor-like UI wrappers, and static
  assets.
- Keep comments current when behavior changes. A stale comment is treated as a
  bug in the documentation.

## Recommended patterns

Use TSDoc when a reader needs the contract before reading the implementation:

```ts
/**
 * Resolves backend-served asset paths to the correct runtime origin.
 */
export function resolveBackendAssetUrl(path?: string): string {
  // ...
}
```

Use a local line comment when the reason matters more than the operation:

```ts
// Keep same-origin browser requests behind the nginx reverse proxy.
return normalizedPath;
```

Do not add comments that only repeat the syntax:

```ts
// Bad: Set loading to true.
setIsLoading(true);
```

## CSS comments

Use section comments only when a stylesheet has multiple logical regions:

```css
/* ===== Toolbar ===== */
```

Do not add section comments to very small files or single-purpose utility files.

## First-pass scope

The first standardized pass covers core frontend skeleton files: app bootstrap,
routing, auth/session state, runtime API URL resolution, and backend asset URL
helpers. Generated OpenAPI files, `:Zone.Identifier` files, static assets,
vendor-like UI primitives, and large presentation templates are intentionally
excluded unless a specific non-obvious rule needs documentation.
