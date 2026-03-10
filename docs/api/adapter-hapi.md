# adapter-hapi API Reference

> Auto-generated documentation for adapter-hapi

## Table of Contents

- [Functions](#Functions)
  - [getScope](#getscope)
  - [getRootScope](#getrootscope)
  - [closeHapiScope](#closehapiscope)

## Functions

### getScope

```typescript
function getScope(request: Request): Scope<Record<string, unknown>>
```

Get the request-scoped scope from Hapi request

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `request` | `Request` |  |

**Returns:** `Scope<Record<string, unknown>>`

*Source: [index.ts:112](packages/adapter-hapi/src/index.ts#L112)*

---

### getRootScope

```typescript
function getRootScope(server: Server): Scope<Record<string, unknown>>
```

Get the root application scope from Hapi server

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `server` | `Server` |  |

**Returns:** `Scope<Record<string, unknown>>`

*Source: [index.ts:126](packages/adapter-hapi/src/index.ts#L126)*

---

### closeHapiScope

```typescript
function closeHapiScope(server: Server): Promise<void>
```

Graceful shutdown helper for Hapi applications Disposes the root scope when the server is closing

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `server` | `Server` |  |

**Returns:** `Promise<void>`

**Examples:**

```typescript
process.on('SIGTERM', async () => {
  await closeHapiScope(server)
  await server.stop()
})
```

*Source: [index.ts:147](packages/adapter-hapi/src/index.ts#L147)*

---

