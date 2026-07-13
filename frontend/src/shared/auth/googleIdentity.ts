export type GoogleButtonText = 'signin_with' | 'signup_with' | 'continue_with' | 'signin';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleInitializeOptions {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleRenderButtonOptions {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: GoogleButtonText;
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
  logo_alignment?: 'left' | 'center';
}

interface GoogleAccountsIdApi {
  initialize: (options: GoogleInitializeOptions) => void;
  renderButton: (parent: HTMLElement, options: GoogleRenderButtonOptions) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsIdApi;
      };
    };
  }
}

let googleScriptPromise: Promise<void> | null = null;

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener(
        'error',
        () => {
          googleScriptPromise = null;
          reject(new Error('Failed to load Google Identity Services'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = 'true';
    script.onload = () => resolve();
    script.onerror = () => {
      googleScriptPromise = null;
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}
