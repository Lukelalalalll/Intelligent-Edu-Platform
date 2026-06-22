export const headers = () => {
  const result = new Headers();
  if (typeof document !== "undefined" && document.cookie) {
    result.set("cookie", document.cookie);
  }
  return result;
};
