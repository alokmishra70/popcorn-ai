# OpenTelemetry

Agents in other languages can send traces to Popcorn over OTLP/HTTP with JSON encoding. Spans that follow the OpenTelemetry GenAI semantic conventions show up like SDK spans: model, tokens, cost and messages.

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://localhost:4100/v1/traces
export OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/json
export OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer pk_..."
```

Protobuf is not supported; the endpoint answers 415 with a hint.

## Mapping

| OpenTelemetry                                                           | Popcorn                                  |
| ----------------------------------------------------------------------- | ---------------------------------------- |
| Trace id                                                                | Run id                                   |
| Span without a parent                                                   | `agent` span (the run)                   |
| `gen_ai.operation.name` = `chat`, `text_completion`, `generate_content` | `llm` span                               |
| `gen_ai.operation.name` = `execute_tool`                                | `tool` span, named by `gen_ai.tool.name` |
| `gen_ai.request.model`, `gen_ai.response.model`                         | Model                                    |
| `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`               | Tokens, used for cost                    |
| `gen_ai.input.messages`, `gen_ai.output.messages`                       | Input and output                         |
| `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`                 | Tool input and output                    |
| Status code `ERROR`                                                     | Span error                               |

Other attributes are kept on the span. OTLP ids are mapped onto stable UUIDs, so spans from the same trace sent in separate requests join the same run.

Replay needs the args hash the Popcorn SDK attaches to tool spans, so runs ingested over OTLP can be inspected and evaluated but not rewound.
