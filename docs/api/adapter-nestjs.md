# adapter-nestjs API Reference

> Auto-generated documentation for adapter-nestjs

## Table of Contents

- [Functions](#Functions)
  - [Task](#task)
- [Classes](#Classes)
  - [GoGoScopeService](#gogoscopeservice)
  - [GoGoRequestScopeService](#gogorequestscopeservice)
  - [GoGoScopeModule](#gogoscopemodule)
- [Methods](#Methods)
  - [GoGoScopeService.createScope](#gogoscopeservice-createscope)
  - [GoGoRequestScopeService.getScope](#gogorequestscopeservice-getscope)

## Functions

### Task

```typescript
function Task(options?: Parameters<Scope["task"]>[1])
```

Decorator to execute a method within a task class UserService { async getUser(id: string) { return fetchUser(id) } } ```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` (optional) | `Parameters<Scope["task"]>[1]` |  |

**Examples:**

```typescript

**@Injectable:** ()
class UserService {

**@Task:** ({ retry: 'exponential', timeout: 5000 })
async getUser(id: string) {
return fetchUser(id)
}
}
```

*Source: [index.ts:110](packages/adapter-nestjs/src/index.ts#L110)*

---

## Classes

### GoGoScopeService

```typescript
class GoGoScopeService
```

Service providing access to the root application scope

*Source: [index.ts:30](packages/adapter-nestjs/src/index.ts#L30)*

---

### GoGoRequestScopeService

```typescript
class GoGoRequestScopeService
```

Request-scoped service that provides a unique scope per HTTP request

*Source: [index.ts:67](packages/adapter-nestjs/src/index.ts#L67)*

---

### GoGoScopeModule

```typescript
class GoGoScopeModule
```

NestJS module for go-go-scope integration imports: [GoGoScopeModule.forRoot({ metrics: true })], providers: [UserService], }) class AppModule {} ```

**Examples:**

```typescript

**@Module:** ({
imports: [GoGoScopeModule.forRoot({ metrics: true })],
providers: [UserService],
})
class AppModule {}
```

*Source: [index.ts:160](packages/adapter-nestjs/src/index.ts#L160)*

---

## Methods

### GoGoScopeService.createScope

```typescript
GoGoScopeService.createScope(name: string, options?: Omit<Parameters<typeof scope>[0], "parent">): Scope
```

Create a new child scope from the root

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` |  |
| `options` (optional) | `Omit<Parameters<typeof scope>[0], "parent">` |  |

**Returns:** `Scope`

*Source: [index.ts:48](packages/adapter-nestjs/src/index.ts#L48)*

---

### GoGoRequestScopeService.getScope

```typescript
GoGoRequestScopeService.getScope(): Scope
```

Get the underlying scope for advanced operations

**Returns:** `Scope`

*Source: [index.ts:87](packages/adapter-nestjs/src/index.ts#L87)*

---

