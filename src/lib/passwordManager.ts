// Browser-owned storage: passwords are never saved to localStorage or our tables.
type PasswordCredentialConstructor = new (data: { id: string; password: string; name: string }) => Credential;

export function offerPasswordSave(email: string, password: string): void {
  const BrowserPasswordCredential = (window as Window & { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential;
  if (!window.isSecureContext || !BrowserPasswordCredential || !navigator.credentials?.store) return;
  try {
    const credential = new BrowserPasswordCredential({ id: email.trim(), password, name: 'Yizhe Start' });
    // The browser may decline or wait for a user's choice. Never block login on it.
    void navigator.credentials.store(credential).catch(() => {});
  } catch { /* Native form recognition still works if this optional API fails. */ }
}
