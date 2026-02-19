export { renderComment } from "./render.js";
export { buildCommentInput } from "./buildInput.js";
export {
  renderProductionComment,
  productionCommentContainsMarker,
  parseProductionMarker,
} from "./production.js";
export type { ProductionCommentInput, ProductionReport } from "./production.js";
export {
  buildArcsightV5Comment,
  normalizeComment,
  isArcsightComment,
  parseArcsightV5Meta,
} from "./v5.js";
export type {
  ArcsightV5Input,
  DecisionLevel as ArcsightV5DecisionLevel,
  ParsedV5Meta,
} from "./v5.js";
export { renderPRComment } from "./canonicalPRComment.js";
export type { RenderedComment } from "./canonicalPRComment.js";
export {
  formatArchitecturalExplanation,
} from "./architecturalExplanation.js";
export type { ArchitecturalExplanationInput } from "./architecturalExplanation.js";
export type {
  CommentRenderInput,
  DecisionObject,
  ChangeSummary,
  RunInfo,
  RunMode,
} from "./types.js";
