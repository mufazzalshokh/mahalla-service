export type BotComponent = 'resident' | 'staff';
export type TelegramUpdateOutcome = 'failed' | 'rate_limited' | 'succeeded';
export type OperationalAlertCode =
  'automation_cycle_failed' | 'resident_bot_update_failed' | 'staff_bot_update_failed';
export type OperationalAlertSeverity = 'critical' | 'warning';

const knownHttpRoutes = new Set(['/health', '/metrics', '/ready']);

function increment(values: Map<string, number>, key: string): void {
  values.set(key, (values.get(key) ?? 0) + 1);
}

export class OperationalMetrics {
  private readonly alerts = new Map<string, number>();
  private readonly httpRequests = new Map<string, number>();
  private readonly telegramDurations = new Map<string, number>();
  private readonly telegramUpdates = new Map<string, number>();

  recordAlert(code: OperationalAlertCode, severity: OperationalAlertSeverity): void {
    increment(this.alerts, `${code}|${severity}`);
  }

  recordHttpRequest(route: string | undefined, statusCode: number): void {
    const safeRoute = route && knownHttpRoutes.has(route) ? route : 'other';
    const statusClass = `${Math.floor(statusCode / 100)}xx`;
    increment(this.httpRequests, `${safeRoute}|${statusClass}`);
  }

  recordTelegramUpdate(
    bot: BotComponent,
    outcome: TelegramUpdateOutcome,
    durationMilliseconds: number,
  ): void {
    increment(this.telegramUpdates, `${bot}|${outcome}`);
    const safeDuration = Number.isFinite(durationMilliseconds)
      ? Math.max(0, durationMilliseconds / 1_000)
      : 0;
    this.telegramDurations.set(bot, (this.telegramDurations.get(bot) ?? 0) + safeDuration);
  }

  renderPrometheus(processUptimeSeconds = process.uptime()): string {
    const lines = [
      '# HELP mck_process_uptime_seconds Process uptime in seconds.',
      '# TYPE mck_process_uptime_seconds gauge',
      `mck_process_uptime_seconds ${Math.max(0, processUptimeSeconds).toFixed(3)}`,
      '# HELP mck_http_requests_total HTTP requests by bounded route and status class.',
      '# TYPE mck_http_requests_total counter',
    ];
    for (const [key, value] of [...this.httpRequests].sort()) {
      const [route, statusClass] = key.split('|');
      lines.push(
        `mck_http_requests_total{route="${route}",status_class="${statusClass}"} ${value}`,
      );
    }
    lines.push(
      '# HELP mck_telegram_updates_total Telegram updates by bot and outcome.',
      '# TYPE mck_telegram_updates_total counter',
    );
    for (const [key, value] of [...this.telegramUpdates].sort()) {
      const [bot, outcome] = key.split('|');
      lines.push(`mck_telegram_updates_total{bot="${bot}",outcome="${outcome}"} ${value}`);
    }
    lines.push(
      '# HELP mck_telegram_update_duration_seconds_sum Accumulated Telegram handling time.',
      '# TYPE mck_telegram_update_duration_seconds_sum counter',
    );
    for (const [bot, value] of [...this.telegramDurations].sort()) {
      lines.push(`mck_telegram_update_duration_seconds_sum{bot="${bot}"} ${value.toFixed(6)}`);
    }
    lines.push(
      '# HELP mck_operational_alerts_total Operational alerts by fixed code and severity.',
      '# TYPE mck_operational_alerts_total counter',
    );
    for (const [key, value] of [...this.alerts].sort()) {
      const [code, severity] = key.split('|');
      lines.push(`mck_operational_alerts_total{code="${code}",severity="${severity}"} ${value}`);
    }
    return `${lines.join('\n')}\n`;
  }
}
