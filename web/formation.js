// Text controls visual density only; drafts never become saved opinions here.
export function draftFill(text) {
  return .12 + .88 * (1 - Math.exp(-Array.from(String(text).trim()).length / 90));
}
