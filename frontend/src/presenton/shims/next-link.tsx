import React, { forwardRef } from "react";
import { Link as RouterLink } from "react-router-dom";
import { mapPresentonHrefToAppRoute } from "@/presenton/routing";

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
};

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, prefetch: _prefetch, target, rel, ...props },
  ref
) {
  const mappedHref = mapPresentonHrefToAppRoute(href);
  const isExternal = /^[a-z]+:\/\//i.test(mappedHref);

  if (isExternal || target === "_blank") {
    return (
      <a
        ref={ref}
        href={mappedHref}
        target={target}
        rel={rel || (target === "_blank" ? "noreferrer" : undefined)}
        {...props}
      />
    );
  }

  return <RouterLink ref={ref} to={mappedHref} target={target} rel={rel} {...props} />;
});

export default Link;
