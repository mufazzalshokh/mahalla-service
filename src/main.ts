import 'dotenv/config';

import { HealthService } from './application/health/health-service.js';
import { HandleResidentUpdateService } from './application/intake/handle-resident-update-service.js';
import { RespondToInformationService } from './application/requests/respond-to-information-service.js';
import { ExecutionService } from './application/execution/execution-service.js';
import { TransitionOrderService } from './application/orders/transition-order-service.js';
import { TransitionRequestService } from './application/requests/transition-request-service.js';
import { QualityService, ResidentQualityService } from './application/quality/quality-service.js';
import {
  AssessPriorityService,
  DecideDuplicateService,
  ListValidationQueueService,
  OverridePriorityService,
  RegisterRequestAsOrderService,
  SuggestDuplicatesService,
} from './application/triage/triage-services.js';
import { StaffOperationsService } from './application/triage/staff-operations-service.js';
import { EnvironmentValidationError, loadEnvironment } from './config/environment.js';
import { createDatabaseClient, type DatabaseClient } from './infrastructure/database/client.js';
import { createPostgresDependency } from './infrastructure/database/postgres-readiness.js';
import { PostgresResidentIntakeUnitOfWork } from './infrastructure/intake/postgres-resident-intake-unit-of-work.js';
import { PostgresPrincipalProvider } from './infrastructure/identity/postgres-principal-provider.js';
import { PostgresExecutionRepository } from './infrastructure/execution/postgres-execution-repository.js';
import { PostgresExecutorEligibility } from './infrastructure/orders/postgres-executor-eligibility.js';
import { PostgresOrderRepository } from './infrastructure/orders/postgres-order-repository.js';
import { PostgresRequestRepository } from './infrastructure/requests/postgres-request-repository.js';
import { PostgresQualityRepository } from './infrastructure/quality/postgres-quality-repository.js';
import { PostgresTriageRepository } from './infrastructure/triage/postgres-triage-repository.js';
import { buildApp } from './interfaces/http/build-app.js';
import { createResidentBot } from './interfaces/telegram/resident-bot.js';
import { createStaffBot } from './interfaces/telegram/staff-bot.js';

async function start(): Promise<void> {
  const environment = loadEnvironment(process.env);
  const database = createPostgresDependency(environment.DATABASE_URL);
  const healthService = new HealthService([database.probe]);
  const app = buildApp({
    healthService,
    logLevel: environment.LOG_LEVEL,
    serviceName: environment.SERVICE_NAME,
  });
  let applicationDatabase: DatabaseClient | undefined;
  let stopResidentBot: (() => Promise<void>) | undefined;
  let stopStaffBot: (() => Promise<void>) | undefined;

  if (environment.RESIDENT_BOT_ENABLED || environment.STAFF_BOT_ENABLED) {
    applicationDatabase = createDatabaseClient(environment.DATABASE_URL, 5);
  }

  if (environment.RESIDENT_BOT_ENABLED && environment.RESIDENT_BOT_TOKEN && applicationDatabase) {
    const intakeService = new HandleResidentUpdateService(
      new PostgresResidentIntakeUnitOfWork(applicationDatabase.db),
    );
    const requestRepository = new PostgresRequestRepository(applicationDatabase.db);
    const principalProvider = new PostgresPrincipalProvider(applicationDatabase.db);
    const residentQuality = new ResidentQualityService(
      principalProvider,
      new QualityService(
        new PostgresQualityRepository(applicationDatabase.db),
        new TransitionOrderService(
          new PostgresOrderRepository(applicationDatabase.db),
          new PostgresExecutorEligibility(applicationDatabase.db),
        ),
      ),
    );
    const bot = createResidentBot({
      onError(error, updateId): void {
        app.log.error({ err: error, telegramUpdateId: updateId }, 'Resident bot update failed');
      },
      respondToInformation: new RespondToInformationService(
        principalProvider,
        new TransitionRequestService(requestRepository),
      ),
      quality: residentQuality,
      service: intakeService,
      token: environment.RESIDENT_BOT_TOKEN,
    });
    stopResidentBot = async (): Promise<void> => bot.stop();
    void bot.start({
      onStart: () => app.log.info('Resident bot long polling started'),
    });
  }

  if (environment.STAFF_BOT_ENABLED && environment.STAFF_BOT_TOKEN && applicationDatabase) {
    const triageRepository = new PostgresTriageRepository(applicationDatabase.db);
    const executionRepository = new PostgresExecutionRepository(applicationDatabase.db);
    const transitionOrder = new TransitionOrderService(
      new PostgresOrderRepository(applicationDatabase.db),
      new PostgresExecutorEligibility(applicationDatabase.db),
    );
    const quality = new QualityService(
      new PostgresQualityRepository(applicationDatabase.db),
      transitionOrder,
    );
    const staffBot = createStaffBot({
      onError(error, updateId): void {
        app.log.error({ err: error, telegramUpdateId: updateId }, 'Staff bot update failed');
      },
      operations: new StaffOperationsService({
        assessPriority: new AssessPriorityService(triageRepository),
        decideDuplicate: new DecideDuplicateService(triageRepository),
        execution: new ExecutionService(executionRepository, transitionOrder),
        listQueue: new ListValidationQueueService(triageRepository),
        overridePriority: new OverridePriorityService(triageRepository),
        principals: new PostgresPrincipalProvider(applicationDatabase.db),
        quality,
        registerRequest: new RegisterRequestAsOrderService(triageRepository),
        suggestDuplicates: new SuggestDuplicatesService(triageRepository),
        transitionRequest: new TransitionRequestService(
          new PostgresRequestRepository(applicationDatabase.db),
        ),
      }),
      token: environment.STAFF_BOT_TOKEN,
    });
    stopStaffBot = async (): Promise<void> => staffBot.stop();
    void staffBot.start({ onStart: () => app.log.info('Staff bot long polling started') });
  }

  app.addHook('onClose', async () => {
    if (stopResidentBot) await stopResidentBot();
    if (stopStaffBot) await stopStaffBot();
    if (applicationDatabase) await applicationDatabase.close();
    await database.close();
  });

  let closing = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Graceful shutdown started');
    await app.close();
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: environment.HOST, port: environment.PORT });
}

try {
  await start();
} catch (error: unknown) {
  if (error instanceof EnvironmentValidationError) {
    console.error(error.message);
  } else {
    console.error('Application startup failed');
  }
  process.exitCode = 1;
}
