import type {
  IntakePlan,
  IntakePlanningContext,
  IntakeResponse,
  ResidentUpdateCommand,
} from './intake-types.js';

export type IntakePlanner = (context: IntakePlanningContext) => IntakePlan;

export interface ResidentIntakeUnitOfWork {
  process(command: ResidentUpdateCommand, planner: IntakePlanner): Promise<IntakeResponse>;
}
