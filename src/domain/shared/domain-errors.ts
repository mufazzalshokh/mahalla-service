export class DomainRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainRuleError';
  }
}

export class AuthorizationError extends DomainRuleError {
  constructor(permission: string) {
    super('FORBIDDEN', `Permission required: ${permission}`);
    this.name = 'AuthorizationError';
  }
}

export class InvalidTransitionError extends DomainRuleError {
  constructor(from: string, to: string) {
    super('INVALID_TRANSITION', `Transition from ${from} to ${to} is not allowed`);
    this.name = 'InvalidTransitionError';
  }
}

export class MissingTransitionDataError extends DomainRuleError {
  constructor(field: string) {
    super('MISSING_TRANSITION_DATA', `Required transition data is missing: ${field}`);
    this.name = 'MissingTransitionDataError';
  }
}

export class ActorConstraintError extends DomainRuleError {
  constructor(message: string) {
    super('ACTOR_CONSTRAINT_FAILED', message);
    this.name = 'ActorConstraintError';
  }
}

export class EntityNotFoundError extends DomainRuleError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} was not found: ${id}`);
    this.name = 'EntityNotFoundError';
  }
}

export class ConcurrencyConflictError extends DomainRuleError {
  constructor(entity: string, id: string) {
    super('CONCURRENCY_CONFLICT', `${entity} changed concurrently: ${id}`);
    this.name = 'ConcurrencyConflictError';
  }
}
