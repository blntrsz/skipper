/**
 * Print fallback message when UI cannot start.
 *
 * @since 1.0.2
 * @category CLI
 */
export function printUiFallback(reason: string): void {
  console.error(reason);
  console.error("Use non-UI commands instead:");
  console.error("- skipper a");
  console.error("- skipper rm");
  console.error('- skipper run "<prompt>"');
}
