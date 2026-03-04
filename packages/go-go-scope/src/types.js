/**
 * Type definitions and interfaces for go-go-scope
 */
/**
 * Span status codes (from OpenTelemetry)
 */
export var SpanStatusCode;
((SpanStatusCode) => {
	SpanStatusCode[(SpanStatusCode["UNSET"] = 0)] = "UNSET";
	SpanStatusCode[(SpanStatusCode["OK"] = 1)] = "OK";
	SpanStatusCode[(SpanStatusCode["ERROR"] = 2)] = "ERROR";
})(SpanStatusCode || (SpanStatusCode = {}));
