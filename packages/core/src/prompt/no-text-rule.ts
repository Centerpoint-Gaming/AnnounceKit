/**
 * Single source of truth for the "no text in output" rule. Both fresh-gen
 * (style-constraints section) and edit (editThumbnail prompt wrapper) import
 * this constant so the two paths cannot drift.
 *
 * The rule is stated as a top-level CRITICAL constraint, enumerates the
 * common offenders (logos, watermarks, UI, speech bubbles), and explicitly
 * tells the model to strip text out of attached reference/brand images
 * rather than copy it through — that's the channel where text most often
 * leaks into the output.
 */
export const NO_TEXT_RULE =
  'CRITICAL — the output image must contain ZERO text of any kind. No letters, no words, no numbers, no titles, no captions, no subtitles, no logos containing text, no watermarks, no signatures, no UI elements, no menu chrome, no buttons, no HUD, no speech bubbles, no on-screen prompts. If any attached reference or brand image contains text or a wordmark, OMIT that text from the generated output — render the artwork without it. Pure illustration only.';
