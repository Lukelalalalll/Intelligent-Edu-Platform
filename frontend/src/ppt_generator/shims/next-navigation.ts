import { useLocation, useNavigate } from "react-router-dom";
import {
  mapPptGeneratorHrefToAppRoute,
  normalizePptGeneratorPathname,
} from "@/ppt_generator/routing";

type NavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
};

const navigateToHref = (
  href: string,
  navigate: ReturnType<typeof useNavigate>,
  options?: NavigateOptions
) => {
  if (/^[a-z]+:\/\//i.test(href)) {
    if (options?.replace) {
      window.location.replace(href);
      return;
    }
    window.location.assign(href);
    return;
  }

  navigate(mapPptGeneratorHrefToAppRoute(href), {
    replace: options?.replace,
  });
};

export const useRouter = () => {
  const navigate = useNavigate();

  return {
    push: (href: string, options?: NavigateOptions) =>
      navigateToHref(href, navigate, options),
    replace: (href: string, options?: NavigateOptions) =>
      navigateToHref(href, navigate, { ...options, replace: true }),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
    prefetch: async () => undefined,
  };
};

export const usePathname = () => {
  const location = useLocation();
  return normalizePptGeneratorPathname(location.pathname);
};

export const useSearchParams = () => {
  const location = useLocation();
  return new URLSearchParams(location.search);
};

export const redirect = (href: string) => {
  window.location.replace(mapPptGeneratorHrefToAppRoute(href));
  throw new Error("redirect");
};

