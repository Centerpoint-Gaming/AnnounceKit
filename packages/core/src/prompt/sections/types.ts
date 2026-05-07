import type { PromptContext } from '../context.js';

/**
 * A PromptSection contributes one fragment to the assembled prompt.
 *
 * Return a string to include the fragment, or null to skip (e.g. when
 * the context lacks the inputs the section needs). The pipeline runs
 * sections in declared order, drops nulls, and joins the survivors with
 * a single space.
 *
 * To add a new section: create a file under prompt/sections/, export a
 * PromptSection, and append it to the SECTIONS array in prompt/build.ts.
 */
export interface PromptSection {
  /** Stable identifier — used for tests, telemetry, ordering. */
  id: string;
  contribute(ctx: PromptContext): string | null;
}
