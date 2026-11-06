import Image from 'next/image'

/**
 * The image half of MediaSlot, in its own module so next/image is only
 * downloaded by a page that has an approved image to show. While every slot
 * is empty the landing ships none of it.
 */
export default function SlotImage({
  src,
  width,
  height,
  alt,
  sizes,
  priority,
  className,
}: {
  src: string
  width: number
  height: number
  alt: string
  sizes?: string
  priority: boolean
  className?: string
}) {
  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt={alt}
      sizes={sizes}
      priority={priority}
      unoptimized={/\.svg$/i.test(src)}
      className={className}
    />
  )
}
