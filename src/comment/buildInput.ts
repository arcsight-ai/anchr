import type {
  CommentRenderInput,
  RunMode,
  TechnicalContext,
} from "./types.js";
import type { DecisionOutput } from "../decision/types.js";
import type { PolicyOutput } from "../policy/types.js";

/**
 * Builds CommentRenderInput from decision output and context.
 * technicalContext drives perceived size and the technical details collapsible.
 */
export function buildCommentInput(
  decision: DecisionOutput,
  changeType: string,
  confidence: number,
  mode: RunMode,
  options?: {
    filesChanged?: number;
    primaryFile?: string;
    technicalContext?: {
      status: string;
      scopeMode: string;
      violations: string[];
      primaryCause?: string | null;
      decisionLevel?: string;
    };
    policy?: PolicyOutput;
  },
): CommentRenderInput {
  const technicalContext: TechnicalContext | undefined = options?.technicalContext
    ? {
        status: options.technicalContext.status,
        scopeMode: options.technicalContext.scopeMode,
        violations: options.technicalContext.violations,
        primaryCause: options.technicalContext.primaryCause,
        decisionLevel: options.technicalContext.decisionLevel,
      }
    : undefined;

  return {
    decision,
    changeSummary: {
      filesChanged: options?.filesChanged ?? 0,
      primaryFile: options?.primaryFile ?? "",
      changeType,
    },
    runInfo: { confidence, mode },
    technicalContext,
    policy: options?.policy,
  };
}
