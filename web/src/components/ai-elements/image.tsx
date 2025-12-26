import { cn } from "@/lib/utils";
import type { Experimental_GeneratedImage } from "ai";

export type ImageProps = Experimental_GeneratedImage & {
  className?: string;
  alt?: string;
  url?: string;
};

export const Image = ({
  base64,
  uint8Array,
  mediaType,
  url,
  ...props
}: ImageProps) => {
  // Sanitize URL by removing newlines and spaces which can break data URIs
  const saneUrl = url ? url.replace(/\s+/g, '') : undefined;
  const imgSrc = saneUrl || `data:${mediaType};base64,${base64}`;
  return (
    <img
      {...props}
      alt={props.alt}
      className={cn(
        "h-auto max-w-full overflow-hidden rounded-md",
        props.className
      )}
      src={imgSrc}
    />
  );
};
