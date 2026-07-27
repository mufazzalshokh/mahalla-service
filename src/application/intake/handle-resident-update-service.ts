import type { ResidentIntakeUnitOfWork } from './resident-intake-unit-of-work.js';
import { planResidentUpdate } from './resident-intake-planner.js';
import type { IntakeResponse, ResidentUpdateCommand } from './intake-types.js';

export class HandleResidentUpdateService {
  constructor(private readonly unitOfWork: ResidentIntakeUnitOfWork) {}

  execute(command: ResidentUpdateCommand): Promise<IntakeResponse> {
    return this.unitOfWork.process(command, (context) => planResidentUpdate(command, context));
  }
}
