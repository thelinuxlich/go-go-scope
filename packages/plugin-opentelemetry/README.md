# @go-go-scope/plugin-opentelemetry

OpenTelemetry plugin for go-go-scope with convenient exporter helpers.

## Installation

```bash
npm install @go-go-scope/plugin-opentelemetry
```

## Quick Start

```typescript
import { scope } from "go-go-scope";
import { opentelemetryPlugin } from "@go-go-scope/plugin-opentelemetry";
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("my-service");

await using s = scope({
  name: "my-scope",
  plugins: [
    opentelemetryPlugin(tracer, {
      name: "my-operation",
      attributes: { "custom.attr": "value" }
    })
  ]
});

const [err, result] = await s.task(() => fetchData());
```

## Exporters

### Jaeger

```typescript
import { createJaegerExporter } from "@go-go-scope/plugin-opentelemetry/exporters";
import { NodeSDK } from "@opentelemetry/sdk-node";

const exporter = createJaegerExporter({
  serviceName: "my-service",
  endpoint: "http://localhost:14268/api/traces"
});

const sdk = new NodeSDK({
  traceExporter: exporter,
  // ... other config
});

await sdk.start();
```

### Zipkin

```typescript
import { createZipkinExporter } from "@go-go-scope/plugin-opentelemetry/exporters";

const exporter = createZipkinExporter({
  serviceName: "my-service",
  url: "http://localhost:9411/api/v2/spans"
});
```

### OTLP (Grafana Tempo, Honeycomb, etc.)

```typescript
import { createOTLPExporter } from "@go-go-scope/plugin-opentelemetry/exporters";

const exporter = createOTLPExporter({
  url: "https://api.honeycomb.io/v1/traces",
  headers: { "x-honeycomb-team": "your-api-key" }
});
```

### Console (for debugging)

```typescript
import { createConsoleExporter } from "@go-go-scope/plugin-opentelemetry/exporters";

const exporter = createConsoleExporter({ pretty: true });
```

### Multiple Exporters

```typescript
import { createCompositeExporter, createJaegerExporter, createZipkinExporter } from "@go-go-scope/plugin-opentelemetry/exporters";

const exporter = createCompositeExporter([
  createJaegerExporter({ serviceName: "my-service" }),
  createZipkinExporter({ serviceName: "my-service" })
]);
```

## Examples

See the `examples/` directory for complete working examples:

- `jaeger-tracing.ts` - Full Jaeger integration example
- `zipkin-tracing.ts` - Full Zipkin integration example

## Running Examples

### Jaeger

```bash
# Start Jaeger
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 14268:14268 \
  jaegertracing/all-in-one:latest

# Run example
npx tsx node_modules/@go-go-scope/plugin-opentelemetry/examples/jaeger-tracing.ts

# Open http://localhost:16686
```

### Zipkin

```bash
# Start Zipkin
docker run -d --name zipkin -p 9411:9411 openzipkin/zipkin

# Run example
npx tsx node_modules/@go-go-scope/plugin-opentelemetry/examples/zipkin-tracing.ts

# Open http://localhost:9411
```

## License

MIT
