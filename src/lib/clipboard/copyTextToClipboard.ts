export type CopyTextResult =
  | { ok: true; method: "clipboard" | "execCommand" }
  | { ok: false; method: "clipboard" | "execCommand"; detail: string };

function fallbackCopyText(text: string): CopyTextResult {
  let textarea: HTMLTextAreaElement | undefined;
  try {
    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    if (!document.execCommand("copy")) {
      return { ok: false, method: "execCommand", detail: "execCommand returned false" };
    }
    return { ok: true, method: "execCommand" };
  } catch (cause) {
    return {
      ok: false,
      method: "execCommand",
      detail: cause instanceof Error ? cause.message : "textarea fallback failed",
    };
  } finally {
    textarea?.remove();
  }
}

export async function copyTextToClipboard(text: string): Promise<CopyTextResult> {
  let clipboardFailure = "clipboard unavailable";

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: "clipboard" };
    }
  } catch (cause) {
    clipboardFailure = cause instanceof Error ? cause.message : "clipboard write failed";
  }

  const fallback = fallbackCopyText(text);
  if (fallback.ok) return fallback;

  return {
    ok: false,
    method: fallback.method,
    detail: `${clipboardFailure}; ${fallback.detail}`,
  };
}
