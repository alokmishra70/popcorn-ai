export class PopcornError extends Error {
  override readonly name: string = 'PopcornError';
}

/** Thrown during replay when a tool is called with arguments that have no recorded fixture. */
export class FixtureMissError extends PopcornError {
  override readonly name = 'FixtureMissError';

  constructor(
    readonly toolName: string,
    readonly argsHash: string,
  ) {
    super(
      `No recorded output for ${toolName} with these arguments. ` +
        `Pass onFixtureMiss: 'live' to call the real tool instead.`,
    );
  }
}

export class PopcornApiError extends PopcornError {
  override readonly name = 'PopcornApiError';

  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

/** Error recorded in a fixture, re-thrown when the tool is replayed. */
export class RecordedToolError extends PopcornError {
  override readonly name = 'RecordedToolError';
}
