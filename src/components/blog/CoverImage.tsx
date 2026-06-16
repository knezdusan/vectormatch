import Image from "next/image";

type CoverImageProps = {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
};

const DEFAULT_SIZES =
  "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

/**
 * Blog cover image. Renders with `next/image` and must live inside a positioned,
 * sized container (e.g. `relative aspect-video`).
 *
 * SVG sources cannot pass through the Next image optimizer unless
 * `dangerouslyAllowSVG` is enabled globally — which we intentionally avoid — so we
 * bypass optimization for SVG (e.g. placeholder covers). Raster covers (jpg/png/webp)
 * are optimized normally.
 */
export function CoverImage({
  src,
  alt,
  className,
  sizes = DEFAULT_SIZES,
  priority = false,
}: CoverImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      unoptimized={src.endsWith(".svg")}
      className={`object-cover${className ? ` ${className}` : ""}`}
    />
  );
}
