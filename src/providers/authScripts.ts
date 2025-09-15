// Small JS snippets injected into the auth WebView for capturing and automating login
// NOTE: Keep these scripts self-contained and resilient to missing nodes.

import type { Credentials, CredentialsSelectors } from '../types';

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

export function buildCaptureOnSubmitScript(
  selectors: CredentialsSelectors
): string {
  const { usernameSelector, passwordSelector } = selectors;
  const uSel = usernameSelector ? esc(usernameSelector) : '';
  const pSel = esc(passwordSelector);
  // Attach listeners to common submit triggers and post credentials once
  return `(() => {
    try {
      if (window.__zkp2p_capture_bound) return true;
      window.__zkp2p_capture_bound = true;
      const getVals = () => {
        try {
          var u = null;
          try { u = ${uSel ? `document.querySelector("${uSel}")` : 'null'}; } catch {}
          const p = document.querySelector("${pSel}");
          if (!p) return null;
          const uname = u && u.value !== undefined ? (u.value || '') : '';
          const pwd = p && p.value !== undefined ? (p.value || '') : '';
          return { username: uname, password: pwd };
        } catch { return null; }
      };
      const send = () => {
        try {
          const vals = getVals();
          if (!vals) return;
          const msg = JSON.stringify({ type: 'credentialSubmit', username: vals.username, password: vals.password });
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(msg);
          // If a password field is present, signal that the auth form was submitted
          try {
            if (vals.password && String(vals.password).length > 0) {
              var submitted = JSON.stringify({ type: 'authFormSubmitted' });
              // @ts-ignore
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(submitted);
            }
          } catch {}
        } catch {}
      };
      const bind = (root) => {
        try {
          root.addEventListener('submit', () => setTimeout(send, 0), true);
          root.addEventListener('click', (e) => {
            const el = e.target;
            try {
              const btn = el && el.closest ? el.closest("button[type=\\"submit\\"]") : null;
              if (btn) setTimeout(send, 0);
            } catch {}
          }, true);
          return true;
        } catch { return false; }
      };
      bind(document);
      const mo = new MutationObserver(() => bind(document));
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    } catch {}
    return true;
  })();`;
}

export function buildAutoFillAndSubmitScript(params: {
  selectors: CredentialsSelectors;
  credentials: Credentials;
}): string {
  const { selectors, credentials } = params;
  const uSel = selectors.usernameSelector
    ? esc(selectors.usernameSelector)
    : '';
  const pSel = esc(selectors.passwordSelector);
  const sSel = selectors.submitSelector ? esc(selectors.submitSelector) : '';
  const nSel = selectors.nextSelector ? esc(selectors.nextSelector) : '';
  const username = esc(credentials.username ?? '');
  const password = esc(credentials.password);

  return `(() => {
    try {
      const find = (sel) => {
        try { return document.querySelector(sel); } catch { return null; }
      };
      const setVal = (el, val) => {
        if (!el) return;
        try {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch {}
      };
      const click = (el) => { try { el && el.click && el.click(); } catch {} };
      const attempt = () => {
        const u = ${uSel ? `find("${uSel}")` : 'null'};
        const p = find("${pSel}");
        // If password isn't present yet but we have username + next, advance the flow
        if (!p) {
          ${uSel ? `if (u && "${username}" !== "") setVal(u, "${username}");` : ''}
          ${nSel ? `const n = find("${nSel}"); if (n) { click(n); }` : ''}
          return false; // wait for password page
        }
        ${uSel ? `if (u && "${username}" !== "") setVal(u, "${username}");` : ''}
        setVal(p, "${password}");
        ${sSel ? `const s = find("${sSel}"); if (s) { click(s); } else { const f = (u && u.form) || (p && p.form); if (f && f.submit) try { f.requestSubmit ? f.requestSubmit() : f.submit(); } catch { f.submit && f.submit(); } }` : `const f = (u && u.form) || (p && p.form); if (f && f.submit) try { f.requestSubmit ? f.requestSubmit() : f.submit(); } catch { f.submit && f.submit(); }`}
        try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'authFormSubmitted' })); } catch {}
        return true;
      };
      if (attempt()) return true;
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (attempt() || tries > 50) clearInterval(timer);
      }, 100);
    } catch {}
    return true;
  })();`;
}
export function buildClickSelectorScript(selector: string): string {
  const sel = esc(selector);
  return `(() => { try { const el = document.querySelector("${sel}"); if (el && el.click) el.click(); } catch {} return true; })();`;
}

// (intentionally no two-factor DOM sniffing; rely on intercept or timeout)
