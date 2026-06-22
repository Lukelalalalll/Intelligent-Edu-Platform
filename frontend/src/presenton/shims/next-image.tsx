import React, { forwardRef } from "react";

type NextImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
};

const Image = forwardRef<HTMLImageElement, NextImageProps>(function Image(
  { fill, style, src, alt, ...props },
  ref
) {
  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      style={
        fill
          ? {
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: props.objectFit || "cover",
              ...style,
            }
          : style
      }
      {...props}
    />
  );
});

export default Image;
