import type { Page } from "@playwright/test";

/** Keep one-time credentials out of Playwright's named navigation steps.
 * Callers must also disable traces and screenshots for credential flows.
 * replaceState + reload exercises the real URL-driven application behavior.
 */
export async function openCredentialLink(
  page: Page,
  pathname: "/confirmar-cadastro" | "/customer/reset-password" | "/resetar-senha",
  token: string,
) {
  await page.goto(pathname);
  await page.evaluate(({ pathname, token }) => {
    window.history.replaceState(null, "", `${pathname}?token=${encodeURIComponent(token)}`);
  }, { pathname, token });
  await page.reload();
}
