import 'dotenv/config';

import { hostname } from 'node:os';

import { HealthService } from './application/health/health-service.js';
import { HandleResidentUpdateService } from './application/intake/handle-resident-update-service.js';
import { RespondToInformationService } from './application/requests/respond-to-information-service.js';
import { ExecutionService } from './application/execution/execution-service.js';
import { TransitionOrderService } from './application/orders/transition-order-service.js';
import { TransitionRequestService } from './application/requests/transition-request-service.js';
import { QualityService, ResidentQualityService } from './application/quality/quality-service.js';
import { NotificationService } from './application/notifications/notification-service.js';
import { OperationalAutomation } from './application/automation/operational-automation.js';
import { ReportingService } from './application/reporting/reporting-service.js';
import { PdcaService } from './application/pdca/pdca-service.js';
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
import { StaffAccessService } from './application/identity/staff-access-service.js';
import { PostgresStaffAccessRepository } from './infrastructure/identity/postgres-staff-access-repository.js';
import { PostgresExecutionRepository } from './infrastructure/execution/postgres-execution-repository.js';
import { PostgresExecutorEligibility } from './infrastructure/orders/postgres-executor-eligibility.js';
import { PostgresOrderRepository } from './infrastructure/orders/postgres-order-repository.js';
import { PostgresRequestRepository } from './infrastructure/requests/postgres-request-repository.js';
import { PostgresQualityRepository } from './infrastructure/quality/postgres-quality-repository.js';
import { PostgresTriageRepository } from './infrastructure/triage/postgres-triage-repository.js';
import { PostgresNotificationRepository } from './infrastructure/notifications/postgres-notification-repository.js';
import { PostgresAutomationRepository } from './infrastructure/automation/postgres-automation-repository.js';
import { PostgresReportingRepository } from './infrastructure/reporting/postgres-reporting-repository.js';
import { PostgresPdcaRepository } from './infrastructure/pdca/postgres-pdca-repository.js';
import { buildApp } from './interfaces/http/build-app.js';
import { createResidentBot } from './interfaces/telegram/resident-bot.js';
import { createStaffBot } from './interfaces/telegram/staff-bot.js';
import { TelegramNotificationSender } from './interfaces/telegram/telegram-notification-sender.js';

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
  let stopAutomation: (() => Promise<void>) | undefined;
  let notificationService: NotificationService | undefined;

  if (
    environment.RESIDENT_BOT_ENABLED ||
    environment.STAFF_BOT_ENABLED ||
    environment.AUTOMATION_ENABLED
  ) {
    applicationDatabase = createDatabaseClient(environment.DATABASE_URL, 5);
    notificationService = new NotificationService(
      new PostgresNotificationRepository(applicationDatabase.db),
      new TelegramNotificationSender(environment.RESIDENT_BOT_TOKEN, environment.STAFF_BOT_TOKEN),
    );
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

  if (
    environment.STAFF_BOT_ENABLED &&
    environment.STAFF_BOT_TOKEN &&
    applicationDatabase &&
    notificationService
  ) {
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
        notifications: notificationService,
        overridePriority: new OverridePriorityService(triageRepository),
        pdca: new PdcaService(new PostgresPdcaRepository(applicationDatabase.db)),
        principals: new PostgresPrincipalProvider(applicationDatabase.db),
        quality,
        registerRequest: new RegisterRequestAsOrderService(triageRepository),
        reporting: new ReportingService(new PostgresReportingRepository(applicationDatabase.db)),
        suggestDuplicates: new SuggestDuplicatesService(triageRepository),
        staffAccess: new StaffAccessService(
          new PostgresStaffAccessRepository(applicationDatabase.db),
        ),
        transitionRequest: new TransitionRequestService(
          new PostgresRequestRepository(applicationDatabase.db),
        ),
      }),
      token: environment.STAFF_BOT_TOKEN,
    });
    stopStaffBot = async (): Promise<void> => staffBot.stop();
    void staffBot.start({ onStart: () => app.log.info('Staff bot long polling started') });
  }

  if (environment.AUTOMATION_ENABLED && applicationDatabase && notificationService) {
    const automation = new OperationalAutomation(
      new PostgresAutomationRepository(applicationDatabase.db),
      notificationService,
    );
    const workerId = `${hostname()}:${process.pid}`;
    let activeCycle: Promise<void> | undefined;
    const runCycle = (): void => {
      if (activeCycle) return;
      activeCycle = automation
        .runCycle(workerId)
        .then((result) => app.log.debug({ automation: result }, 'Automation cycle completed'))
        .catch((error: unknown) => app.log.error({ err: error }, 'Automation cycle failed'))
        .finally(() => {
          activeCycle = undefined;
        });
    };
    runCycle();
    const timer = setInterval(runCycle, environment.AUTOMATION_POLL_SECONDS * 1_000);
    timer.unref();
    stopAutomation = async (): Promise<void> => {
      clearInterval(timer);
      if (activeCycle) await activeCycle;
    };
    app.log.info(
      { pollSeconds: environment.AUTOMATION_POLL_SECONDS, workerId },
      'Operational automation started',
    );
  }

  app.addHook('onClose', async () => {
    if (stopAutomation) await stopAutomation();
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
