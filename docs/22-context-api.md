# Dynamic Context API

> **v2.9.0+** - Runtime context management for request-scoped data.

## Overview

The dynamic context API allows you to set and get context values at runtime, making it easy to propagate request-scoped data (like request IDs, user information, tracing context) through your application without explicit parameter passing.

## Basic Usage

```typescript
import { scope } from "go-go-scope";

await using s = scope();

// Set context values
s.setContext("requestId", "abc-123")
  .setContext("userId", 456)
  .setContext("startTime", Date.now());

// Access in tasks
const [err, result] = await s.task(({ context }) => {
  console.log(context.requestId); // 'abc-123'
  console.log(context.userId);    // 456
  return processRequest(context);
});
```

## API Reference

### setContext(key, value)

Sets a context value. Returns the scope for chaining.

```typescript
setContext(key: string, value: unknown): this

// Example with chaining
s.setContext("key1", "value1")
 .setContext("key2", "value2")
 .setContext("key3", "value3");
```

### getContext(key)

Gets a context value by key. Returns `undefined` if not found.

```typescript
getContext<T>(key: string): T | undefined

// Example
const requestId = s.getContext<string>("requestId");
const userId = s.getContext<number>("userId");
```

### hasContext(key)

Checks if a context key exists.

```typescript
hasContext(key: string): boolean

// Example
if (s.hasContext("requestId")) {
  console.log("Request ID is set");
}
```

### removeContext(key)

Removes a context key. Returns `true` if removed, `false` if not found.

```typescript
removeContext(key: string): boolean

// Example
const removed = s.removeContext("tempKey");
console.log(removed); // true or false
```

### getAllContext()

Returns all context values as a readonly object.

```typescript
getAllContext(): Readonly<Record<string, unknown>>

// Example
const allContext = s.getAllContext();
console.log(allContext); // { requestId: 'abc-123', userId: 456 }
```

## Context Inheritance

Child scopes inherit context from their parents:

```typescript
await using parent = scope();
parent.setContext("parentKey", "parentValue");

const child = parent.createChild();
child.setContext("childKey", "childValue");

// Child has both keys
console.log(child.getContext("parentKey")); // 'parentValue'
console.log(child.getContext("childKey"));  // 'childValue'

// Parent only has its own key
console.log(parent.getContext("parentKey")); // 'parentValue'
console.log(parent.getContext("childKey"));  // undefined
```

## Combining with Initial Context

You can combine initial context with dynamic updates:

```typescript
await using s = scope({
  context: { 
    requestId: "initial-123",
    environment: "production" 
  }
});

// Add more context dynamically
s.setContext("userId", 789)
 .setContext("startTime", Date.now());

// All values available in tasks
s.task(({ context }) => {
  console.log(context.requestId);    // 'initial-123'
  console.log(context.environment);  // 'production'
  console.log(context.userId);       // 789
});
```

## Use Cases

### Request Tracing

```typescript
import { scope, generateTraceId } from "go-go-scope";

async function handleRequest(req: Request) {
  await using s = scope({
    context: { 
      traceId: req.headers.get("x-trace-id") || generateTraceId()
    }
  });
  
  s.setContext("userId", req.user?.id);
  s.setContext("startTime", Date.now());
  
  // All downstream tasks have access to trace context
  const [err, user] = await s.task(fetchUser);
  const [err2, orders] = await s.task(fetchOrders);
  
  return response;
}
```

### Progressive Enhancement

```typescript
await using s = scope();

// Set basic context immediately
s.setContext("requestId", generateId());

// Add more as it becomes available
const user = await authenticate(req);
s.setContext("userId", user.id);
s.setContext("permissions", user.permissions);

// Use in subsequent operations
const [err, data] = await s.task(({ context }) => {
  // Access both requestId and userId
  return fetchData(context.userId, context.requestId);
});
```

### Testing and Mocking

```typescript
// In tests, easily swap context values
await using s = scope();
s.setContext("apiKey", "test-key-123");
s.setContext("environment", "testing");

// Test with controlled context
const result = await s.task(({ context }) => {
  return callExternalApi(context.apiKey);
});
```

## Type Safety

While context values are stored as `unknown`, you can use generics for type safety:

```typescript
// Define your context shape
interface RequestContext {
  requestId: string;
  userId: number;
  startTime: number;
}

// Use with type assertions
const requestId = s.getContext<string>("requestId");
const userId = s.getContext<number>("userId");

// Or use a helper function
function getTypedContext<T extends keyof RequestContext>(
  s: Scope,
  key: T
): RequestContext[T] {
  return s.getContext<RequestContext[T]>(key)!;
}
```

## Best Practices

1. **Set context early**: Set request-scoped context at the beginning of request handling
2. **Use descriptive keys**: Use namespaced keys like `requestId` instead of `id`
3. **Prefer immutability**: Don't mutate context objects; set new values instead
4. **Clean up sensitive data**: Remove sensitive context before it goes out of scope
5. **Document expected context**: Document what context keys your tasks expect
