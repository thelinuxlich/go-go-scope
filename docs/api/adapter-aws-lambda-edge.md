# adapter-aws-lambda-edge API Reference

> Auto-generated documentation for adapter-aws-lambda-edge

## Table of Contents

- [Functions](#Functions)
  - [lambdaEdgeGoGoScope](#lambdaedgegogoscope)
  - [viewerRequestHandler](#viewerrequesthandler)
  - [originRequestHandler](#originrequesthandler)
  - [originResponseHandler](#originresponsehandler)
  - [viewerResponseHandler](#viewerresponsehandler)
  - [getClientIp](#getclientip)
  - [getRequestUri](#getrequesturi)
  - [addHeader](#addheader)
  - [getHeader](#getheader)

## Functions

### lambdaEdgeGoGoScope

```typescript
function lambdaEdgeGoGoScope<T extends CloudFrontRequestResult | CloudFrontResponseResult>(options: LambdaEdgeGoGoScopeOptions, handler: (
		event: CloudFrontRequestEvent | CloudFrontResponseEvent,
		scope: Scope,
		context: Context,
	) => Promise<T>): (event: CloudFrontRequestEvent | CloudFrontResponseEvent, context: Context) => Promise<T>
```

Lambda@Edge handler wrapper for go-go-scope integration

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LambdaEdgeGoGoScopeOptions` |  |
| `handler` | `(
		event: CloudFrontRequestEvent | CloudFrontResponseEvent,
		scope: Scope,
		context: Context,
	) => Promise<T>` |  |

**Returns:** `(event: CloudFrontRequestEvent | CloudFrontResponseEvent, context: Context) => Promise<T>`

**Examples:**

```typescript
// src/viewer-request.ts
import { lambdaEdgeGoGoScope } from '@go-go-scope/adapter-aws-lambda-edge'

export const handler = lambdaEdgeGoGoScope({
  name: 'my-lambda-edge',
  timeout: 5000
}, async (event, scope) => {
  const [err, data] = await scope.task(() => validateRequest(event))
  if (err) {
    return {
      status: '403',
      statusDescription: 'Forbidden',
      body: 'Invalid request'
    }
  }
  return event.Records[0].cf.request
})
```

*Source: [index.ts:69](packages/adapter-aws-lambda-edge/src/index.ts#L69)*

---

### viewerRequestHandler

```typescript
function viewerRequestHandler(options: LambdaEdgeGoGoScopeOptions, handler: (request: LambdaEdgeRequest["Records"][0]["cf"]["request"], scope: Scope) => Promise<CloudFrontRequestResult>)
```

Helper for viewer request handlers (incoming request)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LambdaEdgeGoGoScopeOptions` |  |
| `handler` | `(request: LambdaEdgeRequest["Records"][0]["cf"]["request"], scope: Scope) => Promise<CloudFrontRequestResult>` |  |

**Examples:**

```typescript
// src/viewer-request.ts
import { viewerRequestHandler } from '@go-go-scope/adapter-aws-lambda-edge'

export const handler = viewerRequestHandler({
  name: 'viewer-request-handler'
}, async (request, scope) => {
  const [err, user] = await scope.task(() => authenticate(request))
  if (err || !user) {
    return {
      status: '302',
      statusDescription: 'Found',
      headers: {
        location: [{ key: 'Location', value: '/login' }]
      }
    }
  }
  return request
})
```

*Source: [index.ts:140](packages/adapter-aws-lambda-edge/src/index.ts#L140)*

---

### originRequestHandler

```typescript
function originRequestHandler(options: LambdaEdgeGoGoScopeOptions, handler: (request: LambdaEdgeRequest["Records"][0]["cf"]["request"], scope: Scope) => Promise<CloudFrontRequestResult>)
```

Helper for origin request handlers (before sending to origin)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LambdaEdgeGoGoScopeOptions` |  |
| `handler` | `(request: LambdaEdgeRequest["Records"][0]["cf"]["request"], scope: Scope) => Promise<CloudFrontRequestResult>` |  |

**Examples:**

```typescript
// src/origin-request.ts
import { originRequestHandler } from '@go-go-scope/adapter-aws-lambda-edge'

export const handler = originRequestHandler({
  name: 'origin-request-handler'
}, async (request, scope) => {
  const [err, modified] = await scope.task(() => modifyRequest(request))
  if (err) return request
  return modified
})
```

*Source: [index.ts:168](packages/adapter-aws-lambda-edge/src/index.ts#L168)*

---

### originResponseHandler

```typescript
function originResponseHandler(options: LambdaEdgeGoGoScopeOptions, handler: (
		response: CloudFrontResponseEvent["Records"][0]["cf"]["response"],
		scope: Scope,
	) => Promise<CloudFrontResponseResult>)
```

Helper for origin response handlers (after receiving from origin)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LambdaEdgeGoGoScopeOptions` |  |
| `handler` | `(
		response: CloudFrontResponseEvent["Records"][0]["cf"]["response"],
		scope: Scope,
	) => Promise<CloudFrontResponseResult>` |  |

**Examples:**

```typescript
// src/origin-response.ts
import { originResponseHandler } from '@go-go-scope/adapter-aws-lambda-edge'

export const handler = originResponseHandler({
  name: 'origin-response-handler'
}, async (response, scope) => {
  const [err, processed] = await scope.task(() => processResponse(response))
  if (err) return response
  return processed
})
```

*Source: [index.ts:196](packages/adapter-aws-lambda-edge/src/index.ts#L196)*

---

### viewerResponseHandler

```typescript
function viewerResponseHandler(options: LambdaEdgeGoGoScopeOptions, handler: (
		response: CloudFrontResponseEvent["Records"][0]["cf"]["response"],
		scope: Scope,
	) => Promise<CloudFrontResponseResult>)
```

Helper for viewer response handlers (before sending to viewer)

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `options` | `LambdaEdgeGoGoScopeOptions` |  |
| `handler` | `(
		response: CloudFrontResponseEvent["Records"][0]["cf"]["response"],
		scope: Scope,
	) => Promise<CloudFrontResponseResult>` |  |

**Examples:**

```typescript
// src/viewer-response.ts
import { viewerResponseHandler } from '@go-go-scope/adapter-aws-lambda-edge'

export const handler = viewerResponseHandler({
  name: 'viewer-response-handler'
}, async (response, scope) => {
  // Add security headers
  response.headers['strict-transport-security'] = [{
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000'
  }]
  return response
})
```

*Source: [index.ts:230](packages/adapter-aws-lambda-edge/src/index.ts#L230)*

---

### getClientIp

```typescript
function getClientIp(event: LambdaEdgeRequest): string
```

Get client IP from Lambda@Edge event

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `LambdaEdgeRequest` |  |

**Returns:** `string`

*Source: [index.ts:247](packages/adapter-aws-lambda-edge/src/index.ts#L247)*

---

### getRequestUri

```typescript
function getRequestUri(event: LambdaEdgeRequest): string
```

Get request URI from Lambda@Edge event

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `event` | `LambdaEdgeRequest` |  |

**Returns:** `string`

*Source: [index.ts:254](packages/adapter-aws-lambda-edge/src/index.ts#L254)*

---

### addHeader

```typescript
function addHeader(response: CloudFrontResponseResult, name: string, value: string): void
```

Helper to add headers to response

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `response` | `CloudFrontResponseResult` |  |
| `name` | `string` |  |
| `value` | `string` |  |

**Returns:** `void`

*Source: [index.ts:261](packages/adapter-aws-lambda-edge/src/index.ts#L261)*

---

### getHeader

```typescript
function getHeader(request: LambdaEdgeRequest["Records"][0]["cf"]["request"], name: string): string | undefined
```

Helper to get header from request

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `request` | `LambdaEdgeRequest["Records"][0]["cf"]["request"]` |  |
| `name` | `string` |  |

**Returns:** `string | undefined`

*Source: [index.ts:276](packages/adapter-aws-lambda-edge/src/index.ts#L276)*

---

