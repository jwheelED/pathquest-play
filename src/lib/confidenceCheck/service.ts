/**
 * Instant Confidence Check — Service
 *
 * Sits between the transcript pipeline and the check-in send system.
 * Listens for transcript chunks, runs phrase detection, and when a
 * confidence cue is found, auto-sends the matching pre-built template
 * to students. Cooldown enforced to prevent rapid re-fires.
 */

import { detectConfidencePhrase } from "./detector";
import { getTemplate, type ConfidenceTemplate } from "./templates";

export interface ConfidenceCheckOptions {
  enabled: boolean;
  cooldownMs: number;
}

export type ConfidenceSkipReason =
  | "cooldown"
  | "disabled"
  | "no_match"
  | null;

export interface ConfidenceCheckResult {
  triggered: boolean;
  phrase: string | null;
  template: ConfidenceTemplate | null;
  sessionId: string;
  timestamp: number;
  skipped: boolean;
  skipReason: ConfidenceSkipReason;
}

const DEFAULT_COOLDOWN_MS = 30_000;

/**
 * Stub for the real send mechanism. Wired up in a later step.
 * TODO: integrate with the live check-in send pipeline so this
 * actually pushes the template question to the active session.
 */
async function sendConfidenceCheckIn(
  sessionId: string,
  template: ConfidenceTemplate,
): Promise<void> {
  // TODO: replace with real send call (e.g. supabase edge function
  // invocation that creates a live_question row for this session).
  void sessionId;
  void template;
}

export class ConfidenceCheckService {
  private readonly sessionId: string;
  private enabled: boolean;
  private cooldownMs: number;
  private lastTriggerTime: number | null = null;

  constructor(sessionId: string, options: ConfidenceCheckOptions) {
    this.sessionId = sessionId;
    this.enabled = options.enabled;
    this.cooldownMs =
      typeof options.cooldownMs === "number" && options.cooldownMs >= 0
        ? options.cooldownMs
        : DEFAULT_COOLDOWN_MS;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getLastTriggerTime(): number | null {
    return this.lastTriggerTime;
  }

  async processChunk(
    transcript: string,
  ): Promise<ConfidenceCheckResult | null> {
    const timestamp = Date.now();

    if (!this.enabled) {
      return {
        triggered: false,
        phrase: null,
        template: null,
        sessionId: this.sessionId,
        timestamp,
        skipped: true,
        skipReason: "disabled",
      };
    }

    const match = detectConfidencePhrase(transcript);
    if (!match) {
      return null;
    }

    if (
      this.lastTriggerTime !== null &&
      timestamp - this.lastTriggerTime < this.cooldownMs
    ) {
      return {
        triggered: false,
        phrase: match.phrase,
        template: null,
        sessionId: this.sessionId,
        timestamp,
        skipped: true,
        skipReason: "cooldown",
      };
    }

    const template = getTemplate(match.responseType);
    if (!template) {
      return {
        triggered: false,
        phrase: match.phrase,
        template: null,
        sessionId: this.sessionId,
        timestamp,
        skipped: true,
        skipReason: "no_match",
      };
    }

    await sendConfidenceCheckIn(this.sessionId, template);
    this.lastTriggerTime = timestamp;

    return {
      triggered: true,
      phrase: match.phrase,
      template,
      sessionId: this.sessionId,
      timestamp,
      skipped: false,
      skipReason: null,
    };
  }
}
