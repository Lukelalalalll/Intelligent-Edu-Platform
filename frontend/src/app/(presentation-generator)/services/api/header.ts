const readCookie = (name: string): string => {
  if (typeof document === "undefined") {
    return "";
  }

  const entry = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`));

  return entry ? decodeURIComponent(entry.split("=").slice(1).join("=")) : "";
};

const buildCsrfHeaders = (): Record<string, string> => {
  const csrfToken = readCookie("csrf_token");
  if (!csrfToken) {
    return {};
  }

  return { "X-CSRF-Token": csrfToken };
};

export const getHeader = (): Record<string, string> => {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...buildCsrfHeaders(),
  };
};

export const getHeaderForFormData = (): Record<string, string> => {
  return {
    Accept: "application/json",
    ...buildCsrfHeaders(),
  };
};

