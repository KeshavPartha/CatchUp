export class RecapProviderNotConfiguredError extends Error {
  constructor(message = 'No server-side recap provider is configured.') {
    super(message);
    this.name = 'RecapProviderNotConfiguredError';
  }
}

export class RecapProviderRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecapProviderRequestError';
  }
}
