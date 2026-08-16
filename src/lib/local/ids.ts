/** Single implicit user for individual self-host. Not a real auth account. */
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_USER_EMAIL = "local@focusspace";
export const LOCAL_DISPLAY_NAME = "You";

export function newId(): string {
  return crypto.randomUUID();
}
