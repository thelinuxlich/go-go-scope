# persistence-dynamodb API Reference

> Auto-generated documentation for persistence-dynamodb

## Table of Contents

- [Classs](#Classs)
  - [DynamoDBIdempotencyAdapter](#dynamodbidempotencyadapter)
  - [DynamoDBAdapter](#dynamodbadapter)

## Classs

### DynamoDBIdempotencyAdapter

```typescript
class DynamoDBIdempotencyAdapter
```

DynamoDB idempotency adapter implementing IdempotencyProvider

*Source: [idempotency.ts:19](packages/persistence-dynamodb/src/idempotency.ts#L19)*

---

### DynamoDBAdapter

```typescript
class DynamoDBAdapter
```

DynamoDB persistence adapter Uses a single-table design with the following structure: - pk: Partition key (LOCK#<key>, CB#<key>, CACHE#<key>) - sk: Sort key (always METADATA) - data: JSON serialized data - expiresAt: Unix timestamp for DynamoDB TTL - owner: Lock owner identifier - version: Optimistic locking version

*Source: [index.ts:64](packages/persistence-dynamodb/src/index.ts#L64)*

---

