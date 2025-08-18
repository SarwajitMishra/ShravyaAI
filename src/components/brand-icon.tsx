
import Image from 'next/image';
import icon from '@/app/icon.png';

export function BrandIcon(props: { className?: string }) {
  return <Image src={icon} alt="Shravya AI Icon" width={32} height={32} priority {...props} />;
}
