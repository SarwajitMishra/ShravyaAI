
import Image from 'next/image';
import brandIcon from '@/app/icon.png';
import type { SVGProps } from "react";

export function BrandIcon(props: { className?: string }) {
  return (
    <Image
      src={brandIcon}
      alt="Brand Icon"
      className={props.className}
      width={24}
      height={24}
      priority
    />
  );
}
